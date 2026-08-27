import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'
import { cleanFreeText } from '@/lib/capture/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIN_TOKEN_LENGTH = 16
const MAX_PATHS = 100
const MAX_POST_REF_LENGTH = 120

/**
 * POST /api/material/mark
 *
 * Token-scoped (organizations.material_token): flips posted_at/post_ref on
 * capture_uploads rows so posted-vs-available tracking survives a human
 * posting by hand from the /m page. Only rows belonging to the token's org
 * can be touched. The future Meta-API poster writes the same columns.
 *
 * Body: { token: string, paths: string[], posted: boolean, post_ref?: string }
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { token, paths, posted, post_ref } = (body ?? {}) as {
    token?: unknown
    paths?: unknown
    posted?: unknown
    post_ref?: unknown
  }

  if (typeof token !== 'string' || token.length < MIN_TOKEN_LENGTH) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (
    typeof posted !== 'boolean' ||
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.length > MAX_PATHS ||
    paths.some((p) => typeof p !== 'string' || p.length > 512)
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('material_token', token)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: updated, error } = await admin
    .from('capture_uploads')
    .update({
      posted_at: posted ? new Date().toISOString() : null,
      post_ref: posted ? cleanFreeText(post_ref, MAX_POST_REF_LENGTH) : null,
    })
    .eq('org_id', org.id)
    .in('path', paths as string[])
    .select('path')

  if (error) {
    portal.error('material.mark', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  portal.event('material.mark', 'completed', {
    metadata: { orgId: org.id, posted, updated: updated?.length ?? 0 },
  })

  return NextResponse.json({ updated: updated?.length ?? 0 })
}
