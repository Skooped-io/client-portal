/**
 * Social publisher queue: the pure part.
 *
 * Everything here is deterministic and free of I/O so the review gate, the
 * caption limits, and the state machine are unit-testable without Supabase or
 * Meta. Routes and the cron call these and do the side effects.
 *
 * Product rule (Joseph, 2026-09-01, extended to Google 2026-09-03): vendor
 * APIs are only ever used to SCHEDULE posts. Nothing is published live from
 * Skooped. Approve creates a vendor-held scheduled post — Facebook via
 * published=false + scheduled_publish_time, Google via LocalPost.scheduledTime
 * (read-back state SCHEDULED) — Joseph reviews, edits or deletes it in
 * Business Suite Planner / Business Profile Manager, and the vendor publishes
 * it at the chosen time. Instagram has no scheduling API and is therefore not
 * handled here at all: it is scheduled by hand in Business Suite and the file
 * marked posted on /m.
 */

// 'instagram' remains in the type because rows from the 8/31 design may still
// exist; they are shown read-only and only Delete applies to them.
export type Platform = 'facebook' | 'instagram' | 'google'
export type PostType = 'image' | 'carousel' | 'video'
export type PostStatus =
  | 'draft'
  | 'approved' // legacy (8/31 design): never written anymore; unapprove/delete only
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled'

export const PLATFORMS: readonly Platform[] = ['facebook', 'instagram', 'google'] as const
/** The platforms the publisher can queue for: both vendors can HOLD a scheduled post. */
export const PUBLISH_PLATFORMS: readonly Platform[] = ['facebook', 'google'] as const
export const POST_STATUSES: readonly PostStatus[] = [
  'draft',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
] as const

export interface MediaItem {
  path: string
  content_type: string
}

export interface DerivedMediaItem {
  path: string
  public_url: string
}

/**
 * Mirrors the social_posts row (supabase/migrations/20260901000000_social_publisher.sql
 * + 20260903000000_social_posts_google.sql).
 */
export interface SocialPost {
  id: string
  org_id: string
  platform: Platform
  post_type: PostType
  caption: string | null
  media: MediaItem[]
  derived_media: DerivedMediaItem[] | null
  scheduled_at: string | null
  /** Google Business CTA button (google rows only). */
  cta_type: CtaType | null
  cta_url: string | null
  approved_at: string | null
  published_at: string | null
  platform_post_id: string | null
  /** Legacy column from the 8/31 Instagram path; never written anymore. */
  ig_container_id: string | null
  status: PostStatus
  last_error: string | null
  attempts: number
  group_id: string | null
  created_at: string
  updated_at: string
}

export interface DraftPost {
  platform: Platform
  post_type: PostType
  caption: string | null
  media: MediaItem[]
  scheduled_at: string
  cta_type: CtaType | null
  cta_url: string | null
  status: 'draft'
  group_id: string
}

// Meta limits (verified against the live docs 2026-08-31, see
// docs/social-publisher.md). Google documents no max for a local post summary
// (1,500 chars is third-party folklore), so google keeps Facebook's cap.
export const CAPTION_LIMITS: Record<Platform, number> = {
  facebook: 63206,
  instagram: 2200,
  google: 63206,
}
export const IG_MAX_HASHTAGS = 30
export const IG_MAX_MENTIONS = 20
export const CAROUSEL_MIN = 2
export const CAROUSEL_MAX = 10

// Google Business call-to-action buttons (v4 LocalPost.callToAction).
// CALL uses the business's listed phone number; every other type needs a URL.
export const CTA_TYPES = ['CALL', 'LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP'] as const
export type CtaType = (typeof CTA_TYPES)[number]
export const CTA_URL_MAX = 512

export function isCtaType(value: unknown): value is CtaType {
  return typeof value === 'string' && (CTA_TYPES as readonly string[]).includes(value)
}

/**
 * CTA rules for a google row: no CTA is fine; CALL needs (and keeps) no URL;
 * every other type needs an https URL ≤ CTA_URL_MAX chars. `required` is true
 * at approve time; a draft save ({ required: false }) may leave the URL empty
 * (a malformed non-empty URL is still refused).
 */
