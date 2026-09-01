/**
 * Thin Meta Graph API client for the social publisher (Facebook Pages).
 * Plain fetch, no SDK.
 *
 * Product rule (Joseph, 2026-09-01): the only content-creating calls in this
 * file create SCHEDULED posts (published=false + scheduled_publish_time) that
 * Meta holds in Business Suite Planner for review and publishes itself.
 * There is deliberately no publish-now helper and no Instagram publishing
 * (IG has no scheduling API; it is scheduled by hand in Business Suite).
 *
 * Endpoint shapes were verified against the live docs on 2026-08-31
 * (docs/social-publisher.md has the citations):
 *   FB photo post      unpublished temporary /photos ×n then
 *                      POST /{page-id}/feed with published=false,
 *                      scheduled_publish_time and
 *                      attached_media[n]={"media_fbid":id}
 *   FB video           POST /{page-id}/videos  file_url, description,
 *                      published=false, scheduled_publish_time
 *   read-back          GET /{id}?fields=is_published|published,
 *                      scheduled_publish_time,permalink_url
 *   delete             DELETE /{id}  (held posts only; the caller checks)
 *
 * Rules: every call takes { token } explicitly; the token travels ONLY in the
 * Authorization: Bearer header (never the query string or body, so it can
 * never land in a Sentry span's http.query or a fetch breadcrumb) and is
 * never logged, never put in error messages. Errors are MetaApiError with
 * Meta's code / error_subcode / message so callers can tell a rate limit
 * (retry) from a bad token (stop).
 */

export const GRAPH_VERSION = 'v26.0'
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

// Read-after-write tolerance for scheduled_publish_time: Meta stores whole
// seconds, we send whole seconds, so anything beyond a minute is a real drift.
export const SCHEDULE_TOLERANCE_SECONDS = 60

export interface GraphErrorPayload {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
  error_user_msg?: string
  error_user_title?: string
  fbtrace_id?: string
}

export class MetaApiError extends Error {
  readonly code: number | null
  readonly subcode: number | null
  readonly type: string | null
  readonly httpStatus: number
  readonly fbtraceId: string | null
  readonly userMessage: string | null

  constructor(httpStatus: number, payload: GraphErrorPayload | null, fallback: string) {
    const base = payload?.message ?? fallback
    super(payload?.code != null ? `(#${payload.code}) ${base}` : base)
    this.name = 'MetaApiError'
    this.httpStatus = httpStatus
    this.code = payload?.code ?? null
    this.subcode = payload?.error_subcode ?? null
    this.type = payload?.type ?? null
    this.fbtraceId = payload?.fbtrace_id ?? null
    this.userMessage = payload?.error_user_msg ?? null
  }

  /** Worth retrying on a later cron run. */
  get transient(): boolean {
    return isTransientMetaError(this)
  }
}

/**
 * Scheduled post came back from Meta with a different publish time. `deleted`
 * says whether the best-effort cleanup removed it; when false the caller must
 * keep `postId` so the orphan can still be deleted from Meta later.
 */
export class MetaScheduleMismatchError extends Error {
  constructor(
    readonly postId: string,
    readonly expected: number,
    readonly actual: number | null,
    readonly deleted: boolean = false
  ) {
    super(
      `Meta stored scheduled_publish_time ${actual ?? 'null'} for post ${postId}, expected ${expected}${deleted ? '' : ' (and it could not be removed; delete it from Planner)'}`
    )
    this.name = 'MetaScheduleMismatchError'
  }
}

/**
 * "This object is gone" — a deleted post/video. Meta answers (#100) with
 * error_subcode 33 ("Unsupported get request. Object with ID ... does not
 * exist, cannot be loaded due to missing permissions, ...") or (#803). A bare
 * (#100) is Meta's generic invalid-parameter code (unknown field, bad
 * scheduled_publish_time, ...) and must NOT be read as "deleted".
 */
export function isMetaObjectMissing(err: unknown): boolean {
  if (!(err instanceof MetaApiError)) return false
  if (err.httpStatus === 404 || err.code === 803) return true
  return err.code === 100 && (err.subcode === 33 || /does not exist/i.test(err.message))
}

// Meta error codes that mean "try again later", not "this post is wrong".
//   1  unknown / API unknown        2  service temporarily unavailable
//   4  app request limit            17 user request limit
//   32 page request limit           613 custom rate limit
//   9007 / 2207027 media still processing
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 613, 9007])
const TRANSIENT_SUBCODES = new Set([2207027])

export function isTransientMetaError(err: unknown): boolean {
  if (err instanceof MetaApiError) {
    if (err.httpStatus >= 500) return true
    if (err.code != null && TRANSIENT_CODES.has(err.code)) return true
    if (err.subcode != null && TRANSIENT_SUBCODES.has(err.subcode)) return true
    return false
  }
  if (err instanceof MetaScheduleMismatchError) return false
  // Network-level failures (fetch threw) are transient by nature.
  return err instanceof TypeError
}

type Params = Record<string, string | number | boolean | undefined | null>

function encode(params: Params): URLSearchParams {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    out.set(k, typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v))
  }
  return out
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 200) }
  }
}

