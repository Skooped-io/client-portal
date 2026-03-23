import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import ReportsPage from './reports-client'
import type { ReportsPageData, SerializableReport, SerializableMetric } from './reports-client'

export const metadata: Metadata = { title: 'Reports' }
export const revalidate = 300

export default async function ReportsServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <ReportsPage />

  const { data: rows } = await supabase
    .from('reports')
    .select('*')
    .eq('org_id', orgId)
    .order('period_end', { ascending: false })
    .limit(12)

  if (!rows || rows.length === 0) return <ReportsPage />

  const reports: SerializableReport[] = rows.map(row => {
    const m = row.metrics as Record<string, number> ?? {}
    const periodEnd = new Date(row.period_end)

    const metrics: SerializableMetric[] = [
      { label: 'Organic Clicks', value: m.clicks ?? 0, prevValue: 0, formatNumber: true },
      { label: 'Website Sessions', value: m.sessions ?? 0, prevValue: 0, formatNumber: true, suffix: ' visits' },
      { label: 'Avg Position', value: m.avg_position ?? 0, prevValue: 0, suffix: ' avg pos', decimals: 1 },
      { label: 'Phone Calls', value: m.phone_calls ?? 0, prevValue: 0, formatNumber: true },
    ]

    // If we have change percentages, use them for prevValue calculation
    if (m.clicks_change_pct) {
      const prevClicks = m.clicks_change_pct !== 0
        ? Math.round(m.clicks / (1 + m.clicks_change_pct / 100))
        : m.clicks
      metrics[0].prevValue = prevClicks
    }
    if (m.sessions_change_pct) {
      const prevSessions = m.sessions_change_pct !== 0
        ? Math.round(m.sessions / (1 + m.sessions_change_pct / 100))
        : m.sessions
      metrics[1].prevValue = prevSessions
    }

    return {
      id: row.id,
      month: periodEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      dateGenerated: new Date(row.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      metrics,
      highlights: (row.highlights as string[]) ?? [],
    }
  })

  const data: ReportsPageData = { reports }

  return <ReportsPage data={data} />
}
