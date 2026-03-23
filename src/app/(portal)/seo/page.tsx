import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import SeoPage from './seo-client'
import type { SeoPageData } from './seo-client'

export const metadata: Metadata = { title: 'SEO' }
export const revalidate = 300

export default async function SeoServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <SeoPage />

  const [latestRes, trendRes] = await Promise.all([
    supabase
      .from('seo_metrics')
      .select('*')
      .eq('org_id', orgId)
      .order('date', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('seo_metrics')
      .select('date, total_clicks, total_impressions')
      .eq('org_id', orgId)
      .order('date', { ascending: false })
      .limit(30),
  ])

  const latest = latestRes.data
  const trend = trendRes.data ?? []

  if (!latest) return <SeoPage />

  const data: SeoPageData = {
    totalClicks: latest.total_clicks,
    totalImpressions: latest.total_impressions,
    avgCtr: latest.avg_ctr,
    avgPosition: latest.avg_position,
    healthScore: Math.round(
      (Math.min(100, (latest.avg_ctr ?? 0) * 2000) +
        Math.max(0, 100 - ((latest.avg_position ?? 50) - 1) * 5)) / 2
    ),
    impressions: trend.reverse().map(row => ({
      date: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      impressions: row.total_impressions,
      clicks: row.total_clicks,
    })),
    keywords: (latest.top_queries as Array<{
      query: string
      clicks: number
      impressions: number
      ctr: number
      position: number
    }> ?? []).map(q => ({
      keyword: q.query,
      position: Math.round(q.position),
      prev: Math.round(q.position) + 1, // TODO: compare with previous period
      volume: q.impressions * 3, // estimated
      clicks: q.clicks,
    })),
    pages: (latest.top_pages as Array<{
      page: string
      clicks: number
      impressions: number
    }> ?? []).map(p => ({
      url: p.page,
      title: p.page === '/' ? 'Home' : p.page.replace(/^\//, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      clicks: p.clicks,
      impressions: p.impressions,
      ctr: p.impressions > 0 ? `${((p.clicks / p.impressions) * 100).toFixed(1)}%` : '0%',
      position: 0, // not available in page-level data
    })),
  }

  return <SeoPage data={data} />
}
