/**
 * Social publisher side effects: the store (Supabase), the account/token
 * lookup, the Facebook and Google scheduling calls, and the cron's
 * reconciliation pass. The routes and the cron are thin wrappers over these;
 * the decision logic stays in queue.ts.
 *
 * Product rule (Joseph, 2026-09-01; Google added 2026-09-03): the only vendor
 * writes that create content are scheduleOnFacebook and scheduleOnGoogle —
 * both create a HELD, scheduled post the vendor publishes itself. There is no
 * publish-now and no Instagram path. The cron never creates or publishes
 * anything; it only reads held posts back and reflects what the vendor did.
 *
 * The store is an interface so the reconciliation runner can be tested
 * against an in-memory implementation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/crypto'
import {
  STALE_PUBLISHING_MS,
  transition,
  type DerivedMediaItem,
  type Platform,
  type PostStatus,
  type PostType,
  type SocialPost,
} from './queue'
import {
  fbGetPost,
  fbSchedulePhotoPost,
  fbScheduleVideo,
  isMetaObjectMissing,
  MetaApiError,
  type FbObjectKind,
} from './meta'
import { getGbpAccessToken } from '@/lib/gbp/client'
import {
  createLocalPost,
  deleteLocalPost,
  getLocalPost,
  isGbpObjectMissing,
  isTransientGbpError,
} from '@/lib/gbp/posts'

export interface SocialAccount {
  id: string
  org_id: string
  platform: Platform
  external_id: string
  page_id: string | null
  display_name: string | null
  /** Decrypted page access token. Never log it. */
  token: string
  token_expires_at: string | null
}

/** What the admin route returns and stores: never the token. */
export interface SocialAccountSummary {
  id: string
  org_id: string
  platform: Platform
  external_id: string
  page_id: string | null
  display_name: string | null
  token_expires_at: string | null
}

export class MissingAccountError extends Error {
  constructor(platform: Platform) {
    super(
      `No ${platform === 'facebook' ? 'Facebook Page' : 'Instagram account'} connected for this client yet. Connect one with POST /api/admin/social-account (or npm run social-account)`
    )
    this.name = 'MissingAccountError'
  }
}

/** The queue-time refusal; the approve-time class message extends it with the fix. */
export const NO_GBP_LOCATION_MESSAGE = 'No Google Business location connected for this client'

export class MissingGbpLocationError extends Error {
  constructor() {
    super(
      `${NO_GBP_LOCATION_MESSAGE} yet. Add an active gbp_managed_locations row (client_key = the org slug) with a resolved gbp_location_name`
    )
    this.name = 'MissingGbpLocationError'
  }
}

/**
 * Google came back holding the post in the wrong state (LIVE, missing, or an
 * unreadable read-back) after a create. `deleted` says whether the
 * best-effort cleanup removed it; when false the caller must keep `postName`
 * so the orphan can still be deleted from Google later. Mirrors
 * MetaScheduleMismatchError.
 */
export class GbpScheduleMismatchError extends Error {
  constructor(
    readonly postName: string,
    readonly state: string | null,
    readonly deleted: boolean,
    reason: string | null = null
  ) {
    const tail = deleted ? '' : ' (and it could not be removed; delete it in Business Profile Manager)'
    super(
      reason
        ? `Google accepted post ${postName} but it could not be read back (${reason})${tail}`
        : `Google stored state ${state ?? 'unknown'} for post ${postName}, expected SCHEDULED (a held post)${tail}`
    )
    this.name = 'GbpScheduleMismatchError'
  }
}

export type PostPatch = Partial<
  Pick<
    SocialPost,
    | 'status'
    | 'caption'
    | 'scheduled_at'
    | 'approved_at'
    | 'published_at'
    | 'platform_post_id'
    | 'ig_container_id'
    | 'derived_media'
    | 'cta_type'
    | 'cta_url'
    | 'last_error'
    | 'attempts'
  >
>