export function validateCta(
  ctaType: unknown,
  ctaUrl: unknown,
  options: { required?: boolean } = {}
): Result<{ cta_type: CtaType | null; cta_url: string | null }> {
  const required = options.required ?? true
  if (ctaType == null || ctaType === '') {
    return { ok: true, value: { cta_type: null, cta_url: null } }
  }
  if (!isCtaType(ctaType)) return { ok: false, error: 'Unknown button type' }
  if (ctaType === 'CALL') {
    // CALL dials the listed number; a URL would be silently dropped by Google.
    return { ok: true, value: { cta_type: 'CALL', cta_url: null } }
  }
  if (typeof ctaUrl !== 'string' || ctaUrl.trim().length === 0) {
    if (!required) return { ok: true, value: { cta_type: ctaType, cta_url: null } }
    return { ok: false, error: 'This button needs a link — add an https:// URL' }
  }
  const url = ctaUrl.trim()
  if (url.length > CTA_URL_MAX) {
    return { ok: false, error: `Button link is ${url.length} characters; the limit is ${CTA_URL_MAX}` }
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: 'Button link must be a full https:// URL' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Button link must start with https://' }
  }
  return { ok: true, value: { cta_type: ctaType, cta_url: url } }
}

// The only scheduling window, measured from the moment the Meta call is made:
// Facebook holds a scheduled post 20 minutes – 29 days out. Meta documents
// 10 minutes – 30 days, but the Help Center and real (#100) "scheduled publish
// time is invalid" errors put the effective floor at ~20 minutes and the
// ceiling at 29 days, so both edges carry a margin. Anything outside the
// window is refused: there is no publish-now and no cron fallback, because
// nothing may reach Meta except as a scheduled post Joseph can still review.
// Media prep can take tens of seconds, so callers compute the mode AFTER
// preparing media, with a fresh `now`.
export const FB_NATIVE_MIN_MS = 20 * 60 * 1000
export const FB_NATIVE_MAX_MS = 29 * 24 * 60 * 60 * 1000

export const OUT_OF_WINDOW_MESSAGE =
  'Pick a time between 20 minutes and 29 days from now — posts are always scheduled for your review in Business Suite, never posted immediately'

// Google's own scheduledTime window is undocumented; the one hold window
// (20 min – 29 days) applies to both vendors until Google's limits are
// observed on the first real try (design note 2026-09-01).
export const GOOGLE_OUT_OF_WINDOW_MESSAGE =
  'Pick a time between 20 minutes and 29 days from now — posts are always scheduled for your review in Business Profile Manager, never posted immediately'

export function outOfWindowMessage(platform: Platform): string {
  return platform === 'google' ? GOOGLE_OUT_OF_WINDOW_MESSAGE : OUT_OF_WINDOW_MESSAGE
}

export const INSTAGRAM_NOT_SUPPORTED_MESSAGE =
  'Instagram has no scheduling API — schedule it by hand in Business Suite, then Mark posted here'

export const GOOGLE_NO_VIDEO_MESSAGE =
  'Google Business posts take one photo — no video. Queue the video for Facebook only'

// A row still 'publishing' this long after its last write was claimed by an
// approve request that has since been killed (route cap 120 s). The cron
// sweeps it to 'failed' so Retry appears on /m.
export const STALE_PUBLISHING_MS = 15 * 60 * 1000

export const BUSINESS_TIMEZONE = 'America/Chicago'

export type ScheduleMode = 'fb-native' | 'out-of-window'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime'])

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value)
}

export function isPostStatus(value: unknown): value is PostStatus {
  return typeof value === 'string' && (POST_STATUSES as readonly string[]).includes(value)
}

export function isImageType(contentType: string): boolean {
  return IMAGE_TYPES.has(contentType)
}

export function isVideoType(contentType: string): boolean {
  return VIDEO_TYPES.has(contentType)
}

/**
 * What kind of post a selection of files makes, per platform.
 *
 * Facebook (default): images become a single photo or a 2–10 carousel; one
 * video is a video post. Mixed video+images and multiple videos are rejected
 * outright: Meta has no mixed-media single post, and one clip per post is the
 * v1 rule.
 *
 * Google: the localPosts API is PHOTO-only, one photo in practice — any image
 * selection is an 'image' post (only the FIRST image is sent) and any video
 * is refused with GOOGLE_NO_VIDEO_MESSAGE.
 */
export function mediaKind(files: MediaItem[], platform: Platform = 'facebook'): Result<PostType> {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, error: 'Select at least one file' }
  }
  let images = 0
  let videos = 0
  for (const f of files) {
    if (IMAGE_TYPES.has(f.content_type)) images += 1
    else if (VIDEO_TYPES.has(f.content_type)) videos += 1
    else return { ok: false, error: `Unsupported file type: ${f.content_type}` }
  }
  if (platform === 'google') {
    if (videos > 0) return { ok: false, error: GOOGLE_NO_VIDEO_MESSAGE }
    return { ok: true, value: 'image' }
  }
  if (videos > 0 && images > 0) {
    return { ok: false, error: 'Mixing video and photos in one post is not supported. Queue them separately' }
  }
  if (videos > 1) {
    return { ok: false, error: 'One video per post. Queue each clip separately' }
  }
  if (videos === 1) return { ok: true, value: 'video' }
  if (images === 1) return { ok: true, value: 'image' }
  if (images > CAROUSEL_MAX) {
    return { ok: false, error: `A carousel holds at most ${CAROUSEL_MAX} photos` }
  }
  return { ok: true, value: 'carousel' }
}

