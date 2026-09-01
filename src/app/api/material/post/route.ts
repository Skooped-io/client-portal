import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'
import {
  failureOutcome,
  mediaKind,
  parseScheduledAt,
  scheduleMode,
  transition,
  validateCaption,
  type SocialPost,
} from '@/lib/social/queue'
import {
  fbDeletePost,
  fbGetPost,
  isMetaObjectMissing,
  isTransientMetaError,
  MetaScheduleMismatchError,
} from '@/lib/social/meta'
import { prepareMediaForMeta } from '@/lib/social/media'
import {
  createSupabaseStore,
  errorMessage,
  fbObjectKind,
  MissingAccountError,
  POST_COLUMNS,
  publishNow,
  recordPublished,
  resolveMaterialOrg,
  scheduleOnFacebook,
  type PostPatch,
  type SocialAccount,
} from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Approve can render HEIC → JPEG for a 10-photo carousel and, inside the
// publish-now window, wait on an Instagram container. The publish gets a
// deadline well inside this limit (ROUTE_BUDGET_MS) so a slow reel returns
// the row to 'approved' for the cron instead of being killed mid-wait.
export const maxDuration = 120
const ROUTE_BUDGET_MS = 100_000

const ACTIONS = ['update', 'approve', 'unapprove', 'delete'] as const
type Action = (typeof ACTIONS)[number]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STALE = 'This post was changed elsewhere; reload the page'

/**
 * POST /api/material/post — the review gate.
 *
 * Token-scoped (organizations.material_token). One row, one action:
 *   update     caption / scheduled_at edits on a draft (or a failed row → draft)
 *   approve    validates caption + media, prepares derived JPEGs, then
 *              facebook: 20 min – 29 days out creates the Meta SCHEDULED
 *                        post now (Planner shows it; Meta publishes it)
 *                        → 'scheduled'
 *              instagram: → 'approved'; the social-publish cron ships it at
 *                        scheduled_at (no IG scheduling API)
 *              either:   within 2 minutes / past → publishes immediately;
 *                        2–20 min out → 'approved' for the cron
 *   unapprove  approved → draft; a scheduled FB post is deleted at Meta first
 *   delete     → cancelled (scheduled FB post deleted at Meta first)
 *
 * Every first status write is a compare-and-swap on the status the row was
 * loaded with, so two overlapping requests (double tap, second tab, a retry
 * while a slow approve is still running) can never both reach Meta.
 *
 * Body: { token, id, action, caption?, scheduled_at? }
 * Response: { post: SocialPost }  |  { error }
 */
