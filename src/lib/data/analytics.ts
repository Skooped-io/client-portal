import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export interface AnalyticsSnapshot {
  date: string
  sessions: number
  users: number
  pageviews: number
  bounce_rate: number
  avg_session_duration: number
  traffic_sources: Array<{
    source: string
    sessions: number
    percentage: number
  }>
  top_pages: Array<{
    page: string
    views: number
  }>
  property_id: string | null
}

export interface AnalyticsOverview {
  latest: AnalyticsSnapshot | null
  trend: AnalyticsSnapshot[]
  hasData: boolean
}

/**
 * Get latest analytics metrics + trend for the current org.
 */
export async function getAnalyticsOverview(days: number = 30): Promise<AnalyticsOverview> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return { latest: null, trend: [], hasData: false }

  const { data } = await supabase
    .from('analytics_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(days)

  if (!data || data.length === 0) {
    return { latest: null, trend: [], hasData: false }
  }

  return {
    latest: data[0] as AnalyticsSnapshot,
    trend: (data as AnalyticsSnapshot[]).reverse(),
    hasData: true,
  }
}
