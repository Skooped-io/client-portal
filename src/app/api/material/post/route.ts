import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'
import {
  INSTAGRAM_NOT_SUPPORTED_MESSAGE,
  mediaKind,
  OUT_OF_WINDOW_MESSAGE,
  parseScheduledAt,
  PUBLISH_PLATFORMS,
  scheduleMode,
  transition,
  validateCaption,
  type SocialPost,
} from '@/lib/social/queue'
import { fbDeletePost, fbGetPost, isMetaObjectMissing, MetaScheduleMismatchError } from '@/lib/social/meta'
import { prepareMediaForMeta } from '@/lib/social/media'
import {
  createSupabaseStore,
  errorMessage,
  fbObjectKind,
  MissingAccountError,
  POST_COLUMNS,
  resolveMaterialOrg,
  scheduleOnFacebook,
  type PostPatch,
  type SocialAccount,
} from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Approve can render HEIC → JPEG for a 10-photo carousel before the (fast)
// Meta scheduling call.
export const maxDuration = 120

const ACTIONS = ['update', 'approve', 'unapprove', 'delete'] as const
type Action = (typeof ACTIONS)[number]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STALE = 'This post was changed elsewhere; reload the page'

/**
 * POST /api/material/post — the review gate.
 *
 * Product rule (Joseph, 2026-09-01): the Meta API is only ever used to
 * SCHEDULE. Approve creates a Meta-held scheduled Facebook post; Joseph
 * reviews/edits/deletes it in Business Suite Planner and Meta publishes it
 * at the chosen time. Nothing is ever posted live from here, and there is no
 * cron fallback: a time outside Meta's 20 min – 29 day window (or no time)
 * is refused with OUT_OF_WINDOW_MESSAGE.
 *
 * Token-scoped (organizations.material_token). One row, one action:
 *   update     caption / scheduled_at edits on a draft (or a failed row → draft)
 *   approve    validates caption + time + media, prepares derived JPEGs, then
 *              creates the Meta SCHEDULED post → 'scheduled'
 *   unapprove  scheduled → draft; the held post is deleted at Meta first
 *              (refused if Meta already published it)
 *   delete     → cancelled (held post deleted at Meta first, same rule)
 *
 * Instagram rows (legacy, from the 8/31 design) accept only 'delete'.
 *
 * Every first status write is a compare-and-swap on the status the row was
 * loaded with, so two overlapping requests (double tap, second tab, a retry
 * while a slow approve is still running) can never both reach Meta.
 *
 * Body: { token, id, action, caption?, scheduled_at? }
 * Response: { post: SocialPost }  |  { error }
 */
