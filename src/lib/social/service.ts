/**
 * Social publisher side effects: the store (Supabase), the account/token
 * lookup, and the per-platform publish flows. The routes and the cron are
 * thin wrappers over these; the decision logic stays in queue.ts.
 *
 * The store is an interface so the cron runner (runSocialPublish) can be
 * tested against an in-memory implementation — the double-publish guard in
 * particular has to be provable without a database.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/crypto'
import {
  failureOutcome,
  isDue,
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
  fbPublishPhotoPost,
  fbPublishVideo,
  fbSchedulePhotoPost,
  igCreateCarousel,
  igCreateImageContainer,
  igCreateReel,
  igGetContainerStatus,
  igPublish,
  igWaitForContainer,
  isMetaObjectMissing,
  isTransientMetaError,
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

export class MissingAccountError extends Error {
  constructor(platform: Platform) {
    super(
      `No ${platform === 'facebook' ? 'Facebook Page' : 'Instagram account'} connected for this client yet. Add one with: npm run social-account`
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
  /** Approved rows whose scheduled_at has passed (or is null). */
  listDue(now: Date, limit: number): Promise<SocialPost[]>
  /** Facebook rows Meta is holding whose time has passed: check if they went live. */
  listScheduledFacebook(before: Date, limit: number): Promise<SocialPost[]>
  /** Compare-and-swap approved → publishing. False when another run got there first. */
  claim(post: SocialPost): Promise<boolean>
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
   * function that claimed them was killed. Park them in 'failed' (keeping
   * ig_container_id so a retry can resume) and return their ids.
   */
  failStale(before: Date): Promise<string[]>
  loadAccount(orgId: string, platform: Platform): Promise<SocialAccount | null>
  /**
   * capture_uploads.posted_at + post_ref for every media path (same columns
   * /api/material/mark writes). post_ref is APPENDED so a file posted to both
   * platforms keeps both references.
   */
  stampPosted(orgId: string, paths: string[], postRef: string): Promise<void>
}

export const MIN_TOKEN_LENGTH = 16
export const POST_REF_MAX = 120
export const STALE_PUBLISHING_MESSAGE =
  'Publish did not finish (the server run was cut off). Check Instagram/Facebook before retrying'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>

/** Append a reference to an existing post_ref ('fb:1 ig:2'), capped at the column width. */
export function appendPostRef(existing: string | null | undefined, postRef: string): string {
  const parts = (existing ?? '').split(/\s+/).filter(Boolean)
  if (!parts.includes(postRef)) parts.push(postRef)
  return parts.join(' ').slice(0, POST_REF_MAX)
}

