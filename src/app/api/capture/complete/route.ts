import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'
import { MAX_FILES_PER_REQUEST } from '@/lib/capture/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIN_TOKEN_LENGTH = 16

/**
 * POST /api/capture/complete
 *
 * Marks signed uploads as landed (uploaded_at) after the browser finishes the
 * direct-to-storage PUTs, so capture_uploads distinguishes issued URLs from
 * files that actually arrived. Token-scoped: only rows belonging to the
 * token's org can be flagged, and only paths the sign endpoint created.
 *
 * Body: { token: string, paths: string[] }
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { token, paths } = (body ?? {}) as { token?: unknown; paths?: unknown }

  if (typeof token !== 'string' || token.length < MIN_TOKEN_LENGTH) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.length > MAX_FILES_PER_REQUEST ||
    paths.some((p) => typeof p !== 'string' || p.length > 512)
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('capture_token', token)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: updated, error } = await admin
    .from('capture_uploads')
    .update({ uploaded_at: new Date().toISOString() })
    .eq('org_id', org.id)
    .in('path', paths as string[])
    .is('uploaded_at', null)
    .select('path')

  if (error) {
    portal.error('capture.complete', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  portal.event('capture.complete', 'completed', {
    metadata: { orgId: org.id, confirmed: updated?.length ?? 0 },
  })

  return NextResponse.json({ confirmed: updated?.length ?? 0 })
}
