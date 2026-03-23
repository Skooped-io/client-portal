import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { revokeMetaToken } from '@/lib/oauth/meta'
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
    .eq('provider', 'meta')
    .single()

  if (!connection) {
    return NextResponse.json({ error: 'No Meta connection found' }, { status: 404 })
  }

  try {
    await revokeMetaToken(connection.access_token)
  } catch (err) {
    console.error({ err, note: 'Meta token revocation failed — removing from DB anyway' })
  }

  const { error } = await supabase
    .from('oauth_connections')
    .delete()
    .eq('org_id', orgId)
    .eq('provider', 'meta')

  if (error) {
    console.error({ error })
    return NextResponse.json({ error: 'Failed to disconnect Meta' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
