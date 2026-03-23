import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export interface DeploymentRow {
  id: string
  site_url: string | null
  repo_name: string | null
  vercel_project_id: string | null
  status: 'pending' | 'building' | 'live' | 'failed'
  template: string | null
  error_message: string | null
  deployed_at: string | null
  created_at: string
}

/**
 * Get the latest deployment for the current org.
 */
export async function getLatestDeployment(): Promise<DeploymentRow | null> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return null

  const { data } = await supabase
    .from('site_deployments')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return (data as DeploymentRow) ?? null
}

/**
 * Get all deployments for the current org.
 */
export async function getDeploymentHistory(limit: number = 10): Promise<DeploymentRow[]> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return []

  const { data } = await supabase
    .from('site_deployments')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data as DeploymentRow[]) ?? []
}
