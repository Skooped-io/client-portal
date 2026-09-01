/**
 * Thin Meta Graph API client for the social publisher (Facebook Pages +
 * Instagram via Facebook Login). Plain fetch, no SDK.
 *
 * Endpoint shapes were verified against the live docs on 2026-08-31
 * (docs/social-publisher.md has the citations):
 *   FB single photo    POST /{page-id}/photos  url, caption, published,
 *                      scheduled_publish_time  → { id, post_id }
 *   FB multi photo     unpublished /photos ×n (temporary=true when the post
 *                      is scheduled) then POST /{page-id}/feed with
 *                      attached_media[n]={"media_fbid":id}
 *   FB video           POST /{page-id}/videos  file_url, description
 *   IG                 POST /{ig-user-id}/media (container) → poll
 *                      status_code → POST /{ig-user-id}/media_publish
 *
 * Rules: every call takes { token } explicitly; tokens go in the request
 * body or query and are never logged, never put in error messages. Errors are
 * MetaApiError with Meta's code / error_subcode / message so callers can tell
 * a rate limit (retry) from a bad token (stop).
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

/** Scheduled post came back from Meta with a different publish time. */
export class MetaScheduleMismatchError extends Error {
  constructor(
    readonly postId: string,
    readonly expected: number,
    readonly actual: number | null
  ) {
    super(
      `Meta stored scheduled_publish_time ${actual ?? 'null'} for post ${postId}, expected ${expected}`
    )
    this.name = 'MetaScheduleMismatchError'
  }
}

// Meta error codes that mean "try again later", not "this post is wrong".
//   1  unknown / API unknown        2  service temporarily unavailable
//   4  app request limit            17 user request limit
//   32 page request limit           613 custom rate limit
//   9007 / 2207027 IG container not ready yet
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
 * One Graph call. The token rides in the form body for POST/DELETE and the
 * query for GET; the URL is never included in thrown errors.
 */
