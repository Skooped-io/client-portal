import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export interface AgentActivityRow {
  id: string
  agent: string
  action_type: string
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
}

/**
 * Get recent agent activity for the current org.
 */
export async function getAgentActivity(limit: number = 50): Promise<{
  activities: AgentActivityRow[]
  hasData: boolean
}> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return { activities: [], hasData: false }

  const { data } = await supabase
    .from('agent_activity')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data || data.length === 0) {
    return { activities: [], hasData: false }
  }

  return {
    activities: data as AgentActivityRow[],
    hasData: true,
  }
}