export async function POST(request: NextRequest) {
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

  // Legacy Instagram rows: read-only apart from Delete (nothing to remove at Meta).
  if (!(PUBLISH_PLATFORMS as readonly string[]).includes(post.platform) && action !== 'delete') {
    return refuse(INSTAGRAM_NOT_SUPPORTED_MESSAGE)
  }

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
      // A failed row holds a mismatch orphan; a scheduled row holds the held
      // post, which Meta may already have published if its time passed
      // before the next tick flipped the row. Confirm it is still
      // unpublished before touching it.
      const state = await fbGetPost({ token: account.token, postId: post.platform_post_id, kind })
      if (state.isPublished) return 'live'
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
        // Cheap pre-check before any account lookup or media work; repeated
        // with a fresh clock after media prep.
        if (scheduleMode(when.value, new Date()) !== 'fb-native') return refuse(OUT_OF_WINDOW_MESSAGE)
        const scheduledAt = when.value as Date
        const kind = mediaKind(post.media)
        if (!kind.ok) return refuse(kind.error)

        const account = await store.loadAccount(org.id, post.platform)
        if (!account) return refuse(new MissingAccountError(post.platform).message, 409)

        // A failed schedule that left an orphan at Meta (a mismatch whose
        // cleanup delete did not go through) keeps its id on the row, and
        // 'update' carries that id along when it turns the failed row back
        // into a draft. Whatever the status, clear the orphan first so this
        // approve cannot produce a duplicate held post.
        if (post.platform_post_id) {
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

        // Media prep can take tens of seconds: re-check the window from a
        // fresh clock so a post 20–21 minutes out is not handed to Meta
        // already under its scheduling floor.
        const now = new Date()
        if (scheduleMode(scheduledAt, now) !== 'fb-native') return refuse(OUT_OF_WINDOW_MESSAGE)

        const approvedPatch: PostPatch = {
          caption: cap.value,
          scheduled_at: scheduledAt.toISOString(),
          derived_media: derived,
          approved_at: now.toISOString(),
          last_error: null,
          ig_container_id: null,
          platform_post_id: null,
          attempts: 1,
        }

        // Claim into 'publishing' BEFORE the Meta call: the loser of a race
        // stops here, and a crash mid-call leaves a visible 'publishing' row
        // (swept to 'failed' by the cron) rather than a draft that could be
        // approved a second time.
        const claimed = await store.transitionFrom(post.id, post.status, { ...approvedPatch, status: 'publishing' })
        if (!claimed) return refuse(STALE, 409)
        const claimedPost: SocialPost = { ...post, ...approvedPatch, status: 'publishing' } as SocialPost

        let out
        try {
          out = await scheduleOnFacebook({ post: claimedPost, account, derived, scheduledAt })
        } catch (err) {
          const msg = errorMessage(err)
          // A mismatch (or an unreadable read-back) whose cleanup delete
          // failed leaves a post at Meta; keep its id so Retry/Delete can
          // remove it instead of scheduling a second copy.
          const orphan = err instanceof MetaScheduleMismatchError && !err.deleted ? err.postId : null
          await store.update(post.id, { status: 'failed', last_error: msg, platform_post_id: orphan })
          portal.error('material.post.schedule', msg, { metadata: { postId: post.id, orphan } })
          return respond()
        }

        // Meta has accepted the post: from here the id must never be lost,
        // or Retry would create a duplicate. One retry of the success write,
        // then park the row as failed WITH the id (Retry clears it at Meta
        // first; Delete removes it).
        const scheduledPatch: PostPatch = { status: 'scheduled', platform_post_id: out.platformPostId }
        try {
          try {
            await store.update(post.id, scheduledPatch)
          } catch {
            await store.update(post.id, scheduledPatch)
          }
        } catch (err) {
          const msg = errorMessage(err)
          await store.update(post.id, {
            status: 'failed',
            platform_post_id: out.platformPostId,
            last_error: `Scheduled at Facebook (${out.platformPostId}) but the row could not be updated: ${msg}. Retry will replace the held post`,
          })
          portal.error('material.post.schedule.record', msg, { metadata: { postId: post.id, orphan: out.platformPostId } })
          return respond()
        }
        portal.event('material.post.approve', 'completed', {
          metadata: { orgId: org.id, postId: post.id, platform: post.platform, metaPostId: out.platformPostId },
        })
        return respond()
      }

      case 'unapprove':
      case 'delete': {
        const event = action === 'unapprove' ? 'unapprove' : 'delete'
        const next = transition(post, event)
        if (!next.ok) return refuse(next.error, 409)

        // Any Facebook object this row still points at — the held post of a
        // 'scheduled' row, or the orphan a failed schedule left behind (which
        // 'update' carries into a draft) — is removed at Meta before the id
        // is dropped from the row.
        if (post.platform === 'facebook' && post.platform_post_id) {
          const account = await store.loadAccount(org.id, post.platform)
          if (!account) return refuse(new MissingAccountError(post.platform).message, 409)
          const removed = await removeHeldFbObject(account)
          if (removed === 'live' && post.status === 'scheduled') {
            return refuse('This post already went live on Facebook; the next check will mark it Posted. Take it down on Facebook itself if needed', 409)
          }
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