export async function graph<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token: string,
  params: Params = {}
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, '')}`)
  const init: RequestInit = { method, headers: {} }
  if (method === 'GET') {
    for (const [k, v] of encode(params)) url.searchParams.set(k, v)
    url.searchParams.set('access_token', token)
  } else {
    const body = encode(params)
    body.set('access_token', token)
    init.body = body.toString()
    init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
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
 * Publish one or more photos to the Page right now.
 * Single → /photos with url+caption. Multi → unpublished /photos, then /feed
 * with attached_media (published defaults to true).
 */
export async function fbPublishPhotoPost(input: {
  token: string
  pageId: string
  imageUrls: string[]
  caption: string
}): Promise<FbPhotoResult> {
  const { token, pageId, imageUrls, caption } = input
  if (imageUrls.length === 0) throw new Error('fbPublishPhotoPost: no images')

  if (imageUrls.length === 1) {
    const res = await graph<PhotosResponse>('POST', `${pageId}/photos`, token, {
      url: imageUrls[0],
      caption,
    })
    return { postId: res.post_id ?? res.id, photoIds: [res.id] }
  }

  const photoIds: string[] = []
  for (const url of imageUrls) {
    const res = await graph<PhotosResponse>('POST', `${pageId}/photos`, token, {
      url,
      published: false,
    })
    photoIds.push(res.id)
  }
  const feed = await graph<{ id: string }>('POST', `${pageId}/feed`, token, {
    message: caption,
    ...attachedMedia(photoIds),
  })
  return { postId: feed.id, photoIds }
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

  let postId: string
  const photoIds: string[] = []
  if (imageUrls.length === 1) {
    const res = await graph<PhotosResponse>('POST', `${pageId}/photos`, token, {
      url: imageUrls[0],
      caption,
      published: false,
      scheduled_publish_time: when,
    })
    photoIds.push(res.id)
    postId = res.post_id ?? res.id
  } else {
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
    postId = feed.id
  }

  const stored = await fbGetPost({ token, postId })
  const actual = stored.scheduledPublishTime
  if (actual == null || Math.abs(actual - when) > SCHEDULE_TOLERANCE_SECONDS) {
    try {
      await fbDeletePost({ token, postId })
    } catch {
      // Leave it to the mismatch error; the caller surfaces the post id.
    }
    throw new MetaScheduleMismatchError(postId, when, actual)
  }
  return { postId, photoIds, scheduledPublishTime: actual }
}

function attachedMedia(photoIds: string[]): Params {
  const out: Params = {}
  photoIds.forEach((id, i) => {
    out[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })
  })
  return out
}

/**
 * Publish (or schedule) a video on the Page from a public URL. Meta pulls
 * the file itself (file_url); no transcoding on our side in v1.
 */
export async function fbPublishVideo(input: {
  token: string
  pageId: string
  videoUrl: string
  description: string
  scheduledAt?: Date
}): Promise<{ videoId: string; scheduledPublishTime: number | null }> {
  const { token, pageId, videoUrl, description, scheduledAt } = input
  const params: Params = { file_url: videoUrl, description }
  if (scheduledAt) {
    params.published = false
    params.scheduled_publish_time = toUnixSeconds(scheduledAt)
  }
  const res = await graph<{ id: string }>('POST', `${pageId}/videos`, token, params)
  return { videoId: res.id, scheduledPublishTime: scheduledAt ? toUnixSeconds(scheduledAt) : null }
}

export interface FbPostState {
  id: string
  isPublished: boolean | null
  scheduledPublishTime: number | null
  permalinkUrl: string | null
}

/** Read a Page Post's publish state (used for the schedule read-back and the cron's went-live check). */
export async function fbGetPost(input: { token: string; postId: string }): Promise<FbPostState> {
  const res = await graph<{
    id: string
    is_published?: boolean
    scheduled_publish_time?: number | string
    permalink_url?: string
  }>('GET', input.postId, input.token, {
    fields: 'id,is_published,scheduled_publish_time,permalink_url',
  })
  const spt = res.scheduled_publish_time
  return {
    id: res.id,
    isPublished: res.is_published ?? null,
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

export async function igCreateImageContainer(input: {
  token: string
  igUserId: string
  imageUrl: string
  caption?: string
  isCarouselItem?: boolean
}): Promise<string> {
  const { token, igUserId, imageUrl, caption, isCarouselItem } = input
  const res = await graph<{ id: string }>('POST', `${igUserId}/media`, token, {
    image_url: imageUrl,
    caption: isCarouselItem ? undefined : caption,
    is_carousel_item: isCarouselItem ? true : undefined,
  })
  return res.id
}

export async function igCreateCarousel(input: {
  token: string
  igUserId: string
  children: string[]
  caption: string
}): Promise<string> {
  const { token, igUserId, children, caption } = input
  if (children.length < 2 || children.length > 10) {
    throw new Error(`igCreateCarousel: needs 2–10 children, got ${children.length}`)
  }
  const res = await graph<{ id: string }>('POST', `${igUserId}/media`, token, {
    media_type: 'CAROUSEL',
    children: children.join(','),
    caption,
  })
  return res.id
}

/** Feed video on IG is a Reel since 2023-11-09 (media_type=VIDEO retired). */
export async function igCreateReel(input: {
  token: string
  igUserId: string
  videoUrl: string
  caption: string
  shareToFeed?: boolean
}): Promise<string> {
  const { token, igUserId, videoUrl, caption, shareToFeed = true } = input
  const res = await graph<{ id: string }>('POST', `${igUserId}/media`, token, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: shareToFeed,
  })
  return res.id
}

export type IgContainerStatusCode = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'

export interface IgContainerStatus {
  statusCode: IgContainerStatusCode
  /** Free text; when statusCode is ERROR this carries the error subcode. */
  status: string | null
}

export async function igGetContainerStatus(input: {
  token: string
  containerId: string
}): Promise<IgContainerStatus> {
  const res = await graph<{ status_code?: string; status?: string }>(
    'GET',
    input.containerId,
    input.token,
    { fields: 'status_code,status' }
  )
  return {
    statusCode: (res.status_code as IgContainerStatusCode) ?? 'IN_PROGRESS',
    status: res.status ?? null,
  }
}

/**
 * Poll a container until FINISHED. Meta suggests once a minute for up to five
 * minutes; images usually finish in seconds, so we poll faster and cap the
 * wait so the cron stays inside its maxDuration. Throws MetaApiError with
 * code 9007 (transient) on timeout so the row is retried, not failed.
 */
export async function igWaitForContainer(input: {
  token: string
  containerId: string
  intervalMs?: number
  maxWaitMs?: number
  sleep?: (ms: number) => Promise<void>
}): Promise<IgContainerStatus> {
  const {
    token,
    containerId,
    intervalMs = 5_000,
    maxWaitMs = 60_000,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = input
  const started = Date.now()
  let last: IgContainerStatus = { statusCode: 'IN_PROGRESS', status: null }
  for (;;) {
    last = await igGetContainerStatus({ token, containerId })
    if (last.statusCode === 'FINISHED' || last.statusCode === 'PUBLISHED') return last
    if (last.statusCode === 'ERROR' || last.statusCode === 'EXPIRED') {
      throw new MetaApiError(
        200,
        {
          message: `Instagram could not process the media (${last.statusCode}${last.status ? `: ${last.status}` : ''})`,
          code: 9004,
          error_subcode: last.status && /^\d+$/.test(last.status) ? Number(last.status) : undefined,
        },
        'Instagram container failed'
      )
    }
    if (Date.now() - started >= maxWaitMs) {
      throw new MetaApiError(
        200,
        { message: 'Instagram media is still processing; will retry', code: 9007, error_subcode: 2207027 },
        'Instagram container not ready'
      )
    }
    await sleep(intervalMs)
  }
}

export async function igPublish(input: {
  token: string
  igUserId: string
  creationId: string
}): Promise<string> {
  const res = await graph<{ id: string }>('POST', `${input.igUserId}/media_publish`, input.token, {
    creation_id: input.creationId,
  })
  return res.id
}

export interface IgPublishingLimit {
  quotaUsage: number
  quotaTotal: number | null
}

/** Rolling 24h publish count (limit is 100 API posts per account). */
export async function igPublishingLimit(input: {
  token: string
  igUserId: string
}): Promise<IgPublishingLimit> {
  const res = await graph<{
    data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }>
  }>('GET', `${input.igUserId}/content_publishing_limit`, input.token, {
    fields: 'quota_usage,config',
  })
  const row = res.data?.[0]
  return { quotaUsage: row?.quota_usage ?? 0, quotaTotal: row?.config?.quota_total ?? null }
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
