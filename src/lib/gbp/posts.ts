import { gbpFetch } from './client'

/**
 * v4 localPosts — create/read/delete Google Business Profile posts. Posts are
 * STANDARD topic type (+ optional CTA + one photo); EVENT/OFFER post types are
 * named skipped polish in the spec.
 *
 * Two callers, two rules:
 *   - the /m publisher (src/lib/social/service.ts) passes
 *     { scheduleOnly: true } and MUST send scheduledTime, so the API call
 *     creates a post Google HOLDS (state SCHEDULED) and publishes itself —
 *     the same held-post rule as the Facebook path (product rule 2026-09-03).
 *     The guard throws before any network call otherwise.
 *   - the legacy monthly-batch route (/api/cron/gbp-posts, no schedule
 *     anymore) publishes immediately and passes no options; it is not gated.
 *
 * Constraint that shapes the pipeline: media is pulled by Google from a
 * publicly fetchable sourceUrl — a Drive link or private bucket will fail.
 */

const CTA_NEEDS_URL = new Set(['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP'])

const GBP_V4_BASE = 'https://mybusiness.googleapis.com/v4'

export interface LocalPostInput {
  body: string
  ctaType: string | null
  ctaUrl: string | null
  mediaUrl: string | null
  /** RFC3339 time Google should publish at. Set → Google holds the post (state SCHEDULED). */
  scheduledTime?: string | null
}

export interface CreateLocalPostOptions {
  /**
   * The publisher path: refuse (before any network call) a create that has no
   * scheduledTime, because that would publish live instead of creating a
   * Google-held scheduled post.
   */
  scheduleOnly?: boolean
}

/** Typed GBP API failure so callers can tell "gone" from "blip". */
export class GbpApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    /** google.rpc.Status.status, e.g. 'NOT_FOUND', when the body carried one. */
    readonly rpcStatus: string | null = null
  ) {
    super(message)
    this.name = 'GbpApiError'
  }
}

/** "This local post is gone" — deleted in Business Profile Manager. */
export function isGbpObjectMissing(err: unknown): boolean {
  return err instanceof GbpApiError && (err.httpStatus === 404 || err.rpcStatus === 'NOT_FOUND')
}

/** Worth retrying on a later tick (rate limit, 5xx, network). */
export function isTransientGbpError(err: unknown): boolean {
  if (err instanceof GbpApiError) return err.httpStatus === 429 || err.httpStatus >= 500
  // Network-level failures (fetch threw) are transient by nature.
  return err instanceof TypeError
}

/**
 * Schedule-only guard for the publisher path (mirrors meta.ts
 * assertScheduleOnly). Throws before any network call.
 */
export function assertGbpScheduleOnly(scheduledTime: string | null | undefined): void {
  if (!scheduledTime) {
    throw new Error(
      'Refused: creating a Google Business post without scheduledTime would publish live; the publisher only creates scheduled posts'
    )
  }
}

interface GbpErrorBody {
  error?: { message?: string; status?: string }
}

function toApiError(action: string, locationOrName: string, status: number, data: unknown): GbpApiError {
  const body = (data ?? {}) as GbpErrorBody
  const detail = body.error?.message ? `: ${body.error.message.slice(0, 300)}` : ''
  return new GbpApiError(`GBP ${action} failed for ${locationOrName} (${status})${detail}`, status, body.error?.status ?? null)
}

export async function createLocalPost(
  locationName: string,
  input: LocalPostInput,
  accessToken: string,
  options: CreateLocalPostOptions = {}
): Promise<string> {
  if (options.scheduleOnly) assertGbpScheduleOnly(input.scheduledTime)
  const post: Record<string, unknown> = {
    languageCode: 'en-US',
    topicType: 'STANDARD',
    summary: input.body,
  }
  if (input.ctaType === 'CALL') {
    // CALL uses the business's listed phone number; no URL field.
    post.callToAction = { actionType: 'CALL' }
  } else if (input.ctaType && CTA_NEEDS_URL.has(input.ctaType) && input.ctaUrl) {
    post.callToAction = { actionType: input.ctaType, url: input.ctaUrl }
  }
  if (input.mediaUrl) {
    post.media = [{ mediaFormat: 'PHOTO', sourceUrl: input.mediaUrl }]
  }
  if (input.scheduledTime) {
    post.scheduledTime = input.scheduledTime
  }

  const res = await gbpFetch<{ name?: string } & GbpErrorBody>(
    `${GBP_V4_BASE}/${locationName}/localPosts`,
    accessToken,
    { method: 'POST', body: JSON.stringify(post) }
  )
  if (!res.ok || !res.data.name) {
    throw toApiError('localPosts.create', locationName, res.status, res.data)
  }
  return res.data.name
}

export interface LocalPostState {
  /** LocalPostState: SCHEDULED (held), LIVE, PROCESSING, REJECTED, … */
  state: string
  searchUrl: string | null
}

/**
 * Read one local post back by its resource name
 * ("accounts/{a}/locations/{l}/localPosts/{p}"). Throws GbpApiError; a
 * deleted post surfaces as isGbpObjectMissing(err).
 */
export async function getLocalPost(accessToken: string, name: string): Promise<LocalPostState> {
  const res = await gbpFetch<{ state?: string; searchUrl?: string } & GbpErrorBody>(
    `${GBP_V4_BASE}/${name}`,
    accessToken
  )
  if (!res.ok) {
    throw toApiError('localPosts.get', name, res.status, res.data)
  }
  return { state: res.data.state ?? 'LOCAL_POST_STATE_UNSPECIFIED', searchUrl: res.data.searchUrl ?? null }
}

/** Delete a local post by resource name. Already gone (404/NOT_FOUND) is success. */
export async function deleteLocalPost(accessToken: string, name: string): Promise<void> {
  const res = await gbpFetch<GbpErrorBody>(`${GBP_V4_BASE}/${name}`, accessToken, { method: 'DELETE' })
  if (!res.ok) {
    const err = toApiError('localPosts.delete', name, res.status, res.data)
    if (isGbpObjectMissing(err)) return
    throw err
  }
}
