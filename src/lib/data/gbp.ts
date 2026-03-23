import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export interface GbpSnapshot {
  date: string
  total_reviews: number
  avg_rating: number
  new_reviews: number
  search_views: number
  map_views: number
  website_clicks: number
  direction_requests: number
  phone_calls: number
  recent_reviews: Array<{
    author: string
    rating: number
    text: string
    date: string
  }>
}

export interface GbpOverview {
  latest: GbpSnapshot | null
  trend: GbpSnapshot[]
  hasData: boolean
}

/**
 * Get latest GBP metrics + trend for the current org.
 */
export async function getGbpOverview(days: number = 30): Promise<GbpOverview> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return { latest: null, trend: [], hasData: false }

  const { data } = await supabase
    .from('gbp_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(days)

  if (!data || data.length === 0) {
    return { latest: null, trend: [], hasData: false }
  }

  return {
    latest: data[0] as GbpSnapshot,
    trend: (data as GbpSnapshot[]).reverse(),
    hasData: true,
  }
}