export async function POST(request: NextRequest) {
  const started = Date.now()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { token, id, action, caption, scheduled_at } = (body ?? {}) as {
    token?: unknown
    id?: unknown
    action?: unknown
    caption?: unknown
    scheduled_at?: unknown
  }

  if (typeof token !== 'string') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (typeof id !== 'string' || id.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
  // social_posts.id is a uuid; anything else can never match, and would make
  // PostgREST answer 22P02 (a 500 + a logged DB error) instead of a 404.
  if (!UUID.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const org = await resolveMaterialOrg(admin, token)
  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: row, error: loadError } = await admin
    .from('social_posts')
    .select(POST_COLUMNS)
    .eq('id', id)
    .eq('org_id', org.id)
    .maybeSingle()
  if (loadError) {
    portal.error('material.post', loadError.message)
    return NextResponse.json({ error: 'Could not load post' }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const post = row as unknown as SocialPost
  const store = createSupabaseStore(admin)

  const reload = async () => {
    const { data } = await admin.from('social_posts').select(POST_COLUMNS).eq('id', post.id).maybeSingle()
    return data
  }
  const respond = async (status = 200) => NextResponse.json({ post: await reload() }, { status })
  const refuse = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

  /**
   * A Facebook object this row created that is still unpublished at Meta
   * (a held scheduled post, or the orphan of a failed schedule whose cleanup
   * delete did not go through): remove it before the row moves on. A LIVE
   * object is never deleted from here.
   *   'ok'        removed, or already gone
   *   'live'      Meta says it is published — leave it alone
   *   string      Meta refused; the message to surface
   */
  const removeHeldFbObject = async (account: SocialAccount): Promise<'ok' | 'live' | string> => {
    if (!post.platform_post_id) return 'ok'
    const kind = fbObjectKind(post.post_type)
    try {
      if (post.status === 'failed') {
        // Only a mismatch orphan is stored on a failed row; confirm it is
        // still unpublished before touching it.
        const state = await fbGetPost({ token: account.token, postId: post.platform_post_id, kind })
        if (state.isPublished) return 'live'
      }
      await fbDeletePost({ token: account.token, postId: post.platform_post_id })
      return 'ok'
    } catch (err) {
      return isMetaObjectMissing(err) ? 'ok' : errorMessage(err)
    }
  }

  try {
    switch (action as Action) {
      case 'update': {
        const next = transition(post, 'update')
        if (!next.ok) return refuse(next.error, 409)
        const cap = validateCaption(caption ?? post.caption, post.platform, { required: false })
        if (!cap.ok) return refuse(cap.error)
        const when = parseScheduledAt(scheduled_at === undefined ? post.scheduled_at : scheduled_at)
        if (!when.ok) return refuse(when.error)
        const moved = await store.transitionFrom(post.id, post.status, {
          status: next.value,
          caption: cap.value || null,
          scheduled_at: when.value ? when.value.toISOString() : null,
          last_error: null,
        })
        if (!moved) return refuse(STALE, 409)
        return respond()
      }

      case 'approve': {
        const next = transition(post, 'approve')
        if (!next.ok) return refuse(next.error, 409)
        const cap = validateCaption(caption ?? post.caption, post.platform, { required: true })
        if (!cap.ok) return refuse(cap.error)
        const when = parseScheduledAt(scheduled_at === undefined ? post.scheduled_at : scheduled_at)
        if (!when.ok) return refuse(when.error)
        const kind = mediaKind(post.media)
        if (!kind.ok) return refuse(kind.error)

        const account = await store.loadAccount(org.id, post.platform)
        if (!account) return refuse(new MissingAccountError(post.platform).message, 409)

        // Retry of a failed Facebook schedule that left an orphan at Meta:
        // clear it first so the retry cannot produce a duplicate.
        if (post.platform === 'facebook' && post.status === 'failed' && post.platform_post_id) {
          const removed = await removeHeldFbObject(account)
          if (removed === 'live') {
            return refuse(`This post is already live on Facebook (${post.platform_post_id}). Delete this row instead of retrying`, 409)
          }
          if (removed !== 'ok') return refuse(`Could not remove the earlier Facebook post: ${removed}`, 502)
        }

        let derived
        try {
          derived = await prepareMediaForMeta(post.media, { uniformRatio: post.post_type === 'carousel' })
        } catch (err) {
          const msg = errorMessage(err)
          portal.error('material.post.prepare', msg, { metadata: { postId: post.id } })
          return refuse(`Could not prepare media: ${msg}`, 500)
        }

        // Media prep can take tens of seconds: decide the mode from a fresh
        // clock so a post 20–21 minutes out is not handed to Meta already
        // under its scheduling floor.
        const now = new Date()
        const mode = scheduleMode(when.value, now, post.platform)
        const approvedPatch: PostPatch = {
          caption: cap.value,
          scheduled_at: when.value ? when.value.toISOString() : null,
          derived_media: derived,
          approved_at: now.toISOString(),
          last_error: null,
          // A container from a cut-off attempt is resumed on retry, but only
          // if the caption it was created with is unchanged.
          ig_container_id: cap.value === post.caption ? post.ig_container_id : null,
          platform_post_id: null,
          attempts: 0,
        }
        const approvedPost: SocialPost = { ...post, ...approvedPatch, status: 'approved' } as SocialPost
        const done = (extra: Record<string, unknown> = {}) =>
          portal.event('material.post.approve', 'completed', {
            metadata: { orgId: org.id, postId: post.id, platform: post.platform, mode, ...extra },
          })

        if (mode === 'cron') {
          const moved = await store.transitionFrom(post.id, post.status, { ...approvedPatch, status: 'approved' })
          if (!moved) return refuse(STALE, 409)
          done()
          return respond()
        }

        // Claim into 'publishing' BEFORE the Meta call: the loser of a race
        // stops here, and a crash mid-call leaves a visible 'publishing' row
        // (swept to 'failed' by the cron) rather than an 'approved' one the
        // cron would publish a second time.
        const claimed = await store.transitionFrom(post.id, post.status, {
          ...approvedPatch,
          status: 'publishing',
          attempts: 1,
        })
        if (!claimed) return refuse(STALE, 409)
        const claimedPost: SocialPost = { ...approvedPost, status: 'publishing', attempts: 1 }

        if (mode === 'fb-native') {
          try {
            const out = await scheduleOnFacebook({
              post: claimedPost,
              account,
              derived,
              scheduledAt: when.value as Date,
            })
            await store.update(post.id, { status: 'scheduled', platform_post_id: out.platformPostId })
            done({ metaPostId: out.platformPostId })
            return respond()
          } catch (err) {
            const msg = errorMessage(err)
            // A mismatch whose cleanup delete failed leaves a post at Meta;
            // keep its id so Retry/Delete can remove it.
            const orphan = err instanceof MetaScheduleMismatchError && !err.deleted ? err.postId : null
            await store.update(post.id, { status: 'failed', last_error: msg, platform_post_id: orphan })
            portal.error('material.post.schedule', msg, { metadata: { postId: post.id, orphan } })
            return respond()
          }
        }

        // publish-now
        let out
        try {
          out = await publishNow({
            post: claimedPost,
            account,
            derived,
            onContainer: (cid) => store.update(post.id, { ig_container_id: cid }),
            deadline: started + ROUTE_BUDGET_MS,
          })
        } catch (err) {
          const msg = errorMessage(err)
          // Transient (rate limit, container still processing at the
          // deadline): back to 'approved' with no time, so the next cron
          // tick resumes the persisted container.
          const next = failureOutcome(claimedPost, isTransientMetaError(err))
          const status = next.ok ? next.value : 'failed'
          await store.update(post.id, { status, last_error: msg })
          portal.error('material.post.publish', msg, { metadata: { postId: post.id, status } })
          return respond()
        }
        await recordPublished(store, claimedPost, out, new Date(), (msg) =>
          portal.error('material.post.record', msg, { metadata: { postId: post.id } })
        )
        done({ metaPostId: out.platformPostId })
        return respond()
      }

      case 'unapprove':
      case 'delete': {
        const event = action === 'unapprove' ? 'unapprove' : 'delete'
        const next = transition(post, event)
        if (!next.ok) return refuse(next.error, 409)

        if (post.platform === 'facebook' && post.platform_post_id && (post.status === 'scheduled' || post.status === 'failed')) {
          const account = await store.loadAccount(org.id, post.platform)
          if (!account) return refuse(new MissingAccountError(post.platform).message, 409)
          const removed = await removeHeldFbObject(account)
          if (removed !== 'ok' && removed !== 'live') {
            return refuse(`Could not remove the scheduled post from Facebook: ${removed}`, 502)
          }
        }

        const moved = await store.transitionFrom(post.id, post.status, {
          status: next.value,
          approved_at: null,
          platform_post_id: null,
          ig_container_id: null,
          last_error: null,
        })
        if (!moved) return refuse(STALE, 409)
        portal.event(`material.post.${event}`, 'completed', {
          metadata: { orgId: org.id, postId: post.id, from: post.status },
        })
        return respond()
      }
    }
  } catch (err) {
    const msg = errorMessage(err)
    portal.error('material.post', msg, { metadata: { postId: post.id, action } })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