export function createSupabaseStore(admin: AnyClient): SocialStore {
  return {
    async listDue(now, limit) {
      const { data, error } = await admin
        .from('social_posts')
        .select(POST_COLUMNS)
        .eq('status', 'approved')
        .or(`scheduled_at.is.null,scheduled_at.lte.${now.toISOString()}`)
        .order('scheduled_at', { ascending: true, nullsFirst: true })
        .limit(limit)
      if (error) throw new Error(`listDue: ${error.message}`)
      return ((data ?? []) as SocialPost[]).filter((p) => isDue(p, now))
    },

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

    async claim(post) {
      const { data, error } = await admin
        .from('social_posts')
        .update({
          status: 'publishing',
          attempts: post.attempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id)
        .eq('status', 'approved')
        .select('id')
      if (error) throw new Error(`claim: ${error.message}`)
      return Boolean(data && data.length > 0)
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

// ─── Publish flows ───────────────────────────────────────────────────────────

export interface PublishInput {
  post: SocialPost
  account: SocialAccount
  derived: DerivedMediaItem[]
  /** Called as soon as an IG container exists so the id is persisted before the wait. */
  onContainer?: (containerId: string) => Promise<void>
  /**
   * Epoch ms by which the publish must have returned (the caller's function
   * limit minus headroom). Container waits are cut to fit; on the deadline
   * the transient 9007 error is thrown so the row goes back to 'approved'
   * and the next run RESUMES the persisted container instead of the
   * function being killed mid-wait with the row stuck in 'publishing'.
   */
  deadline?: number
  sleep?: (ms: number) => Promise<void>
}

export interface PublishResult {
  platformPostId: string
  postRef: string
}

// Per-type caps on one container wait (Meta: reels can take minutes; images seconds).
export const IG_IMAGE_WAIT_MS = 60_000
export const IG_VIDEO_WAIT_MS = 240_000

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

export async function publishToFacebook(input: PublishInput): Promise<PublishResult> {
  const { post, account, derived } = input
  const caption = post.caption ?? ''
  if (post.post_type === 'video') {
    const { videoId } = await fbPublishVideo({
      token: account.token,
      pageId: account.external_id,
      videoUrl: derived[0].public_url,
      description: caption,
    })
    return { platformPostId: videoId, postRef: postRefFor('facebook', videoId) }
  }
  const { postId } = await fbPublishPhotoPost({
    token: account.token,
    pageId: account.external_id,
    imageUrls: urlsOf(derived),
    caption,
  })
  return { platformPostId: postId, postRef: postRefFor('facebook', postId) }
}

/** Create the Meta-side scheduled post. Returns the Page Post id Planner shows (Video id for videos). */
export async function scheduleOnFacebook(
  input: PublishInput & { scheduledAt: Date }
): Promise<PublishResult> {
  const { post, account, derived, scheduledAt } = input
  const caption = post.caption ?? ''
  if (post.post_type === 'video') {
    const { videoId } = await fbPublishVideo({
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

function notReadyError(): MetaApiError {
  return new MetaApiError(
    200,
    { message: 'Instagram media is still processing; will retry', code: 9007, error_subcode: 2207027 },
    'Instagram container not ready'
  )
}

export async function publishToInstagram(input: PublishInput): Promise<PublishResult> {
  const { post, account, derived, onContainer, sleep, deadline } = input
  const token = account.token
  const igUserId = account.external_id
  const caption = post.caption ?? ''

  // How long one container wait may take: the per-type cap, cut to whatever
  // is left before the caller's deadline.
  const budget = (cap: number) => {
    if (deadline == null) return cap
    return Math.max(0, Math.min(cap, deadline - Date.now()))
  }
  const wait = async (containerId: string, cap: number) => {
    const maxWaitMs = budget(cap)
    if (maxWaitMs <= 0) throw notReadyError()
    return igWaitForContainer({ token, containerId, maxWaitMs, sleep })
  }
  const finish = async (creationId: string) => {
    const mediaId = await igPublish({ token, igUserId, creationId })
    return { platformPostId: mediaId, postRef: postRefFor('instagram', mediaId) }
  }

  // Resume: a previous attempt already created the container (persisted via
  // onContainer). Containers stay valid ~24h, so never start a fresh one —
  // that restarts reel processing from zero and, if the earlier
  // media_publish actually went through, posts the media twice.
  if (post.ig_container_id) {
    const containerId = post.ig_container_id
    const state = await igGetContainerStatus({ token, containerId })
    if (state.statusCode === 'PUBLISHED') {
      // media_publish succeeded on the earlier attempt but its response was
      // lost. The container has no media id field; record the container.
      return { platformPostId: containerId, postRef: postRefFor('instagram', containerId) }
    }
    if (state.statusCode === 'FINISHED') return finish(containerId)
    if (state.statusCode === 'IN_PROGRESS') {
      await wait(containerId, post.post_type === 'video' ? IG_VIDEO_WAIT_MS : IG_IMAGE_WAIT_MS)
      return finish(containerId)
    }
    // ERROR / EXPIRED: fall through and create a new container.
  }

  let creationId: string
  if (post.post_type === 'video') {
    creationId = await igCreateReel({ token, igUserId, videoUrl: derived[0].public_url, caption })
    await onContainer?.(creationId)
    await wait(creationId, IG_VIDEO_WAIT_MS)
  } else if (post.post_type === 'carousel') {
    const children: string[] = []
    for (const d of derived) {
      const id = await igCreateImageContainer({ token, igUserId, imageUrl: d.public_url, isCarouselItem: true })
      children.push(id)
    }
    for (const id of children) await wait(id, IG_IMAGE_WAIT_MS)
    creationId = await igCreateCarousel({ token, igUserId, children, caption })
    await onContainer?.(creationId)
    await wait(creationId, IG_IMAGE_WAIT_MS)
  } else {
    creationId = await igCreateImageContainer({ token, igUserId, imageUrl: derived[0].public_url, caption })
    await onContainer?.(creationId)
    await wait(creationId, IG_IMAGE_WAIT_MS)
  }

  return finish(creationId)
}

export async function publishNow(input: PublishInput): Promise<PublishResult> {
  return input.post.platform === 'facebook' ? publishToFacebook(input) : publishToInstagram(input)
}

export function errorMessage(err: unknown): string {
  if (err instanceof MetaApiError) {
    return err.userMessage ? `${err.message} — ${err.userMessage}` : err.message
  }
  return err instanceof Error ? err.message : 'Unknown error'
}

/**
 * After Meta confirmed a publish: record it. NEVER moves the row to 'failed'
 * — the post is live, so a DB hiccup here must not produce a Retry button
 * that would publish it again. Returns false when the record could not be
 * written (already logged by the caller).
 */
export async function recordPublished(
  store: SocialStore,
  post: SocialPost,
  out: PublishResult,
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
    // 'publishing' (the cron's stale sweep surfaces it) — never 'failed'.
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

// ─── Cron runner ─────────────────────────────────────────────────────────────

export interface RunDeps {
  store: SocialStore
  now: Date
  /** Injected so tests never touch Meta. */
  publish?: (input: PublishInput) => Promise<PublishResult>
  /** Injected: is the Meta-held scheduled FB post live yet? */
  fbPostState?: (token: string, postId: string, kind: FbObjectKind) => Promise<{ isPublished: boolean | null }>
  maxPerRun?: number
  /**
   * Wall-clock budget for the whole run (ms from entry). Rows are only
   * claimed while enough of it remains, and each publish gets the remainder
   * as its deadline, so the function returns before Vercel kills it with
   * claimed rows stranded in 'publishing'.
   */
  budgetMs?: number
  onError?: (message: string, postId: string) => void
}

export interface RunResult {
  published: string[]
  retried: string[]
  failed: string[]
  skipped: string[]
  /** Rows swept from a stale 'publishing' to 'failed'. */
  stale: string[]
  fbWentLive: string[]
  fbMissing: string[]
}

// Default run budget: cron maxDuration 300 s minus headroom for the FB sweep
// and the response. Claiming stops when less than one image wait remains.
export const DEFAULT_RUN_BUDGET_MS = 240_000
const CLAIM_RESERVE_MS = IG_IMAGE_WAIT_MS

/**
 * One cron pass. Every due row is claimed with a compare-and-swap before any
 * network call, so two overlapping runs can never publish the same post.
 */
export async function runSocialPublish(deps: RunDeps): Promise<RunResult> {
  const {
    store,
    now,
    publish = publishNow,
    fbPostState = defaultFbPostState,
    maxPerRun = 10,
    budgetMs = DEFAULT_RUN_BUDGET_MS,
    onError = () => {},
  } = deps
  const result: RunResult = {
    published: [],
    retried: [],
    failed: [],
    skipped: [],
    stale: [],
    fbWentLive: [],
    fbMissing: [],
  }
  const deadline = Date.now() + budgetMs

  // 1. Rows a killed function left behind: surface them as 'failed' so /m
  //    shows Retry (which resumes the persisted container).
  result.stale = await store.failStale(new Date(now.getTime() - STALE_PUBLISHING_MS))

  // 2. Due rows.
  const due = await store.listDue(now, maxPerRun)
  for (const post of due) {
    if (Date.now() > deadline - CLAIM_RESERVE_MS) {
      // Out of budget: leave the rest 'approved' for the next tick.
      result.skipped.push(post.id)
      continue
    }

    // Everything that can fail without Meta happens BEFORE the claim, so a
    // missing account or a bad encryption key never strands a 'publishing' row.
    let account: SocialAccount | null
    try {
      account = await store.loadAccount(post.org_id, post.platform)
    } catch (err) {
      const msg = errorMessage(err)
      onError(msg, post.id)
      await store.transitionFrom(post.id, 'approved', { status: 'failed', last_error: msg })
      result.failed.push(post.id)
      continue
    }
    if (!account) {
      await store.transitionFrom(post.id, 'approved', {
        status: 'failed',
        last_error: new MissingAccountError(post.platform).message,
      })
      result.failed.push(post.id)
      continue
    }
    if (!post.derived_media || post.derived_media.length === 0) {
      await store.transitionFrom(post.id, 'approved', {
        status: 'failed',
        last_error: 'Media was never prepared; unapprove and approve again',
      })
      result.failed.push(post.id)
      continue
    }

    const claimed = await store.claim(post)
    if (!claimed) {
      result.skipped.push(post.id)
      continue
    }
    const claimedPost: SocialPost = { ...post, status: 'publishing', attempts: post.attempts + 1 }

    let out: PublishResult
    try {
      out = await publish({
        post: claimedPost,
        account,
        derived: post.derived_media,
        onContainer: (id) => store.update(post.id, { ig_container_id: id }),
        deadline,
      })
    } catch (err) {
      const transient = isTransientMetaError(err)
      const next = failureOutcome(claimedPost, transient)
      const status = next.ok ? next.value : 'failed'
      await store.update(post.id, { status, last_error: errorMessage(err) })
      if (status === 'approved') result.retried.push(post.id)
      else result.failed.push(post.id)
      continue
    }

    // Meta has the post. Recording it must never flip the row to 'failed'.
    await recordPublished(store, claimedPost, out, now, (msg) => onError(msg, post.id))
    result.published.push(post.id)
  }

  // 3. Facebook rows Meta was holding: once the time has passed (+ a minute
  //    of grace) read the published flag so the library shows them as posted.
  const grace = new Date(now.getTime() - 60_000)
  const held = await store.listScheduledFacebook(grace, maxPerRun)
  for (const post of held) {
    if (!post.platform_post_id) continue
    const account = await store.loadAccount(post.org_id, 'facebook')
    if (!account) continue
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
