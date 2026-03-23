import type { Metadata } from 'next'
import { getAgentActivity } from '@/lib/data/activity'
import ActivityPage from './activity-client'
import type { BotActivity, AgentId, ActionType } from '@/lib/activity-demo-data'

export const metadata: Metadata = { title: 'Activity' }
export const revalidate = 300

const ACTION_TYPE_MAP: Record<string, ActionType> = {
  seo_audit:         'seo_scan',
  keyword_tracking:  'keyword_improved',
  ranking_alert:     'keyword_improved',
  data_sync:         'analytics_report',
  report_generated:  'analytics_report',
  site_deploy:       'website_deployed',
  site_update:       'website_health',
  performance_check: 'website_health',
  gbp_review:        'review_detected',
  content_post:      'social_scheduled',
  onboarding:        'team_message',
  client_message:    'team_message',
}

const VALID_AGENTS: AgentId[] = ['scout', 'bob', 'sierra', 'riley', 'cooper']

function mapActionType(t: string): ActionType {
  return ACTION_TYPE_MAP[t] ?? 'analytics_report'
}

function mapAgent(a: string): AgentId {
  return VALID_AGENTS.includes(a as AgentId) ? (a as AgentId) : 'scout'
}

function deriveTitle(description: string | null): string {
  if (!description) return 'Agent activity'
  const first = description.split(/[.!?]/)[0].trim()
  return first.length > 60 ? first.slice(0, 57) + '…' : first
}

export default async function ActivityServerPage() {
  const { activities, hasData } = await getAgentActivity(50)

  if (!hasData) return <ActivityPage />

  const mapped: BotActivity[] = activities.map((row) => ({
    id:          row.id,
    org_id:      '',
    agent:       mapAgent(row.agent),
    action_type: mapActionType(row.action_type),
    title:       deriveTitle(row.description),
    description: row.description ?? '',
    metadata:    Object.keys(row.metadata ?? {}).length > 0 ? row.metadata : undefined,
    read:        false,
    created_at:  row.created_at,
  }))

  return <ActivityPage initialActivities={mapped} />
}