export interface SocialStore {
  /** Facebook rows Meta is holding whose time has passed: check if they went live. */
  listScheduledFacebook(before: Date, limit: number): Promise<SocialPost[]>
  /** Google rows Google is holding whose time has passed: check if they went live. */
  listScheduledGoogle(before: Date, limit: number): Promise<SocialPost[]>
  /** Unconditional write (id only). Use transitionFrom for any status change a user can race. */
  update(id: string, patch: PostPatch): Promise<void>
  /**
   * Compare-and-swap: apply `patch` only while the row is still in one of
   * `fromStatus`. False = someone else changed it first; the caller must not
   * proceed to Meta.
   */
  transitionFrom(id: string, fromStatus: PostStatus | PostStatus[], patch: PostPatch): Promise<boolean>
  /**
   * Rows stuck in 'publishing' whose last write is older than `before`: the
   * approve request that claimed them was killed. Park them in 'failed' and
   * return their ids.
   */
  failStale(before: Date): Promise<string[]>
  loadAccount(orgId: string, platform: Platform): Promise<SocialAccount | null>
  /**
   * capture_uploads.posted_at + post_ref for every media path (same columns
   * /api/material/mark writes). post_ref is APPENDED so a file that was also
   * marked by hand keeps both references.
   */
  stampPosted(orgId: string, paths: string[], postRef: string): Promise<void>
}

export const MIN_TOKEN_LENGTH = 16
export const POST_REF_MAX = 120
export const STALE_PUBLISHING_MESSAGE =
  'Approve did not finish (the server run was cut off). Check Business Suite Planner for a scheduled post before retrying'

/**
 * The material token (organizations.material_token) is the only credential
 * the /m page and its routes accept; org ids never appear in a URL or body.
 */
export async function resolveMaterialOrg(
  admin: AnyClient,
  token: unknown
): Promise<{ id: string; name: string } | null> {
  if (typeof token !== 'string' || token.length < MIN_TOKEN_LENGTH) return null
  const { data } = await admin
    .from('organizations')
    .select('id, name')
    .eq('material_token', token)
    .maybeSingle()
  return data ?? null
}

export const POST_COLUMNS =
  'id, org_id, platform, post_type, caption, media, derived_media, scheduled_at, approved_at, published_at, platform_post_id, ig_container_id, cta_type, cta_url, status, last_error, attempts, group_id, created_at, updated_at'

export const ACCOUNT_SUMMARY_COLUMNS = 'id, org_id, platform, external_id, page_id, display_name, token_expires_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>

/** Append a reference to an existing post_ref ('fb:1 gbp'), capped at the column width. */
export function appendPostRef(existing: string | null | undefined, postRef: string): string {
  const parts = (existing ?? '').split(/\s+/).filter(Boolean)
  if (!parts.includes(postRef)) parts.push(postRef)
  return parts.join(' ').slice(0, POST_REF_MAX)
}

