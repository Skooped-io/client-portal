import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import AdsPage from './ads-client'
import type { AdsPageData } from './ads-client'

export const metadata: Metadata = { title: 'Ads' }
export const revalidate = 300

export default async function AdsServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <AdsPage />

  const { data: rows } = await supabase
    .from('ads_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(30)

  if (!rows || rows.length === 0) return <AdsPage />

  const trend = [...rows].reverse()
  const totalSpend = rows.reduce((sum, r) => sum + (Number(r.total_spend) || 0), 0)
  const totalConversions = rows.reduce((sum, r) => sum + (r.total_conversions ?? 0), 0)
  const campaigns = (rows[0].campaigns as Array<{ name: string }>) ?? []

  const data: AdsPageData = {
    summary: {
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalLeads: totalConversions,
      avgCpl: totalConversions > 0 ? Math.round((totalSpend / totalConversions) * 100) / 100 : 0,
      activeCampaigns: campaigns.length,
    },
    adSpendData: trend.map(r => ({
      date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      spend: Number(r.total_spend) || 0,
      conversions: r.total_conversions ?? 0,
      cpc: Number(r.avg_cpc) || 0,
    })),
  }

  return <AdsPage data={data} />
}
