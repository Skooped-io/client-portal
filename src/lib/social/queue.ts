/**
 * Social publisher queue: the pure part.
 *
 * Everything here is deterministic and free of I/O so the review gate, the
 * caption limits, and the state machine are unit-testable without Supabase or
 * Meta. Routes and the cron call these and do the side effects.
 *
 * Product rule (Joseph, 2026-08-31): nothing is published without his
 * approval. A row is created as 'draft', edited, and only an explicit
 * 'approve' event moves it toward Meta.
 */

export type Platform = 'facebook' | 'instagram'
export type PostType = 'image' | 'carousel' | 'video'
export type PostStatus =
  | 'draft'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled'

export const PLATFORMS: readonly Platform[] = ['facebook', 'instagram'] as const
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

/** Mirrors the social_posts row (supabase/migrations/20260901000000_social_publisher.sql). */
export interface SocialPost {
  id: string
  org_id: string
  platform: Platform
  post_type: PostType
  caption: string | null
  media: MediaItem[]
  derived_media: DerivedMediaItem[] | null
  scheduled_at: string | null
  approved_at: string | null
  published_at: string | null
  platform_post_id: string | null
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
  status: 'draft'
  group_id: string
}

// Meta limits (verified against the live docs 2026-08-31, see docs/social-publisher.md).
export const CAPTION_LIMITS: Record<Platform, number> = {
  facebook: 63206,
  instagram: 2200,
}
export const IG_MAX_HASHTAGS = 30
export const CAROUSEL_MIN = 2
export const CAROUSEL_MAX = 10

// Facebook native scheduling window: 10 minutes to 30 days from the API call
// (the /feed reference says 75 days but the Pages guide and real-world (#100)
// errors say 30). Anything closer than 10 minutes publishes immediately;
// anything further than 30 days falls back to our cron.
export const PUBLISH_NOW_WINDOW_MS = 10 * 60 * 1000
export const FB_NATIVE_MAX_MS = 30 * 24 * 60 * 60 * 1000

// Transient Meta failures retry this many times before the row parks in 'failed'.
export const MAX_ATTEMPTS = 3

export const BUSINESS_TIMEZONE = 'America/Chicago'

export type ScheduleMode = 'fb-native' | 'publish-now' | 'cron'

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
 * What kind of post a selection of files makes. Images become a single photo
 * or a 2–10 carousel; one video is a video post (FB video / IG reel). Mixed
 * video+images and multiple videos are rejected outright: Meta has no
 * mixed-media single post that both platforms accept, and one clip per post
 * is the v1 rule.
 */
export function mediaKind(files: MediaItem[]): Result<PostType> {
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
 * One draft per platform for one "Queue for posting" tap. All copies share
 * group_id so the queue can show them as one action. Caller supplies the
 * group id (randomUUID) to keep this pure.
 */
export function buildDraftPosts(
  selection: MediaItem[],
  platforms: unknown,
  now: Date,
  groupId: string
): Result<DraftPost[]> {
  const kind = mediaKind(selection)
  if (!kind.ok) return kind

  if (!Array.isArray(platforms) || platforms.length === 0) {
    return { ok: false, error: 'Pick Facebook, Instagram, or both' }
  }
  const unique: Platform[] = []
  for (const p of platforms) {
    if (!isPlatform(p)) return { ok: false, error: 'Unknown platform' }
    if (!unique.includes(p)) unique.push(p)
  }

  const scheduledAt = defaultScheduleAt(now).toISOString()
  const media = selection.map((f) => ({ path: f.path, content_type: f.content_type }))
  return {
    ok: true,
    value: unique.map((platform) => ({
      platform,
      post_type: kind.value,
      caption: null,
      media,
      scheduled_at: scheduledAt,
      status: 'draft',
      group_id: groupId,
    })),
  }
}

export function countHashtags(text: string): number {
  const matches = text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)
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
    return {
      ok: false,
      error: `Caption is ${cleaned.length.toLocaleString('en-US')} characters; ${platform === 'instagram' ? 'Instagram' : 'Facebook'} allows ${limit.toLocaleString('en-US')}`,
    }
  }
  if (platform === 'instagram') {
    const tags = countHashtags(cleaned)
    if (tags > IG_MAX_HASHTAGS) {
      return { ok: false, error: `Instagram allows ${IG_MAX_HASHTAGS} hashtags; this caption has ${tags}` }
    }
  }
  return { ok: true, value: cleaned }
}

