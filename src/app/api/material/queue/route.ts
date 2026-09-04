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
import { loadGbpLocation, NO_GBP_LOCATION_MESSAGE, POST_COLUMNS, resolveMaterialOrg } from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PATH_LENGTH = 512
const PLATFORMS_HINT = `Only Facebook and Google Business can be queued here. ${INSTAGRAM_NOT_SUPPORTED_MESSAGE}`

/**
 * POST /api/material/queue
 *
 * Token-scoped (organizations.material_token). Turns a selection on the /m
 * page into DRAFT social_posts rows — one per platform, sharing a group_id.
 * Nothing is sent to Meta or Google here; drafts wait for Joseph's approve on
 * the same page (/api/material/post), which creates a vendor-held SCHEDULED
 * post.
 *
 * Platforms: any non-empty subset of ['facebook', 'google']. Instagram has no
 * scheduling API, so it is scheduled by hand in Business Suite and the file
 * marked posted on /m. 'google' is refused up front when the org has no
 * active mapped gbp_managed_locations row (nothing to schedule against).
 *
 * Body: { token: string, paths: string[], platforms: ('facebook'|'google')[] }
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
    return NextResponse.json({ error: PLATFORMS_HINT }, { status: 400 })
  }

  const admin = createAdminClient()
  const org = await resolveMaterialOrg(admin, token)
  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // A google draft is pointless without a mapped location: refuse at queue
  // time with the reason instead of letting approve fail later.
  if ((platforms as unknown[]).includes('google')) {
    let location
    try {
      location = await loadGbpLocation(admin, org.id)
    } catch (err) {
      portal.error('material.queue.gbp', err instanceof Error ? err.message : 'Unknown error')
      return NextResponse.json({ error: 'Could not check the Google Business connection' }, { status: 500 })
    }
    if (!location) {
      return NextResponse.json({ error: NO_GBP_LOCATION_MESSAGE }, { status: 400 })
    }
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
