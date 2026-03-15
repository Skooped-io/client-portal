import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCurrentOrgId(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  return data?.org_id ?? null
}

export async function getCurrentOrg(supabase: SupabaseClient) {
  const orgId = await getCurrentOrgId(supabase)
  if (!orgId) return null

  const { data } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single()

  return data
}
