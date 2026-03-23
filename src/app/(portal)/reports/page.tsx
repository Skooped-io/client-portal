import type { Metadata } from 'next'
import { getReports } from '@/lib/data/reports'
import type { ReportRow } from '@/lib/data/reports'
import ReportsPage from './reports-client'
import type { ReportsPageData, SerializableMetric, SerializableReport } from './reports-client'

export const metadata: Metadata = { title: 'Reports' }
export const revalidate = 300

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtPeriod(row: ReportRow) {
  if (row.report_type === 'monthly') {
    return new Date(row.period_end).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return 'Week of ' + new Date(row.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getNum(metrics: Record<string, unknown>, key: string): number {
  const v = metrics[key]
  return typeof v === 'number' ? v : 0
}

export default async function ReportsServerPage() {
  const { reports, hasData } = await getReports(12)

  if (!hasData) return <ReportsPage />

  const mapped: SerializableReport[] = reports.map((row, i) => {
    const prevRow = reports[i + 1]
    const m  = row.metrics
    const pm = prevRow?.metrics ?? {}

    const metrics: SerializableMetric[] = [
      { label: 'Website Traffic', value: getNum(m, 'sessions'),    prevValue: getNum(pm, 'sessions'),    formatNumber: true, suffix: ' visits' },
      { label: 'Organic Clicks',  value: getNum(m, 'clicks'),      prevValue: getNum(pm, 'clicks'),      formatNumber: true },
      { label: 'Google Ranking',  value: getNum(m, 'avg_position'), prevValue: getNum(pm, 'avg_position'), suffix: ' avg pos', decimals: 1 },
      { label: 'Phone Calls',     value: getNum(m, 'phone_calls'),  prevValue: getNum(pm, 'phone_calls'),  formatNumber: true },
    ]

    const highlights = (row.highlights ?? [])
      .map((h) => (typeof h === 'string' ? h : JSON.stringify(h)))
      .filter(Boolean)

    return {
      id:            row.id,
      month:         fmtPeriod(row),
      dateGenerated: fmtDate(row.created_at),
      metrics,
      highlights,
    }
  })

  const data: ReportsPageData = { reports: mapped }
  return <ReportsPage data={data} />
}