/** Parse a scheduled_at from the client (ISO string or null). */
export function parseScheduledAt(raw: unknown): Result<Date | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'Invalid schedule time' }
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return { ok: false, error: 'Invalid schedule time' }
  return { ok: true, value: new Date(t) }
}

/**
 * How an approved post reaches the platform.
 *   publish-now  scheduled_at missing, past, or under 10 minutes out
 *   fb-native    Facebook, 10 min – 30 days out: Meta holds the scheduled post
 *   cron         Instagram at any future time; Facebook past the 30-day window
 */
export function scheduleMode(scheduledAt: Date | null, now: Date, platform: Platform): ScheduleMode {
  if (!scheduledAt) return 'publish-now'
  const delta = scheduledAt.getTime() - now.getTime()
  if (delta < PUBLISH_NOW_WINDOW_MS) return 'publish-now'
  if (platform === 'facebook' && delta <= FB_NATIVE_MAX_MS) return 'fb-native'
  return 'cron'
}

/** Cron pick predicate: approved and its time has come (or it never had one). */
export function isDue(post: Pick<SocialPost, 'status' | 'scheduled_at'>, now: Date): boolean {
  if (post.status !== 'approved') return false
  if (!post.scheduled_at) return true
  const t = Date.parse(post.scheduled_at)
  return !Number.isNaN(t) && t <= now.getTime()
}

export type PostEvent =
  | 'update' // caption / schedule edit
  | 'approve' // Joseph's review gate
  | 'fb_scheduled' // Meta accepted the scheduled post
  | 'unapprove' // back to draft before it goes live
  | 'claim' // cron compare-and-swap
  | 'published'
  | 'fail'
  | 'retry' // transient failure, attempts remain
  | 'delete'

const TRANSITIONS: Record<PostEvent, Partial<Record<PostStatus, PostStatus>>> = {
  update: { draft: 'draft', failed: 'draft' },
  approve: { draft: 'approved', failed: 'approved' },
  fb_scheduled: { approved: 'scheduled' },
  unapprove: { approved: 'draft', scheduled: 'draft' },
  claim: { approved: 'publishing' },
  published: { publishing: 'published', scheduled: 'published' },
  fail: { publishing: 'failed', scheduled: 'failed' },
  retry: { publishing: 'approved' },
  delete: { draft: 'cancelled', failed: 'cancelled', approved: 'cancelled', scheduled: 'cancelled' },
}

const EVENT_LABELS: Record<PostEvent, string> = {
  update: 'edit',
  approve: 'approve',
  fb_scheduled: 'schedule',
  unapprove: 'unapprove',
  claim: 'claim',
  published: 'mark published',
  fail: 'fail',
  retry: 'retry',
  delete: 'delete',
}

/**
 * State machine. Returns the next status or a human-readable refusal.
 * 'publishing' is deliberately a dead end for user events: a row that is
 * mid-publish can only be finished by the cron that claimed it.
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

/** After a publish failure: retry (back to approved) or park in failed. */
export function failureOutcome(
  post: Pick<SocialPost, 'status' | 'attempts'>,
  transient: boolean
): Result<PostStatus> {
  if (transient && post.attempts < MAX_ATTEMPTS) return transition(post, 'retry')
  return transition(post, 'fail')
}

/** Which user buttons the /m page shows for a row. */
export function allowedActions(post: Pick<SocialPost, 'status'>): {
  edit: boolean
  approve: boolean
  unapprove: boolean
  delete: boolean
} {
  return {
    edit: transition(post, 'update').ok,
    approve: transition(post, 'approve').ok,
    unapprove: transition(post, 'unapprove').ok,
    delete: transition(post, 'delete').ok,
  }
}