/**
 * Wall-clock 09:00 tomorrow in the business timezone, as a UTC instant.
 * Default for new drafts so a queued post never silently means "now".
 */
export function defaultScheduleAt(now: Date, timeZone: string = BUSINESS_TIMEZONE): Date {
  const parts = zonedParts(now, timeZone)
  // Tomorrow's civil date in the zone; Date.UTC normalises day overflow.
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day + 1, 9, 0, 0)
  const offset = zoneOffsetMs(new Date(guess), timeZone)
  return new Date(guess - offset)
}

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const out: Record<string, number> = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  }
}

/** Offset of `timeZone` from UTC at `date`, in ms (negative west of UTC). */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/**
 * One draft per platform for one "Queue for posting" tap — any non-empty
 * subset of PUBLISH_PLATFORMS (facebook, google); the rows share `group_id`.
 * A google draft keeps only the FIRST image (Google posts carry one photo)
 * and seeds the CTA picker's default (Learn more; the URL is filled on the
 * card before approve). Caller supplies the group id (randomUUID) to keep
 * this pure.
 */
export function buildDraftPosts(
  selection: MediaItem[],
  platforms: unknown,
  now: Date,
  groupId: string
): Result<DraftPost[]> {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return { ok: false, error: 'Pick at least one platform' }
  }
  const unique: Platform[] = []
  for (const p of platforms) {
    if (!isPlatform(p)) return { ok: false, error: 'Unknown platform' }
    if (!(PUBLISH_PLATFORMS as readonly string[]).includes(p)) {
      return { ok: false, error: `Only Facebook and Google Business can be queued here. ${INSTAGRAM_NOT_SUPPORTED_MESSAGE}` }
    }
    if (!unique.includes(p)) unique.push(p)
  }

  const scheduledAt = defaultScheduleAt(now).toISOString()
  const media = selection.map((f) => ({ path: f.path, content_type: f.content_type }))
  const drafts: DraftPost[] = []
  for (const platform of unique) {
    const kind = mediaKind(selection, platform)
    if (!kind.ok) return kind
    const google = platform === 'google'
    drafts.push({
      platform,
      post_type: kind.value,
      caption: null,
      media: google ? media.slice(0, 1) : media,
      scheduled_at: scheduledAt,
      cta_type: google ? 'LEARN_MORE' : null,
      cta_url: null,
      status: 'draft',
      group_id: groupId,
    })
  }
  return { ok: true, value: drafts }
}

export function countHashtags(text: string): number {
  const matches = text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)
  return matches ? matches.length : 0
}

/** Word-start @mentions (the IG caption parameter allows 20 @ tags). */
export function countMentions(text: string): number {
  const matches = text.match(/(^|\s)@[\p{L}\p{N}_.]+/gu)
  return matches ? matches.length : 0
}

/**
 * Caption rules per platform. Returns the cleaned caption (control chars
 * other than newlines/tabs stripped, trimmed). `required` is true at approve
 * time; an in-progress draft may be saved empty.
 */
export function validateCaption(
  caption: unknown,
  platform: Platform,
  options: { required?: boolean } = {}
): Result<string> {
  const required = options.required ?? true
  if (caption == null) caption = ''
  if (typeof caption !== 'string') return { ok: false, error: 'Caption must be text' }
  const cleaned = caption
    .replace(/\r\n/g, '\n')
    .replace(/[^\P{Cc}\n\t]+/gu, '')
    .trim()
  if (cleaned.length === 0) {
    return required ? { ok: false, error: 'Write a caption before approving' } : { ok: true, value: '' }
  }
  const limit = CAPTION_LIMITS[platform]
  if (cleaned.length > limit) {
    const label = platform === 'instagram' ? 'Instagram' : platform === 'google' ? 'Google Business' : 'Facebook'
    return {
      ok: false,
      error: `Caption is ${cleaned.length.toLocaleString('en-US')} characters; ${label} allows ${limit.toLocaleString('en-US')}`,
    }
  }
  if (platform === 'instagram') {
    const tags = countHashtags(cleaned)
    if (tags > IG_MAX_HASHTAGS) {
      return { ok: false, error: `Instagram allows ${IG_MAX_HASHTAGS} hashtags; this caption has ${tags}` }
    }
    const mentions = countMentions(cleaned)
    if (mentions > IG_MAX_MENTIONS) {
      return { ok: false, error: `Instagram allows ${IG_MAX_MENTIONS} @mentions; this caption has ${mentions}` }
    }
  }
  return { ok: true, value: cleaned }
}

