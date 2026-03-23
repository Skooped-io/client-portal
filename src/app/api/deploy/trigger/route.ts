import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEPLOY_SERVER_URL = process.env.DEPLOY_SERVER_URL ?? 'https://skooped-deploy.onrender.com'
const DEPLOY_SERVER_SECRET = process.env.DEPLOY_SERVER_SECRET

/**
 * POST /api/deploy/trigger
 *
 * Triggers a re-deploy for the current user's org.
 * Called from the dashboard when client updates business info or images.
 * Requires authenticated user.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getCurrentOrgId(supabase)
  if (!orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 })
  }

  // Check if there's an existing live deployment
  const admin = createAdminClient()
  const { data: existingDeploy } = await admin
    .from('site_deployments')
    .select('id, status, site_url')
    .eq('org_id', orgId)
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!existingDeploy) {
    return NextResponse.json(
      { error: 'No live deployment found. Cannot re-deploy.' },
      { status: 400 }
    )
  }

  try {
    // Trigger deploy on Render
    const deployRes = await fetch(`${DEPLOY_SERVER_URL}/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(DEPLOY_SERVER_SECRET ? { Authorization: `Bearer ${DEPLOY_SERVER_SECRET}` } : {}),
      },
      body: JSON.stringify({ userId: user.id }),
    })

    if (!deployRes.ok) {
      const errorText = await deployRes.text()
      console.error('[deploy/trigger] Render deploy failed:', deployRes.status, errorText)
      portal.error('deploy.trigger', `Render returned ${deployRes.status}`)
      return NextResponse.json({ error: 'Deploy trigger failed' }, { status: 502 })
    }

    // Log activity
    await admin.from('agent_activity').insert({
      org_id: orgId,
      agent: 'bob',
      action_type: 'site_redeploy',
      description: 'Website re-deploy triggered from dashboard',
      metadata: { triggered_by: user.id, previous_url: existingDeploy.site_url },
    })

    portal.event('deploy.trigger', 'completed', { user_id: user.id })

    return NextResponse.json({ success: true, message: 'Re-deploy triggered' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[deploy/trigger] Error:', msg)
    portal.error('deploy.trigger', msg)
    return NextResponse.json({ error: 'Deploy trigger failed' }, { status: 500 })
  }
}
