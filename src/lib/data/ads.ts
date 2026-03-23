import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export interface AdsSnapshot {
  date: string
  total_spend: number
  total_clicks: number
  total_impressions: number
  total_conversions: number
  avg_cpc: number
  avg_ctr: number
  campaigns: Array<{
    name: string
    spend: number
    clicks: number
    impressions: number
    conversions: number
  }>
}

export interface AdsOverview {
  latest: AdsSnapshot | null
  trend: AdsSnapshot[]
  hasData: boolean
}

/**
 * Get latest ads metrics + trend for the current org.
 */
export async function getAdsOverview(days: number = 30): Promise<AdsOverview> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return { latest: null, trend: [], hasData: false }

  const { data } = await supabase
    .from('ads_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(days)

  if (!data || data.length === 0) {
    return { latest: null, trend: [], hasData: false }
  }

  return {
    latest: data[0] as AdsSnapshot,
    trend: (data as AdsSnapshot[]).reverse(),
    hasData: true,
  }
}
