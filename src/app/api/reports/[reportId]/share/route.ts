import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { portal } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ reportId: string }>
}

/**
 * Loads the report for the logged-in user's org, or null if the user is not
 * authenticated, has no org, or the report belongs to another org.
 * Uses the session client, so RLS also enforces org scoping.
 */
async function getAuthorizedReport(reportId: string) {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)
  if (!orgId) return null

  const { data: report } = await supabase
    .from('reports')
    .select('id, org_id, share_token')
    .eq('id', reportId)
    .eq('org_id', orgId)
    .maybeSingle()

  return report as { id: string; org_id: string; share_token: string | null } | null
}

/**
 * POST /api/reports/[reportId]/share
 *
 * Generates (or returns the existing) share token for a report and responds
 * with the public URL. Auth: portal session, report must belong to the
 * caller's org. Idempotent: repeated calls return the same link.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { reportId } = await params
  const report = await getAuthorizedReport(reportId)

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  let token = report.share_token
  if (!token) {
    token = randomUUID()
    // RLS has no UPDATE policy on reports for members — write via service role
    // after the org-scoped select above proved authorization.
    const admin = createAdminClient()
    const { error } = await admin
      .from('reports')
      .update({ share_token: token })
      .eq('id', report.id)

    if (error) {
      console.error('[reports/share] token update failed:', error.message)
      return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 })
    }
  }

  const url = `${request.nextUrl.origin}/r/${token}`
  portal.api('POST', 'reports.share', 200, 0, { metadata: { reportId } })
  return NextResponse.json({ token, url })
}

/**
 * DELETE /api/reports/[reportId]/share
 *
 * Revokes a report's share token. The old public URL 404s immediately.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { reportId } = await params
  const report = await getAuthorizedReport(reportId)

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  if (report.share_token) {
    const admin = createAdminClient()
    const { error } = await admin
      .from('reports')
      .update({ share_token: null })
      .eq('id', report.id)

    if (error) {
      console.error('[reports/share] token revoke failed:', error.message)
      return NextResponse.json({ error: 'Failed to revoke share link' }, { status: 500 })
    }
  }

  portal.api('DELETE', 'reports.share', 200, 0, { metadata: { reportId } })
  return NextResponse.json({ success: true })
}
