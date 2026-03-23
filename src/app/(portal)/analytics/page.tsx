import type { Metadata } from 'next'
import { getAnalyticsOverview } from '@/lib/data/analytics'
import AnalyticsPage from './analytics-client'
import type { AnalyticsPageData } from './analytics-client'

export const metadata: Metadata = { title: 'Analytics' }
export const revalidate = 300

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function AnalyticsServerPage() {
  const { latest, trend, hasData } = await getAnalyticsOverview(30)

  if (!hasData || !latest) return <AnalyticsPage />

  const trafficData = trend.map((s) => ({
    date: fmtDate(s.date),
    visitors: s.users,
    sessions: s.sessions,
    pageviews: s.pageviews,
  }))

  const pageViewData = trend.map((s) => ({
    date: fmtDate(s.date),
    bounceRate: s.bounce_rate,
    avgSession: Math.round(s.avg_session_duration),
  }))

  const topPages = (latest.top_pages ?? []).map((p) => ({
    page: p.page,
    views: p.views,
    bounce: '—',
    time: '—',
  }))

  const data: AnalyticsPageData = {
    trafficData,
    pageViewData,
    topPages,
    summary: {
      totalVisitors: trend.reduce((a, s) => a + s.users, 0),
      totalPageviews: trend.reduce((a, s) => a + s.pageviews, 0),
      avgBounce: trend.reduce((a, s) => a + s.bounce_rate, 0) / Math.max(trend.length, 1),
      avgSession: trend.reduce((a, s) => a + s.avg_session_duration, 0) / Math.max(trend.length, 1),
    },
  }

  return <AnalyticsPage data={data} />
}