export function createSupabaseStore(admin: AnyClient): SocialStore {
  const listScheduled = async (platform: Platform, before: Date, limit: number) => {
    const { data, error } = await admin
      .from('social_posts')
      .select(POST_COLUMNS)
      .eq('status', 'scheduled')
      .eq('platform', platform)
      .lte('scheduled_at', before.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(limit)
    if (error) throw new Error(`listScheduled(${platform}): ${error.message}`)
    return (data ?? []) as SocialPost[]
  }
  return {
    async listScheduledFacebook(before, limit) {
      return listScheduled('facebook', before, limit)
    },

    async listScheduledGoogle(before, limit) {
      return listScheduled('google', before, limit)
    },

    async update(id, patch) {
      const { error } = await admin
        .from('social_posts')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(`update: ${error.message}`)
    },

    async transitionFrom(id, fromStatus, patch) {
      const from = Array.isArray(fromStatus) ? fromStatus : [fromStatus]
      const { data, error } = await admin
        .from('social_posts')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .in('status', from)
        .select('id')
      if (error) throw new Error(`transitionFrom: ${error.message}`)
      return Boolean(data && data.length > 0)
    },

    async failStale(before) {
      const { data, error } = await admin
        .from('social_posts')
        .update({
          status: 'failed',
          last_error: STALE_PUBLISHING_MESSAGE,
          updated_at: new Date().toISOString(),
        })
        .eq('status', 'publishing')
        .lt('updated_at', before.toISOString())
        .select('id')
      if (error) throw new Error(`failStale: ${error.message}`)
      return ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
    },

    async loadAccount(orgId, platform) {
      const { data, error } = await admin
        .from('social_accounts')
        .select('id, org_id, platform, external_id, page_id, display_name, access_token_enc, token_expires_at')
        .eq('org_id', orgId)
        .eq('platform', platform)
        .maybeSingle()
      if (error) throw new Error(`loadAccount: ${error.message}`)
      if (!data) return loadAccountFromEnv(admin, orgId, platform)
      return {
        id: data.id,
        org_id: data.org_id,
        platform: data.platform as Platform,
        external_id: data.external_id,
        page_id: data.page_id,
        display_name: data.display_name,
        token: decrypt(data.access_token_enc),
        token_expires_at: data.token_expires_at,
      }
    },

    async stampPosted(orgId, paths, postRef) {
      if (paths.length === 0) return
      const { data, error } = await admin
        .from('capture_uploads')
        .select('path, post_ref')
        .eq('org_id', orgId)
        .in('path', paths)
      if (error) throw new Error(`stampPosted: ${error.message}`)
      const postedAt = new Date().toISOString()
      for (const row of (data ?? []) as Array<{ path: string; post_ref: string | null }>) {
        const { error: updateError } = await admin
          .from('capture_uploads')
          .update({ posted_at: postedAt, post_ref: appendPostRef(row.post_ref, postRef) })
          .eq('org_id', orgId)
          .eq('path', row.path)
        if (updateError) throw new Error(`stampPosted: ${updateError.message}`)
      }
    },
  }
}

// ─── Connected accounts (admin route) ────────────────────────────────────────

export interface UpsertAccountInput {
  orgId: string
  platform: Platform
  externalId: string
  pageId: string | null
  displayName: string | null
  /** Plaintext page token; encrypted here, never stored or logged as-is. */
  accessToken: string
  tokenExpiresAt: Date | null
}

/**
 * Insert or replace the (org, platform) row. The token is encrypted with
 * TOKEN_ENCRYPTION_KEY before it touches the query, and only the summary
 * columns are read back.
 */
export async function upsertSocialAccount(admin: AnyClient, input: UpsertAccountInput): Promise<SocialAccountSummary> {
  const { data, error } = await admin
    .from('social_accounts')
    .upsert(
      {
        org_id: input.orgId,
        platform: input.platform,
        external_id: input.externalId,
        page_id: input.pageId,
        display_name: input.displayName,
        access_token_enc: encrypt(input.accessToken),
        token_expires_at: input.tokenExpiresAt ? input.tokenExpiresAt.toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,platform' }
    )
    .select(ACCOUNT_SUMMARY_COLUMNS)
    .single()
  if (error) throw new Error(`upsertSocialAccount: ${error.message}`)
  return data as SocialAccountSummary
}

/** Remove the (org, platform) row. True when a row was actually deleted. */
export async function deleteSocialAccount(admin: AnyClient, orgId: string, platform: Platform): Promise<boolean> {
  const { data, error } = await admin
    .from('social_accounts')
    .delete()
    .eq('org_id', orgId)
    .eq('platform', platform)
    .select('id')
  if (error) throw new Error(`deleteSocialAccount: ${error.message}`)
  return Boolean(data && data.length > 0)
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

export interface ScheduleInput {
  post: SocialPost
  account: SocialAccount
  derived: DerivedMediaItem[]
  scheduledAt: Date
}

export interface ScheduleResult {
  platformPostId: string
  postRef: string
}

function urlsOf(derived: DerivedMediaItem[]): string[] {
  return derived.map((d) => d.public_url)
}

export function postRefFor(platform: Platform, id: string): string {
  const prefix = platform === 'facebook' ? 'fb' : platform === 'google' ? 'gbp' : 'ig'
  return `${prefix}:${id}`
}

/** Which Graph node a stored platform_post_id names (FB videos store the Video id). */
export function fbObjectKind(postType: PostType): FbObjectKind {
  return postType === 'video' ? 'video' : 'post'
}

/**
 * Create the Meta-side SCHEDULED post — the one and only content write to
 * Meta. Returns the Page Post id Planner shows (Video id for videos).
 */
export async function scheduleOnFacebook(input: ScheduleInput): Promise<ScheduleResult> {
  const { post, account, derived, scheduledAt } = input
  const caption = post.caption ?? ''
  if (post.post_type === 'video') {
    const { videoId } = await fbScheduleVideo({
      token: account.token,
      pageId: account.external_id,
      videoUrl: derived[0].public_url,
      description: caption,
      scheduledAt,
    })
    return { platformPostId: videoId, postRef: postRefFor('facebook', videoId) }
  }
  const { postId } = await fbSchedulePhotoPost({
    token: account.token,
    pageId: account.external_id,
    imageUrls: urlsOf(derived),
    caption,
    scheduledAt,
  })
  return { platformPostId: postId, postRef: postRefFor('facebook', postId) }
}

/**
 * The org's mapped Google Business location, or null. Resolution is by slug
 * (organizations.id → slug → gbp_managed_locations.client_key) because
 * Skooped's own location row keeps org_id NULL on purpose; the row must be
 * active with a resolved account-scoped gbp_location_name.
 */
export async function loadGbpLocation(admin: AnyClient, orgId: string): Promise<{ locationName: string } | null> {
  const { data: org, error } = await admin.from('organizations').select('slug').eq('id', orgId).maybeSingle()
  if (error) throw new Error(`loadGbpLocation: ${error.message}`)
  const slug = org?.slug
  if (typeof slug !== 'string' || slug.length === 0) return null
  const { data, error: locError } = await admin
    .from('gbp_managed_locations')
    .select('gbp_location_name, active')
    .eq('client_key', slug)
    .maybeSingle()
  if (locError) throw new Error(`loadGbpLocation: ${locError.message}`)
  if (!data || data.active !== true) return null
  const locationName = data.gbp_location_name
  if (typeof locationName !== 'string' || locationName.length === 0) return null
  return { locationName }
}

export interface GoogleScheduleInput {
  admin: AnyClient
  post: SocialPost
  derived: DerivedMediaItem[]
  scheduledAt: Date
}

async function bestEffortDeleteGbp(token: string, name: string): Promise<boolean> {
  try {
    await deleteLocalPost(token, name)
    return true
  } catch {
    return false
  }
}

/**
 * Create the Google-side SCHEDULED local post — the one and only content
 * write to Google from the publisher. createLocalPost is called with
 * { scheduleOnly: true } so a missing scheduledTime throws before any network
 * call, then the post is read back and must be in state SCHEDULED (Google is
 * holding it). Anything else — LIVE, missing, an unreadable read-back — is
 * treated like the Facebook mismatch path: best-effort delete, then
 * GbpScheduleMismatchError carrying the resource name and whether the delete
 * worked. Returns the localPost resource name
 * ("accounts/…/locations/…/localPosts/…").
 */
export async function scheduleOnGoogle(input: GoogleScheduleInput): Promise<ScheduleResult> {
  const { admin, post, derived, scheduledAt } = input
  const location = await loadGbpLocation(admin, post.org_id)
  if (!location) throw new MissingGbpLocationError()
  const token = await getGbpAccessToken()

  // Photos only (queue.ts refuses video for google); one photo per post.
  const mediaUrl = derived.length > 0 ? derived[0].public_url : null
  const name = await createLocalPost(
    location.locationName,
    {
      body: post.caption ?? '',
      ctaType: post.cta_type,
      ctaUrl: post.cta_url,
      mediaUrl,
      scheduledTime: scheduledAt.toISOString(),
    },
    token,
    { scheduleOnly: true }
  )

  let state: string
  try {
    state = (await getLocalPost(token, name)).state
  } catch (err) {
    if (isGbpObjectMissing(err)) {
      // Created then instantly gone: nothing to clean up, but fail loudly.
      throw new GbpScheduleMismatchError(name, 'MISSING', true)
    }
    if (isTransientGbpError(err)) {
      // The create call carried scheduledTime; trust it rather than delete a
      // post that is probably right (same policy as the Meta read-back).
      return { platformPostId: name, postRef: postRefFor('google', name) }
    }
    const deleted = await bestEffortDeleteGbp(token, name)
    throw new GbpScheduleMismatchError(name, null, deleted, err instanceof Error ? err.message : 'unknown error')
  }
  // Google validates a just-created scheduled post asynchronously: SCHEDULED
  // once validated, PROCESSING while it validates (observed live 2026-09-03 on
  // Skooped's profile). Both mean HELD and absent from search results, so both
  // are accepted; the reconcile tick flips the row to published only when
  // Google reports LIVE at the scheduled time. LIVE now (review rule broken),
  // REJECTED, or anything else -> remove it if we can and surface the failure.
  if (state !== 'SCHEDULED' && state !== 'PROCESSING') {
    const deleted = await bestEffortDeleteGbp(token, name)
    throw new GbpScheduleMismatchError(name, state, deleted)
  }
  return { platformPostId: name, postRef: postRefFor('google', name) }
}

export function errorMessage(err: unknown): string {
  if (err instanceof MetaApiError) {
    return err.userMessage ? `${err.message} — ${err.userMessage}` : err.message
  }
  return err instanceof Error ? err.message : 'Unknown error'
}

/**
 * After the vendor published a held post: record it. NEVER moves the row to
 * 'failed' — the post is live, so a DB hiccup here must not produce a Retry
 * button that would schedule it again. Returns false when the record could
 * not be written (already logged by the caller).
 */
export async function recordPublished(
  store: SocialStore,
  post: SocialPost,
  out: ScheduleResult,
  publishedAt: Date,
  onError: (message: string) => void
): Promise<boolean> {
  const vendor = post.platform === 'google' ? 'Google' : 'Meta'
  const patch: PostPatch = {
    status: transition(post, 'published').ok ? 'published' : post.status,
    published_at: publishedAt.toISOString(),
    platform_post_id: out.platformPostId,
    last_error: null,
  }
  try {
    await store.update(post.id, patch)
  } catch (err) {
    const msg = `Published on ${vendor} as ${out.platformPostId} but the row could not be updated: ${errorMessage(err)}`
    onError(msg)
    // One more try with the reason attached; if that fails too the row stays
    // as it was — never 'failed'.
    try {
      await store.update(post.id, { ...patch, last_error: msg })
    } catch {
      return false
    }
  }
  try {
    await store.stampPosted(
      post.org_id,
      post.media.map((m) => m.path),
      out.postRef
    )
  } catch (err) {
    onError(`Published on ${vendor} as ${out.platformPostId} but the library could not be stamped: ${errorMessage(err)}`)
    return false
  }
  return true
}

// ─── Cron: reconciliation only ───────────────────────────────────────────────

export interface ReconcileDeps {
  store: SocialStore
  now: Date
  /** Injected: is the Meta-held scheduled FB post live yet? Tests never touch Meta. */
  fbPostState?: (token: string, postId: string, kind: FbObjectKind) => Promise<{ isPublished: boolean | null }>
  /** Injected: the Google-held local post's state. Tests never touch Google. */
  gbpPostState?: (postName: string) => Promise<{ state: string }>
  maxPerRun?: number
  onError?: (message: string, postId: string) => void
}

export interface ReconcileResult {
  /** Rows swept from a stale 'publishing' to 'failed'. */
  stale: string[]
  /** Held posts Meta has published: now 'published', library stamped. */
  fbWentLive: string[]
  /** Held posts that no longer exist at Meta (deleted in Planner): now 'cancelled'. */
  fbMissing: string[]
  /** Held posts past their time that Meta has not published yet, or whose read-back failed: left 'scheduled'. */
  fbHeld: string[]
  /** Held posts Google has published: now 'published', library stamped (gbp:<name>). */
  googleWentLive: string[]
  /** Held posts that no longer exist at Google (deleted in Business Profile Manager): now 'cancelled'. */
  googleMissing: string[]
  /** Held posts past their time that Google has not published yet, or whose read-back failed: left 'scheduled'. */
  googleHeld: string[]
}

// A held post is only checked once its time is a minute past, so a Meta
// publish that is a few seconds late is not read as "still held".
export const RECONCILE_GRACE_MS = 60_000

/**
 * One cron pass. Reads only: this never calls a Meta or Google create or
 * publish endpoint. Instagram rows and any legacy 'approved' rows are not
 * touched.
 */
export async function runSocialReconcile(deps: ReconcileDeps): Promise<ReconcileResult> {
  const {
    store,
    now,
    fbPostState = defaultFbPostState,
    gbpPostState = defaultGbpPostState,
    maxPerRun = 25,
    onError = () => {},
  } = deps
  const result: ReconcileResult = {
    stale: [],
    fbWentLive: [],
    fbMissing: [],
    fbHeld: [],
    googleWentLive: [],
    googleMissing: [],
    googleHeld: [],
  }

  // 1. Rows a killed approve request left in 'publishing': surface them as
  //    'failed' so /m shows Retry.
  result.stale = await store.failStale(new Date(now.getTime() - STALE_PUBLISHING_MS))

  // 2. Facebook rows Meta was holding: once the time has passed (+ grace)
  //    read the published flag so the library shows them as posted.
  const held = await store.listScheduledFacebook(new Date(now.getTime() - RECONCILE_GRACE_MS), maxPerRun)
  for (const post of held) {
    if (!post.platform_post_id) {
      result.fbHeld.push(post.id)
      continue
    }
    let account: SocialAccount | null
    try {
      account = await store.loadAccount(post.org_id, 'facebook')
    } catch (err) {
      onError(errorMessage(err), post.id)
      result.fbHeld.push(post.id)
      continue
    }
    if (!account) {
      result.fbHeld.push(post.id)
      continue
    }
    try {
      const state = await fbPostState(account.token, post.platform_post_id, fbObjectKind(post.post_type))
      if (state.isPublished) {
        await recordPublished(
          store,
          post,
          { platformPostId: post.platform_post_id, postRef: postRefFor('facebook', post.platform_post_id) },
          now,
          (msg) => onError(msg, post.id)
        )
        result.fbWentLive.push(post.id)
      } else {
        result.fbHeld.push(post.id)
      }
    } catch (err) {
      if (isMetaObjectMissing(err)) {
        // The scheduled post no longer exists: deleted in Business Suite Planner.
        await store.transitionFrom(post.id, 'scheduled', {
          status: 'cancelled',
          last_error: 'Scheduled post no longer exists on Facebook (deleted in Business Suite?)',
        })
        result.fbMissing.push(post.id)
      } else {
        // Rate limit, blip, field/permission problem: leave it scheduled
        // (still visible on /m) with the reason, check again next run.
        // Compare-and-swap so the reason never lands on a row a user
        // unapproved or deleted while the read-back was in flight.
        await store.transitionFrom(post.id, 'scheduled', { last_error: errorMessage(err) })
        result.fbHeld.push(post.id)
      }
    }
  }

  // 3. Google rows Google was holding: same read-only pass against the
  //    localPost's state.
  const heldGoogle = await store.listScheduledGoogle(new Date(now.getTime() - RECONCILE_GRACE_MS), maxPerRun)
  for (const post of heldGoogle) {
    if (!post.platform_post_id) {
      result.googleHeld.push(post.id)
      continue
    }
    try {
      const { state } = await gbpPostState(post.platform_post_id)
      if (state === 'LIVE') {
        await recordPublished(
          store,
          post,
          { platformPostId: post.platform_post_id, postRef: postRefFor('google', post.platform_post_id) },
          now,
          (msg) => onError(msg, post.id)
        )
        result.googleWentLive.push(post.id)
      } else {
        // Still SCHEDULED (Google is late), PROCESSING, or anything else:
        // leave it and look again next tick.
        result.googleHeld.push(post.id)
      }
    } catch (err) {
      if (isGbpObjectMissing(err)) {
        // The held post no longer exists: deleted in Business Profile Manager.
        await store.transitionFrom(post.id, 'scheduled', {
          status: 'cancelled',
          last_error: 'Scheduled post no longer exists on Google (deleted in Business Profile Manager?)',
        })
        result.googleMissing.push(post.id)
      } else {
        // Rate limit, blip, auth problem: leave it scheduled with the reason,
        // check again next run (compare-and-swap, same as the FB branch).
        await store.transitionFrom(post.id, 'scheduled', { last_error: errorMessage(err) })
        result.googleHeld.push(post.id)
      }
    }
  }

  return result
}

async function defaultFbPostState(token: string, postId: string, kind: FbObjectKind) {
  const state = await fbGetPost({ token, postId, kind })
  return { isPublished: state.isPublished }
}

async function defaultGbpPostState(postName: string) {
  const token = await getGbpAccessToken()
  const { state } = await getLocalPost(token, postName)
  return { state }
}

/**
 * Env fallback for connected accounts: SOCIAL_ACCOUNTS_JSON = JSON array of
 * { org_slug, platform, external_id, page_id?, display_name?, access_token }.
 * Exists because TOKEN_ENCRYPTION_KEY lives only on Vercel (write-only there),
 * so the CLI cannot write a decryptable social_accounts row from a laptop.
 * A social_accounts row always wins; this is consulted only on a DB miss.
 */
export async function loadAccountFromEnv(
  admin: AnyClient,
  orgId: string,
  platform: Platform
): Promise<SocialAccount | null> {
  const raw = process.env.SOCIAL_ACCOUNTS_JSON
  if (!raw) return null
  let entries: Array<Record<string, unknown>> = []
  try {
    const parsed: unknown = JSON.parse(raw)
    entries = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : []
  } catch {
    return null
  }
  if (entries.length === 0) return null
  const { data: org } = await admin.from('organizations').select('slug').eq('id', orgId).maybeSingle()
  const slug = org?.slug
  if (typeof slug !== 'string') return null
  const hit = entries.find((e) => e.org_slug === slug && e.platform === platform)
  if (!hit || typeof hit.access_token !== 'string' || typeof hit.external_id !== 'string') return null
  return {
    id: `env:${slug}:${platform}`,
    org_id: orgId,
    platform,
    external_id: hit.external_id,
    page_id: typeof hit.page_id === 'string' ? hit.page_id : null,
    display_name: typeof hit.display_name === 'string' ? hit.display_name : null,
    token: hit.access_token,
    token_expires_at: null,
  }
}
