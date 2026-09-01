/**
 * Social publisher side effects: the store (Supabase), the account/token
 * lookup, the Facebook scheduling call, and the cron's reconciliation pass.
 * The routes and the cron are thin wrappers over these; the decision logic
 * stays in queue.ts.
 *
 * Product rule (Joseph, 2026-09-01): the only Meta write that creates content
 * is scheduleOnFacebook (a held, scheduled post). There is no publish-now and
 * no Instagram path. The cron never creates or publishes anything; it only
 * reads held posts back and reflects what Meta did.
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
    | 'last_error'
    | 'attempts'
  >
>

export interface SocialStore {
  /** Facebook rows Meta is holding whose time has passed: check if they went live. */
  listScheduledFacebook(before: Date, limit: number): Promise<SocialPost[]>
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
  'id, org_id, platform, post_type, caption, media, derived_media, scheduled_at, approved_at, published_at, platform_post_id, ig_container_id, status, last_error, attempts, group_id, created_at, updated_at'

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
  return {
    async listScheduledFacebook(before, limit) {
      const { data, error } = await admin
        .from('social_posts')
        .select(POST_COLUMNS)
        .eq('status', 'scheduled')
        .eq('platform', 'facebook')
        .lte('scheduled_at', before.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(limit)
      if (error) throw new Error(`listScheduledFacebook: ${error.message}`)
      return (data ?? []) as SocialPost[]
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
  return `${platform === 'facebook' ? 'fb' : 'ig'}:${id}`
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

export function errorMessage(err: unknown): string {
  if (err instanceof MetaApiError) {
    return err.userMessage ? `${err.message} — ${err.userMessage}` : err.message
  }
  return err instanceof Error ? err.message : 'Unknown error'
}

/**
 * After Meta published a held post: record it. NEVER moves the row to
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
  const patch: PostPatch = {
    status: transition(post, 'published').ok ? 'published' : post.status,
    published_at: publishedAt.toISOString(),
    platform_post_id: out.platformPostId,
    last_error: null,
  }
  try {
    await store.update(post.id, patch)
  } catch (err) {
    const msg = `Published on Meta as ${out.platformPostId} but the row could not be updated: ${errorMessage(err)}`
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
    onError(`Published on Meta as ${out.platformPostId} but the library could not be stamped: ${errorMessage(err)}`)
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
}

// A held post is only checked once its time is a minute past, so a Meta
// publish that is a few seconds late is not read as "still held".
export const RECONCILE_GRACE_MS = 60_000

/**
 * One cron pass. Reads only: this never calls a Meta create or publish
 * endpoint. Instagram rows and any legacy 'approved' rows are not touched.
 */
export async function runSocialReconcile(deps: ReconcileDeps): Promise<ReconcileResult> {
  const { store, now, fbPostState = defaultFbPostState, maxPerRun = 25, onError = () => {} } = deps
  const result: ReconcileResult = { stale: [], fbWentLive: [], fbMissing: [], fbHeld: [] }

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
        await store.update(post.id, { last_error: errorMessage(err) })
        result.fbHeld.push(post.id)
      }
    }
  }

  return result
}

async function defaultFbPostState(token: string, postId: string, kind: FbObjectKind) {
  const state = await fbGetPost({ token, postId, kind })
  return { isPublished: state.isPublished }
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
