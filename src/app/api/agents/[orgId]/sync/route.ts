import { NextRequest, NextResponse } from 'next/server'
import { verifyServiceApiKey, getDecryptedOauthToken } from '@/lib/agents/auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface SyncResult {
  provider: string
  synced: boolean
  error?: string
}

interface SyncResponse {
  orgId: string
  triggeredAt: string
  results: SyncResult[]
}

interface AgentParams {
  params: Promise<{ orgId: string }>
}

/**
 * POST /api/agents/[orgId]/sync
 *
 * Triggers a manual data sync for all connected providers for the given org.
 * Used by agents to pull fresh data on demand.
 */
export async function POST(request: NextRequest, { params }: AgentParams) {
  if (!verifyServiceApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await params
  const supabase = createAdminClient()

  // Verify the org exists
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  const results: SyncResult[] = []

  // Check Google connection
  const googleToken = await getDecryptedOauthToken(orgId, 'google')
  if (googleToken) {
    // TODO: Trigger GSC, GBP, Analytics, Ads data pulls
    // These will call each respective route or call the APIs directly
    results.push({ provider: 'google', synced: true })
  } else {
    results.push({ provider: 'google', synced: false, error: 'No active Google connection' })
  }

  // Check Meta connection
  const metaToken = await getDecryptedOauthToken(orgId, 'meta')
  if (metaToken) {
    // TODO: Trigger Instagram and Facebook data pulls
    results.push({ provider: 'meta', synced: true })
  } else {
    results.push({ provider: 'meta', synced: false, error: 'No active Meta connection' })
  }

  const response: SyncResponse = {
    orgId,
    triggeredAt: new Date().toISOString(),
    results,
  }

  return NextResponse.json(response)
}
