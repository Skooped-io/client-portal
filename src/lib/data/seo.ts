import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export interface SeoSnapshot {
  date: string
  total_clicks: number
  total_impressions: number
  avg_ctr: number
  avg_position: number
  top_queries: Array<{
    query: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
  top_pages: Array<{
    page: string
    clicks: number
    impressions: number
  }>
  site_url: string | null
}

export interface SeoOverview {
  latest: SeoSnapshot | null
  trend: SeoSnapshot[]
  hasData: boolean
}

/**
 * Get latest SEO metrics + 30-day trend for the current org.
 */
export async function getSeoOverview(days: number = 30): Promise<SeoOverview> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return { latest: null, trend: [], hasData: false }

  const { data } = await supabase
    .from('seo_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(days)

  if (!data || data.length === 0) {
    return { latest: null, trend: [], hasData: false }
  }

  return {
    latest: data[0] as SeoSnapshot,
    trend: (data as SeoSnapshot[]).reverse(), // oldest first for charts
    hasData: true,
  }
}

/**
 * Get top queries for the current org (from latest snapshot).
 */
export async function getTopQueries(limit: number = 25): Promise<Array<{
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}>> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return []

  const { data } = await supabase
    .from('seo_metrics')
    .select('top_queries')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (!data?.top_queries) return []

  return (data.top_queries as Array<{
    query: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>).slice(0, limit)
}
