import type { Metadata } from 'next'
import { getSeoOverview } from '@/lib/data/seo'
import SeoPage from './seo-client'
import type { SeoPageData } from './seo-client'

export const metadata: Metadata = { title: 'SEO' }
export const revalidate = 300

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function changePct(current: number, prev: number): string {
  if (!prev) return ''
  const pct = ((current - prev) / prev) * 100
  return (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%'
}

export default async function SeoServerPage() {
  const { latest, trend, hasData } = await getSeoOverview(30)

  if (!hasData || !latest) return <SeoPage />

  const oldest = trend[0]

  const data: SeoPageData = {
    stats: [
      {
        label: 'Total Impressions',
        value: latest.total_impressions.toLocaleString(),
        change: oldest ? changePct(latest.total_impressions, oldest.total_impressions) : '',
        positive: !oldest || latest.total_impressions >= oldest.total_impressions,
      },
      {
        label: 'Total Clicks',
        value: latest.total_clicks.toLocaleString(),
        change: oldest ? changePct(latest.total_clicks, oldest.total_clicks) : '',
        positive: !oldest || latest.total_clicks >= oldest.total_clicks,
      },
      {
        label: 'Avg. Position',
        value: latest.avg_position.toFixed(1),
        change: oldest ? (latest.avg_position - oldest.avg_position).toFixed(1) : '',
        positive: !oldest || latest.avg_position <= oldest.avg_position,
      },
      {
        label: 'Avg. CTR',
        value: (latest.avg_ctr * 100).toFixed(1) + '%',
        change: oldest ? changePct(latest.avg_ctr, oldest.avg_ctr) : '',
        positive: !oldest || latest.avg_ctr >= oldest.avg_ctr,
      },
    ],
    impressions: trend.map((s) => ({
      date: fmtDate(s.date),
      impressions: s.total_impressions,
      clicks: s.total_clicks,
    })),
    keywords: (latest.top_queries ?? []).slice(0, 8).map((q) => ({
      keyword: q.query,
      position: Math.round(q.position),
      prev: Math.round(q.position),
      volume: q.impressions,
      clicks: q.clicks,
    })),
    pages: (latest.top_pages ?? []).map((p) => ({
      url: p.page,
      title: p.page === '/' ? 'Home' : p.page.replace(/^\//, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      clicks: p.clicks,
      impressions: p.impressions,
      ctr: p.impressions > 0 ? `${((p.clicks / p.impressions) * 100).toFixed(1)}%` : '0%',
      position: 0,
    })),
  }

  return <SeoPage data={data} />
}
