import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import ActivityPage from './activity-client'
import type { BotActivity, AgentId, ActionType } from '@/lib/activity-demo-data'

export const metadata: Metadata = { title: 'Activity' }
export const revalidate = 300

// Map database action_types to the component's ActionType
const ACTION_TYPE_MAP: Record<string, ActionType> = {
  data_sync: 'seo_scan',
  seo_audit: 'seo_scan',
  keyword_tracking: 'keyword_improved',
  ranking_alert: 'keyword_improved',
  site_deploy: 'website_deployed',
  site_update: 'website_health',
  site_redeploy: 'website_deployed',
  performance_check: 'website_health',
  site_down: 'website_health',
  content_post: 'social_scheduled',
  report_generated: 'analytics_report',
  report_emailed: 'analytics_report',
  onboarding: 'team_message',
  client_message: 'team_message',
  contact_received: 'team_message',
  gbp_review: 'review_detected',
  token_warning: 'website_health',
  custom_build_request: 'website_deployed',
  deploy_failed: 'website_health',
}

const VALID_AGENTS: AgentId[] = ['scout', 'bob', 'sierra', 'riley', 'cooper']

export default async function ActivityServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <ActivityPage />

  const { data: rows } = await supabase
    .from('agent_activity')
    .select('id, agent, action_type, description, metadata, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!rows || rows.length === 0) return <ActivityPage />

  const activities: BotActivity[] = rows.map(row => ({
    id: row.id,
    org_id: orgId,
    agent: (VALID_AGENTS.includes(row.agent as AgentId) ? row.agent : 'cooper') as AgentId,
    action_type: ACTION_TYPE_MAP[row.action_type] ?? 'team_message',
    title: row.action_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    description: row.description ?? '',
    metadata: row.metadata as Record<string, unknown> ?? {},
    read: false,
    created_at: row.created_at,
  }))

  return <ActivityPage initialActivities={activities} />
}
