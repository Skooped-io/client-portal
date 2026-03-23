import type { Metadata } from 'next'
import { getAdsOverview } from '@/lib/data/ads'
import AdsPage from './ads-client'
import type { AdsPageData } from './ads-client'

export const metadata: Metadata = { title: 'Ads' }
export const revalidate = 300

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function AdsServerPage() {
  const { latest, trend, hasData } = await getAdsOverview(30)

  if (!hasData || !latest) return <AdsPage />

  const totalSpend = trend.reduce((a, s) => a + s.total_spend, 0)
  const totalLeads = trend.reduce((a, s) => a + s.total_conversions, 0)

  const data: AdsPageData = {
    summary: {
      totalSpend: Math.round(totalSpend),
      totalLeads,
      avgCpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      activeCampaigns: (latest.campaigns ?? []).length,
    },
    adSpendData: trend.map((s) => ({
      date: fmtDate(s.date),
      spend: s.total_spend,
      conversions: s.total_conversions,
      cpc: s.avg_cpc,
    })),
  }

  return <AdsPage data={data} />
}
