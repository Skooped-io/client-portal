import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'
import {
  buildDraftPosts,
  CAROUSEL_MAX,
  INSTAGRAM_NOT_SUPPORTED_MESSAGE,
  PUBLISH_PLATFORMS,
  type MediaItem,
} from '@/lib/social/queue'
import { POST_COLUMNS, resolveMaterialOrg } from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PATH_LENGTH = 512
const FACEBOOK_ONLY = `Only Facebook can be queued here. ${INSTAGRAM_NOT_SUPPORTED_MESSAGE}`

/**
 * POST /api/material/queue
 *
 * Token-scoped (organizations.material_token). Turns a selection on the /m
 * page into a DRAFT social_posts row. Nothing is sent to Meta here; drafts
 * wait for Joseph's approve on the same page (/api/material/post), which
 * creates a Meta-held SCHEDULED post.
 *
 * Facebook only: Instagram has no scheduling API, so it is scheduled by hand
 * in Business Suite and the file marked posted on /m.
 *
 * Body: { token: string, paths: string[], platforms: ['facebook'] }
 * Response: { posts: SocialPost[] }
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { token, paths, platforms } = (body ?? {}) as {
    token?: unknown
    paths?: unknown
    platforms?: unknown
  }

  if (typeof token !== 'string') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.length > CAROUSEL_MAX ||
    paths.some((p) => typeof p !== 'string' || p.length === 0 || p.length > MAX_PATH_LENGTH)
  ) {
    return NextResponse.json(
      { error: paths && Array.isArray(paths) && paths.length > CAROUSEL_MAX
          ? `Pick at most ${CAROUSEL_MAX} files for one post`
          : 'Invalid request' },
      { status: 400 }
    )
  }
  if (
    !Array.isArray(platforms) ||
    platforms.length === 0 ||
    platforms.some((p) => !(PUBLISH_PLATFORMS as readonly unknown[]).includes(p))
  ) {
    return NextResponse.json({ error: FACEBOOK_ONLY }, { status: 400 })
  }

  const admin = createAdminClient()
  const org = await resolveMaterialOrg(admin, token)
  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Only files that belong to this org AND actually landed can be queued.
  const { data: uploads, error: loadError } = await admin
    .from('capture_uploads')
    .select('path, content_type')
    .eq('org_id', org.id)
    .not('uploaded_at', 'is', null)
    .in('path', paths as string[])
  if (loadError) {
    portal.error('material.queue', loadError.message)
    return NextResponse.json({ error: 'Could not load files' }, { status: 500 })
  }
  const byPath = new Map((uploads ?? []).map((u) => [u.path, u.content_type as string]))
  const selection: MediaItem[] = []
  for (const p of paths as string[]) {
    const contentType = byPath.get(p)
    if (!contentType) {
      return NextResponse.json({ error: 'One of the selected files is not available' }, { status: 400 })
    }
    selection.push({ path: p, content_type: contentType })
  }

  const drafts = buildDraftPosts(selection, platforms, new Date(), randomUUID())
  if (!drafts.ok) {
    return NextResponse.json({ error: drafts.error }, { status: 400 })
  }

  const { data: rows, error: insertError } = await admin
    .from('social_posts')
    .insert(drafts.value.map((d) => ({ ...d, org_id: org.id })))
    .select(POST_COLUMNS)
  if (insertError) {
    portal.error('material.queue', insertError.message)
    return NextResponse.json({ error: 'Could not queue posts' }, { status: 500 })
  }

  portal.event('material.queue', 'completed', {
    metadata: { orgId: org.id, files: selection.length, platforms: drafts.value.map((d) => d.platform) },
  })
  return NextResponse.json({ posts: rows ?? [] })
}
