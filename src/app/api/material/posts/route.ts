import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'
import { POST_COLUMNS, resolveMaterialOrg } from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMIT = 100

/**
 * GET /api/material/posts?token=...
 *
 * Token-scoped (organizations.material_token). The org's queue, newest first.
 * Cancelled rows are hidden (kept in the table for the audit trail).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const admin = createAdminClient()
  const org = await resolveMaterialOrg(admin, token)
  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('social_posts')
    .select(POST_COLUMNS)
    .eq('org_id', org.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (error) {
    portal.error('material.posts', error.message)
    return NextResponse.json({ error: 'Could not load posts' }, { status: 500 })
  }
  return NextResponse.json({ posts: data ?? [] })
}
