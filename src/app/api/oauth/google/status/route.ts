import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const orgId = await getCurrentOrgId(supabase)
  if (!orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  }

  const { data: connection } = await supabase
    .from('oauth_connections')
    .select(
      'provider_email, status, connected_services, expires_at, last_refreshed_at, refresh_error, metadata'
    )
    .eq('org_id', orgId)
    .eq('provider', 'google')
    .single()

  if (!connection) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: connection.status === 'active',
    status: connection.status,
    provider_email: connection.provider_email,
    connected_services: connection.connected_services,
    expires_at: connection.expires_at,
    last_refreshed_at: connection.last_refreshed_at,
    refresh_error: connection.refresh_error,
    metadata: connection.metadata,
  })
}
