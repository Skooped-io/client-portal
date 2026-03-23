import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { revokeGoogleToken } from '@/lib/oauth/google'
import { portal } from '@/lib/logger'

export async function POST() {
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
    .select('access_token')
    .eq('org_id', orgId)
    .eq('provider', 'google')
    .single()

  if (!connection) {
    return NextResponse.json({ error: 'No Google connection found' }, { status: 404 })
  }

  // Attempt to revoke the token with Google (best effort)
  try {
    await revokeGoogleToken(connection.access_token)
  } catch (err) {
    // Log but don't fail — we still remove from DB
    console.error({ err, note: 'Google token revocation failed — removing from DB anyway' })
  }

  const { error } = await supabase
    .from('oauth_connections')
    .delete()
    .eq('org_id', orgId)
    .eq('provider', 'google')

  if (error) {
    console.error({ error })
    return NextResponse.json({ error: 'Failed to disconnect Google' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
