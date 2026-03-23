import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import ActivityPage from './activity-client'

export const metadata: Metadata = { title: 'Activity' }
export const revalidate = 300

export default async function ActivityServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <ActivityPage />

  const { data: activities } = await supabase
    .from('agent_activity')
    .select('id, agent, action_type, description, metadata, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  // TODO: pass activities as prop when activity-client.tsx accepts it
  // For now, the client component uses its demo data
  return <ActivityPage />
}
