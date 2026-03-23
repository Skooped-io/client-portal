import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import AnalyticsPage from './analytics-client'
import type { AnalyticsPageData } from './analytics-client'

export const metadata: Metadata = { title: 'Analytics' }
export const revalidate = 300

export default async function AnalyticsServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <AnalyticsPage />

  const { data: rows } = await supabase
    .from('analytics_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(30)

  if (!rows || rows.length === 0) return <AnalyticsPage />

  const latest = rows[0]
  const trend = [...rows].reverse()

  const totalSessions = rows.reduce((sum, r) => sum + (r.sessions ?? 0), 0)
  const totalPageviews = rows.reduce((sum, r) => sum + (r.pageviews ?? 0), 0)
  const avgBounce = rows.reduce((sum, r) => sum + (r.bounce_rate ?? 0), 0) / rows.length
  const avgDuration = rows.reduce((sum, r) => sum + (r.avg_session_duration ?? 0), 0) / rows.length

  const data: AnalyticsPageData = {
    trafficData: trend.map(r => ({
      date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      visitors: r.users ?? 0,
      sessions: r.sessions ?? 0,
      pageviews: r.pageviews ?? 0,
    })),
    pageViewData: trend.map(r => ({
      date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      bounceRate: r.bounce_rate ?? 0,
      avgSession: r.avg_session_duration ?? 0,
    })),
    topPages: (latest.top_pages as Array<{ page: string; views: number }> ?? []).map(p => ({
      page: p.page,
      views: p.views,
      bounce: '—',
      time: '—',
    })),
    summary: {
      totalVisitors: rows.reduce((sum, r) => sum + (r.users ?? 0), 0),
      totalPageviews,
      avgBounce: Math.round(avgBounce * 10) / 10,
      avgSession: Math.round(avgDuration),
    },
  }

  return <AnalyticsPage data={data} />
}