/**
 * Parse a scheduled_at from the client (ISO string with an explicit offset,
 * or null). An offset-less value like `2026-09-02T09:00` (what a raw
 * datetime-local input emits) would be read as UTC on the server and shift a
 * 9:00 Central post to 4:00, so it is refused at the boundary.
 */
export function parseScheduledAt(raw: unknown): Result<Date | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'Invalid schedule time' }
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    return { ok: false, error: 'Schedule time must include a timezone offset' }
  }
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return { ok: false, error: 'Invalid schedule time' }
  return { ok: true, value: new Date(t) }
}

/**
 * Whether an approved post can be handed to the vendor as a scheduled post
 * (one hold window for both Facebook and Google).
 *   fb-native      20 min – 29 days out: the vendor holds the scheduled post
 *   out-of-window  no time, past, under 20 min, or beyond 29 days: refused
 *                  with outOfWindowMessage(platform). Never published
 *                  immediately, never left for a cron.
 */
export function scheduleMode(scheduledAt: Date | null, now: Date): ScheduleMode {
  if (!scheduledAt) return 'out-of-window'
  const delta = scheduledAt.getTime() - now.getTime()
  if (delta >= FB_NATIVE_MIN_MS && delta <= FB_NATIVE_MAX_MS) return 'fb-native'
  return 'out-of-window'
}

export type PostEvent =
  | 'update' // caption / schedule edit
  | 'approve' // Joseph's review gate
  | 'fb_scheduled' // the vendor (Meta or Google) accepted and holds the scheduled post
  | 'unapprove' // back to draft before it goes live
  | 'published' // the cron saw Meta publish the held post
  | 'fail'
  | 'delete'

const TRANSITIONS: Record<PostEvent, Partial<Record<PostStatus, PostStatus>>> = {
  update: { draft: 'draft', failed: 'draft' },
  // The approve route claims straight into 'publishing' (compare-and-swap)
  // before the Meta scheduling call, so a crash mid-call leaves a visible
  // 'publishing' row (swept to 'failed' after 15 min) rather than a draft
  // that could be approved a second time. 'approved' as a resting state is
  // legacy; this event only gates which rows may be approved.
  approve: { draft: 'approved', failed: 'approved' },
  fb_scheduled: { approved: 'scheduled', publishing: 'scheduled' },
  unapprove: { approved: 'draft', scheduled: 'draft' },
  published: { scheduled: 'published' },
  fail: { publishing: 'failed' },
  delete: { draft: 'cancelled', failed: 'cancelled', approved: 'cancelled', scheduled: 'cancelled' },
}

const EVENT_LABELS: Record<PostEvent, string> = {
  update: 'edit',
  approve: 'approve',
  fb_scheduled: 'schedule',
  unapprove: 'unapprove',
  published: 'mark published',
  fail: 'fail',
  delete: 'delete',
}

/**
 * State machine. Returns the next status or a human-readable refusal.
 * 'publishing' is deliberately a dead end for user events: a row that is
 * mid-schedule can only be finished by the request that claimed it (or the
 * stale sweep).
 */
export function transition(
  post: Pick<SocialPost, 'status'>,
  event: PostEvent
): Result<PostStatus> {
  const next = TRANSITIONS[event]?.[post.status]
  if (!next) {
    return { ok: false, error: `Cannot ${EVENT_LABELS[event]} a post that is ${post.status}` }
  }
  return { ok: true, value: next }
}

/**
 * Which user buttons the /m page shows for a row. Instagram rows (legacy)
 * are read-only apart from Delete: nothing can be scheduled for them.
 */
export function allowedActions(post: Pick<SocialPost, 'status' | 'platform'>): {
  edit: boolean
  approve: boolean
  unapprove: boolean
  delete: boolean
} {
  const publishable = (PUBLISH_PLATFORMS as readonly string[]).includes(post.platform)
  return {
    edit: publishable && transition(post, 'update').ok,
    approve: publishable && transition(post, 'approve').ok,
    unapprove: publishable && transition(post, 'unapprove').ok,
    delete: transition(post, 'delete').ok,
  }
}
