import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'
import {
  mediaKind,
  parseScheduledAt,
  scheduleMode,
  transition,
  validateCaption,
  type SocialPost,
} from '@/lib/social/queue'
import { fbDeletePost, MetaApiError } from '@/lib/social/meta'
import { prepareMediaForMeta } from '@/lib/social/media'
import {
  createSupabaseStore,
  errorMessage,
  MissingAccountError,
  POST_COLUMNS,
  publishNow,
  resolveMaterialOrg,
  scheduleOnFacebook,
  type PostPatch,
} from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Approve can render HEIC → JPEG for a 10-photo carousel and, inside the
// 10-minute window, wait on an Instagram container. Keep headroom.
export const maxDuration = 120

const ACTIONS = ['update', 'approve', 'unapprove', 'delete'] as const
type Action = (typeof ACTIONS)[number]

/**
 * POST /api/material/post — the review gate.
 *
 * Token-scoped (organizations.material_token). One row, one action:
 *   update     caption / scheduled_at edits on a draft (or a failed row → draft)
 *   approve    validates caption + media, prepares derived JPEGs, then
 *              facebook: creates the Meta SCHEDULED post now (Planner shows
 *                        it; Meta publishes it) → 'scheduled'; inside the
 *                        10-min window publishes immediately → 'published'
 *              instagram: → 'approved'; the social-publish cron ships it at
 *                        scheduled_at (no IG scheduling API); inside the
 *                        window publishes immediately
 *   unapprove  approved → draft; a scheduled FB post is deleted at Meta first
 *   delete     → cancelled (scheduled FB post deleted at Meta first)
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
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
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
  const now = new Date()

  const reload = async () => {
    const { data } = await admin.from('social_posts').select(POST_COLUMNS).eq('id', post.id).maybeSingle()
    return data
  }
  const respond = async (status = 200) => NextResponse.json({ post: await reload() }, { status })
  const refuse = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

  try {
    switch (action as Action) {
      case 'update': {
        const next = transition(post, 'update')
        if (!next.ok) return refuse(next.error, 409)
        const cap = validateCaption(caption ?? post.caption, post.platform, { required: false })
        if (!cap.ok) return refuse(cap.error)
        const when = parseScheduledAt(scheduled_at === undefined ? post.scheduled_at : scheduled_at)
        if (!when.ok) return refuse(when.error)
        await store.update(post.id, {
          status: next.value,
          caption: cap.value || null,
          scheduled_at: when.value ? when.value.toISOString() : null,
          last_error: null,
        })
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

        let derived
        try {
          derived = await prepareMediaForMeta(post.media)
        } catch (err) {
          const msg = errorMessage(err)
          portal.error('material.post.prepare', msg, { metadata: { postId: post.id } })
          return refuse(`Could not prepare media: ${msg}`, 500)
        }

        const mode = scheduleMode(when.value, now, post.platform)
        const approvedPatch: PostPatch = {
          caption: cap.value,
          scheduled_at: when.value ? when.value.toISOString() : null,
          derived_media: derived,
          approved_at: now.toISOString(),
          last_error: null,
          ig_container_id: null,
          platform_post_id: null,
        }
        const approvedPost: SocialPost = { ...post, ...approvedPatch, status: 'approved' } as SocialPost

        if (mode === 'cron') {
          await store.update(post.id, { ...approvedPatch, status: 'approved' })
          portal.event('material.post.approve', 'completed', {
            metadata: { orgId: org.id, postId: post.id, platform: post.platform, mode },
          })
          return respond()
        }

        if (mode === 'fb-native') {
          // Status 'approved' first so a crash after the Meta call leaves a
          // row the cron can still see; then 'scheduled' with the post id.
          await store.update(post.id, { ...approvedPatch, status: 'approved' })
          try {
            const out = await scheduleOnFacebook({
              post: approvedPost,
              account,
              derived,
              scheduledAt: when.value as Date,
            })
            await store.update(post.id, { status: 'scheduled', platform_post_id: out.platformPostId })
            portal.event('material.post.approve', 'completed', {
              metadata: { orgId: org.id, postId: post.id, platform: post.platform, mode, metaPostId: out.platformPostId },
            })
            return respond()
          } catch (err) {
            const msg = errorMessage(err)
            await store.update(post.id, { status: 'failed', last_error: msg })
            portal.error('material.post.schedule', msg, { metadata: { postId: post.id } })
            return respond()
          }
        }

        // publish-now: claim straight into 'publishing' so an overlapping cron
        // run can never pick the same row (it only claims 'approved').
        await store.update(post.id, { ...approvedPatch, status: 'publishing', attempts: post.attempts + 1 })
        try {
          const out = await publishNow({
            post: { ...approvedPost, status: 'publishing' },
            account,
            derived,
            onContainer: (cid) => store.update(post.id, { ig_container_id: cid }),
          })
          await store.update(post.id, {
            status: 'published',
            published_at: new Date().toISOString(),
            platform_post_id: out.platformPostId,
          })
          await store.stampPosted(org.id, post.media.map((m) => m.path), out.postRef)
          portal.event('material.post.approve', 'completed', {
            metadata: { orgId: org.id, postId: post.id, platform: post.platform, mode, metaPostId: out.platformPostId },
          })
          return respond()
        } catch (err) {
          const msg = errorMessage(err)
          await store.update(post.id, { status: 'failed', last_error: msg })
          portal.error('material.post.publish', msg, { metadata: { postId: post.id } })
          return respond()
        }
      }

      case 'unapprove':
      case 'delete': {
        const event = action === 'unapprove' ? 'unapprove' : 'delete'
        const next = transition(post, event)
        if (!next.ok) return refuse(next.error, 409)

        if (post.status === 'scheduled' && post.platform_post_id) {
          const account = await store.loadAccount(org.id, post.platform)
          if (!account) return refuse(new MissingAccountError(post.platform).message, 409)
          try {
            await fbDeletePost({ token: account.token, postId: post.platform_post_id })
          } catch (err) {
            const gone = err instanceof MetaApiError && (err.code === 100 || err.code === 803 || err.httpStatus === 404)
            if (!gone) {
              return refuse(`Could not remove the scheduled post from Facebook: ${errorMessage(err)}`, 502)
            }
          }
        }

        await store.update(post.id, {
          status: next.value,
          approved_at: null,
          platform_post_id: null,
          ig_container_id: null,
          last_error: null,
        })
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