/**
 * One Graph call. The token rides ONLY in the Authorization header (Graph
 * accepts Bearer for page, user and app tokens), so neither the URL nor the
 * body ever carries it; the URL is never included in thrown errors.
 */
export async function graph<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token: string,
  params: Params = {}
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, '')}`)
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  const init: RequestInit = { method, headers }
  if (method === 'GET') {
    for (const [k, v] of encode(params)) url.searchParams.set(k, v)
  } else {
    init.body = encode(params).toString()
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  const res = await fetch(url.toString(), init)
  const data = await parseBody(res)
  const errorPayload =
    data && typeof data === 'object' && 'error' in data
      ? ((data as { error: GraphErrorPayload }).error ?? null)
      : null
  if (!res.ok || errorPayload) {
    throw new MetaApiError(res.status, errorPayload, `Meta ${method} ${redactPath(path)} failed (${res.status})`)
  }
  return data as T
}

/** Strip anything that could be a token from a path before it lands in a message. */
function redactPath(path: string): string {
  return path.replace(/access_token=[^&]+/g, 'access_token=***')
}

export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

// ─── Facebook Pages ──────────────────────────────────────────────────────────

export interface FbPhotoResult {
  /** The Page Post id — what Planner shows and what is_published is read from. */
  postId: string
  photoIds: string[]
}

export interface FbScheduledResult extends FbPhotoResult {
  scheduledPublishTime: number
}

interface PhotosResponse {
  id: string
  post_id?: string
}

/**
 * Create a Meta-side SCHEDULED photo post (published=false +
 * scheduled_publish_time). It appears in Business Suite Planner and Meta
 * publishes it itself. Reads the post back and throws
 * MetaScheduleMismatchError (after a best-effort delete) if Meta stored a
 * different time, so a wrong-time post never lingers silently.
 */
export async function fbSchedulePhotoPost(input: {
  token: string
  pageId: string
  imageUrls: string[]
  caption: string
  scheduledAt: Date
}): Promise<FbScheduledResult> {
  const { token, pageId, imageUrls, caption, scheduledAt } = input
  if (imageUrls.length === 0) throw new Error('fbSchedulePhotoPost: no images')
  const when = toUnixSeconds(scheduledAt)

  // One code path for 1..N images: unpublished temporary photos attached to a
  // scheduled /feed post. Meta's single-photo shortcut (POST /photos with
  // scheduled_publish_time) answers with only the photo id and no post_id
  // (observed live 2026-08-31 on the Skooped page), which leaves nothing to
  // read back, so it is not used.
  const photoIds: string[] = []
  for (const url of imageUrls) {
    // temporary=true is required for photos that go into a scheduled post.
    const res = await graph<PhotosResponse>('POST', `${pageId}/photos`, token, {
      url,
      published: false,
      temporary: true,
    })
    photoIds.push(res.id)
  }
  const feed = await graph<{ id: string }>('POST', `${pageId}/feed`, token, {
    message: caption,
    published: false,
    scheduled_publish_time: when,
    ...attachedMedia(photoIds),
  })
  if (!feed.id) {
    for (const id of photoIds) await bestEffortDelete(token, id)
    throw new MetaApiError(200, { message: 'Facebook did not return a post id for the scheduled post', code: 100 }, 'no post id')
  }
  const postId = feed.id

  const actual = await verifyScheduledTime({ token, objectId: postId, kind: 'post', expected: when })
  return { postId, photoIds, scheduledPublishTime: actual }
}

/**
 * Read a just-scheduled object back and confirm Meta stored our time.
 *   - stored time within tolerance → return it
 *   - confirmed mismatch → best-effort delete, throw MetaScheduleMismatchError
 *     (carrying whether the delete worked, so the caller can keep the id)
 *   - transient read-back failure (rate limit, 5xx, network) → the create
 *     call already carried scheduled_publish_time, so return the expected
 *     time unverified rather than delete a post that is probably right
 *   - any other read-back failure → best-effort delete, rethrow
 */
async function verifyScheduledTime(input: {
  token: string
  objectId: string
  kind: 'post' | 'video'
  expected: number
}): Promise<number> {
  const { token, objectId, kind, expected } = input
  let actual: number | null
  try {
    actual = (await fbGetPost({ token, postId: objectId, kind })).scheduledPublishTime
  } catch (err) {
    if (isTransientMetaError(err)) return expected
    await bestEffortDelete(token, objectId)
    throw err
  }
  if (actual == null || Math.abs(actual - expected) > SCHEDULE_TOLERANCE_SECONDS) {
    const deleted = await bestEffortDelete(token, objectId)
    throw new MetaScheduleMismatchError(objectId, expected, actual, deleted)
  }
  return actual
}

async function bestEffortDelete(token: string, objectId: string): Promise<boolean> {
  try {
    await fbDeletePost({ token, postId: objectId })
    return true
  } catch (err) {
    return isMetaObjectMissing(err)
  }
}

function attachedMedia(photoIds: string[]): Params {
  const out: Params = {}
  photoIds.forEach((id, i) => {
    out[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })
  })
  return out
}

/**
 * Create a Meta-side SCHEDULED video on the Page from a public URL. Meta
 * pulls the file itself (file_url); no transcoding on our side in v1. The id
 * returned is a VIDEO node id (read it back with kind: 'video'). The video is
 * read back like a scheduled photo post and removed on a mismatch. There is
 * no unscheduled variant: `scheduledAt` is required.
 */
export async function fbScheduleVideo(input: {
  token: string
  pageId: string
  videoUrl: string
  description: string
  scheduledAt: Date
}): Promise<{ videoId: string; scheduledPublishTime: number }> {
  const { token, pageId, videoUrl, description, scheduledAt } = input
  const when = toUnixSeconds(scheduledAt)
  const res = await graph<{ id: string }>('POST', `${pageId}/videos`, token, {
    file_url: videoUrl,
    description,
    published: false,
    scheduled_publish_time: when,
  })
  if (!res.id) {
    throw new MetaApiError(200, { message: 'Facebook did not return an id for the scheduled video', code: 100 }, 'no video id')
  }
  const actual = await verifyScheduledTime({ token, objectId: res.id, kind: 'video', expected: when })
  return { videoId: res.id, scheduledPublishTime: actual }
}

export interface FbPostState {
  id: string
  isPublished: boolean | null
  scheduledPublishTime: number | null
  permalinkUrl: string | null
}

/** What node type an id names, so the right field set is requested. */
export type FbObjectKind = 'post' | 'video'

/**
 * Read a Page Post's (or Video's) publish state — the schedule read-back and
 * the cron's went-live check. A Page Post exposes `is_published`; a Video
 * node exposes `published` instead and answers (#100) "nonexisting field" if
 * asked for is_published, so the field set is chosen by `kind`.
 */
export async function fbGetPost(input: {
  token: string
  postId: string
  kind?: FbObjectKind
}): Promise<FbPostState> {
  const kind = input.kind ?? 'post'
  const publishedField = kind === 'video' ? 'published' : 'is_published'
  const res = await graph<{
    id: string
    is_published?: boolean
    published?: boolean
    scheduled_publish_time?: number | string
    permalink_url?: string
  }>('GET', input.postId, input.token, {
    fields: `id,${publishedField},scheduled_publish_time,permalink_url`,
  })
  const spt = res.scheduled_publish_time
  return {
    id: res.id,
    isPublished: (kind === 'video' ? res.published : res.is_published) ?? null,
    scheduledPublishTime:
      spt == null ? null : typeof spt === 'number' ? spt : normaliseTimestamp(spt),
    permalinkUrl: res.permalink_url ?? null,
  }
}

/** Meta sometimes returns ISO 8601 for time fields; normalise to unix seconds. */
function normaliseTimestamp(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value)
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : Math.floor(t / 1000)
}

export async function fbDeletePost(input: { token: string; postId: string }): Promise<void> {
  await graph<{ success?: boolean }>('DELETE', input.postId, input.token)
}

// ─── Instagram (via Facebook Login) ──────────────────────────────────────────

/** IG user id for a Page: business-conversion link first, page-settings link second. */
export async function igResolveUserId(input: { token: string; pageId: string }): Promise<string | null> {
  const res = await graph<{
    instagram_business_account?: { id: string }
    connected_instagram_account?: { id: string }
  }>('GET', input.pageId, input.token, {
    fields: 'instagram_business_account,connected_instagram_account',
  })
  return res.instagram_business_account?.id ?? res.connected_instagram_account?.id ?? null
}

// ─── Token inspection ────────────────────────────────────────────────────────

export interface DebugTokenInfo {
  isValid: boolean
  type: string | null
  appId: string | null
  expiresAt: Date | null
  dataAccessExpiresAt: Date | null
  scopes: string[]
  granularScopes: Array<{ scope: string; targetIds?: string[] }>
  profileId: string | null
  error: string | null
}

/** GET /debug_token with an app token (app_id|app_secret). Never logs either. */
export async function debugToken(input: {
  token: string
  appId: string
  appSecret: string
}): Promise<DebugTokenInfo> {
  const appToken = `${input.appId}|${input.appSecret}`
  const res = await graph<{
    data?: {
      is_valid?: boolean
      type?: string
      app_id?: string
      expires_at?: number
      data_access_expires_at?: number
      scopes?: string[]
      granular_scopes?: Array<{ scope: string; target_ids?: string[] }>
      profile_id?: string
      error?: { message?: string }
    }
  }>('GET', 'debug_token', appToken, { input_token: input.token })
  const d = res.data ?? {}
  const toDate = (s?: number) => (s && s > 0 ? new Date(s * 1000) : null)
  return {
    isValid: d.is_valid ?? false,
    type: d.type ?? null,
    appId: d.app_id ?? null,
    expiresAt: toDate(d.expires_at),
    dataAccessExpiresAt: toDate(d.data_access_expires_at),
    scopes: d.scopes ?? [],
    granularScopes: (d.granular_scopes ?? []).map((g) => ({ scope: g.scope, targetIds: g.target_ids })),
    profileId: d.profile_id ?? null,
    error: d.error?.message ?? null,
  }
}
