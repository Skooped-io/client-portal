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
  transition,
  type DerivedMediaItem,
  type Platform,
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
  igPublish,
  igWaitForContainer,
  isTransientMetaError,
  MetaApiError,
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
  update(id: string, patch: PostPatch): Promise<void>
  loadAccount(orgId: string, platform: Platform): Promise<SocialAccount | null>
  /** capture_uploads.posted_at + post_ref for every media path (same columns /api/material/mark writes). */
  stampPosted(orgId: string, paths: string[], postRef: string): Promise<void>
}

export const MIN_TOKEN_LENGTH = 16

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

    async loadAccount(orgId, platform) {
      const { data, error } = await admin
        .from('social_accounts')
        .select('id, org_id, platform, external_id, page_id, display_name, access_token_enc, token_expires_at')
        .eq('org_id', orgId)
        .eq('platform', platform)
        .maybeSingle()
      if (error) throw new Error(`loadAccount: ${error.message}`)
      if (!data) return null
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
      const { error } = await admin
        .from('capture_uploads')
        .update({ posted_at: new Date().toISOString(), post_ref: postRef.slice(0, 120) })
        .eq('org_id', orgId)
        .in('path', paths)
      if (error) throw new Error(`stampPosted: ${error.message}`)
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
  sleep?: (ms: number) => Promise<void>
}

export interface PublishResult {
  platformPostId: string
  postRef: string
}

function urlsOf(derived: DerivedMediaItem[]): string[] {
  return derived.map((d) => d.public_url)
}

function postRefFor(platform: Platform, id: string): string {
  return `${platform === 'facebook' ? 'fb' : 'ig'}:${id}`
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

/** Create the Meta-side scheduled post. Returns the Page Post id Planner shows. */
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

export async function publishToInstagram(input: PublishInput): Promise<PublishResult> {
  const { post, account, derived, onContainer, sleep } = input
  const token = account.token
  const igUserId = account.external_id
  const caption = post.caption ?? ''
  const wait = (containerId: string, maxWaitMs: number) =>
    igWaitForContainer({ token, containerId, maxWaitMs, sleep })

  let creationId: string
  if (post.post_type === 'video') {
    creationId = await igCreateReel({ token, igUserId, videoUrl: derived[0].public_url, caption })
    await onContainer?.(creationId)
    await wait(creationId, 240_000)
  } else if (post.post_type === 'carousel') {
    const children: string[] = []
    for (const d of derived) {
      const id = await igCreateImageContainer({ token, igUserId, imageUrl: d.public_url, isCarouselItem: true })
      children.push(id)
    }
    for (const id of children) await wait(id, 60_000)
    creationId = await igCreateCarousel({ token, igUserId, children, caption })
    await onContainer?.(creationId)
    await wait(creationId, 60_000)
  } else {
    creationId = await igCreateImageContainer({ token, igUserId, imageUrl: derived[0].public_url, caption })
    await onContainer?.(creationId)
    await wait(creationId, 60_000)
  }

  const mediaId = await igPublish({ token, igUserId, creationId })
  return { platformPostId: mediaId, postRef: postRefFor('instagram', mediaId) }
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

// ─── Cron runner ─────────────────────────────────────────────────────────────

export interface RunDeps {
  store: SocialStore
  now: Date
  /** Injected so tests never touch Meta. */
  publish?: (input: PublishInput) => Promise<PublishResult>
  /** Injected: is the Meta-held scheduled FB post live yet? */
  fbPostState?: (token: string, postId: string) => Promise<{ isPublished: boolean | null }>
  maxPerRun?: number
}

export interface RunResult {
  published: string[]
  retried: string[]
  failed: string[]
  skipped: string[]
  fbWentLive: string[]
  fbMissing: string[]
}

/**
 * One cron pass. Every due row is claimed with a compare-and-swap before any
 * network call, so two overlapping runs can never publish the same post.
 */
export async function runSocialPublish(deps: RunDeps): Promise<RunResult> {
  const { store, now, publish = publishNow, fbPostState = defaultFbPostState, maxPerRun = 20 } = deps
  const result: RunResult = { published: [], retried: [], failed: [], skipped: [], fbWentLive: [], fbMissing: [] }

  const due = await store.listDue(now, maxPerRun)
  for (const post of due) {
    const claimed = await store.claim(post)
    if (!claimed) {
      result.skipped.push(post.id)
      continue
    }
    const claimedPost: SocialPost = { ...post, status: 'publishing', attempts: post.attempts + 1 }

    const account = await store.loadAccount(post.org_id, post.platform)
    if (!account) {
      await store.update(post.id, { status: 'failed', last_error: new MissingAccountError(post.platform).message })
      result.failed.push(post.id)
      continue
    }
    if (!post.derived_media || post.derived_media.length === 0) {
      await store.update(post.id, { status: 'failed', last_error: 'Media was never prepared; unapprove and approve again' })
      result.failed.push(post.id)
      continue
    }

    try {
      const out = await publish({
        post: claimedPost,
        account,
        derived: post.derived_media,
        onContainer: (id) => store.update(post.id, { ig_container_id: id }),
      })
      await store.update(post.id, {
        status: transition(claimedPost, 'published').ok ? 'published' : claimedPost.status,
        published_at: now.toISOString(),
        platform_post_id: out.platformPostId,
        last_error: null,
      })
      await store.stampPosted(
        post.org_id,
        post.media.map((m) => m.path),
        out.postRef
      )
      result.published.push(post.id)
    } catch (err) {
      const transient = isTransientMetaError(err)
      const next = failureOutcome(claimedPost, transient)
      const status = next.ok ? next.value : 'failed'
      await store.update(post.id, { status, last_error: errorMessage(err) })
      if (status === 'approved') result.retried.push(post.id)
      else result.failed.push(post.id)
    }
  }

  // Facebook rows Meta was holding: once the time has passed (+ a minute of
  // grace) read is_published so the library shows them as posted.
  const grace = new Date(now.getTime() - 60_000)
  const held = await store.listScheduledFacebook(grace, maxPerRun)
  for (const post of held) {
    if (!post.platform_post_id) continue
    const account = await store.loadAccount(post.org_id, 'facebook')
    if (!account) continue
    try {
      const state = await fbPostState(account.token, post.platform_post_id)
      if (state.isPublished) {
        await store.update(post.id, { status: 'published', published_at: now.toISOString(), last_error: null })
        await store.stampPosted(
          post.org_id,
          post.media.map((m) => m.path),
          postRefFor('facebook', post.platform_post_id)
        )
        result.fbWentLive.push(post.id)
      }
    } catch (err) {
      if (err instanceof MetaApiError && (err.code === 100 || err.code === 803 || err.httpStatus === 404)) {
        // The scheduled post no longer exists: deleted in Business Suite Planner.
        await store.update(post.id, {
          status: 'cancelled',
          last_error: 'Scheduled post no longer exists on Facebook (deleted in Business Suite?)',
        })
        result.fbMissing.push(post.id)
      }
      // Anything else (rate limit, blip): leave it scheduled, check next run.
    }
  }

  return result
}

async function defaultFbPostState(token: string, postId: string) {
  const state = await fbGetPost({ token, postId })
  return { isPublished: state.isPublished }
}
