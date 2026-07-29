import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Search,
  Users,
  Megaphone,
} from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn } from '@/lib/utils'

// Public tokenized report page. Always fetched fresh so revoked tokens 404 immediately.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Performance Report',
  robots: { index: false, follow: false },
}

// ===== Types =====

interface PublicMetric {
  label: string
  value: number
  prevValue: number | null
  suffix?: string
  decimals?: number
  lowerIsBetter?: boolean
  icon: React.ElementType
}

// ===== Helpers (mirrors reports-client.tsx trend logic) =====

function getTrend(value: number, prevValue: number, lowerIsBetter = false): 'up' | 'down' | 'flat' {
  const diff = value - prevValue
  if (Math.abs(diff) < 0.01) return 'flat'
  const isPositive = lowerIsBetter ? diff < 0 : diff > 0
  return isPositive ? 'up' : 'down'
}

function getChangePercent(value: number, prevValue: number): string | null {
  if (prevValue === 0) return null
  const pct = Math.abs(((value - prevValue) / prevValue) * 100)
  return pct.toFixed(1) + '%'
}

function prevFromChangePct(value: number, changePct: number | undefined): number | null {
  if (changePct === undefined || changePct === null) return null
  if (changePct === 0) return value
  return Math.round(value / (1 + changePct / 100))
}

function formatValue(value: number, decimals = 0): string {
  return decimals > 0
    ? value.toFixed(decimals)
    : value.toLocaleString('en-US')
}

// ===== Page =====

interface PublicReportPageProps {
  params: Promise<{ token: string }>
}

export default async function PublicReportPage({ params }: PublicReportPageProps) {
  const { token } = await params
  if (!token || token.length < 8) notFound()

  // Service-role client (server-only): reports are only reachable here when a
  // share_token has been explicitly generated for them.
  const supabase = createAdminClient()
  const { data: report } = await supabase
    .from('reports')
    .select('*, organizations(name)')
    .eq('share_token', token)
    .maybeSingle()

  if (!report) notFound()

  const org = report.organizations as { name: string } | null
  const orgName = org?.name ?? 'Your Business'
  const m = (report.metrics as Record<string, number>) ?? {}
  const highlights = ((report.highlights as Array<string | Record<string, unknown>>) ?? [])
    .filter((h): h is string => typeof h === 'string')

  const periodEnd = new Date(report.period_end + 'T00:00:00')
  const periodStart = new Date(report.period_start + 'T00:00:00')
  const isMonthly = report.report_type === 'monthly'
  const periodLabel = isMonthly
    ? periodEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  const comparisonLabel = isMonthly ? 'last month' : 'last week'
  const dateGenerated = new Date(report.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const metrics: PublicMetric[] = [
    {
      label: 'Google Search Clicks',
      value: m.clicks ?? 0,
      prevValue: prevFromChangePct(m.clicks ?? 0, m.clicks_change_pct),
      icon: Search,
    },
    {
      label: 'Website Visits',
      value: m.sessions ?? 0,
      prevValue: prevFromChangePct(m.sessions ?? 0, m.sessions_change_pct),
      icon: TrendingUp,
    },
    {
      label: 'Avg. Google Position',
      value: m.avg_position ?? 0,
      prevValue: m.position_change ? (m.avg_position ?? 0) + m.position_change : null,
      decimals: 1,
      lowerIsBetter: true,
      icon: Users,
    },
    {
      label: 'Phone Calls',
      value: m.phone_calls ?? 0,
      prevValue: null,
      icon: Megaphone,
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-8 md:py-12 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-strawberry/10 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-strawberry" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-strawberry uppercase tracking-wide mb-0.5">
              {isMonthly ? 'Monthly' : 'Weekly'} Performance Report · {periodLabel}
            </p>
            <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">
              {orgName}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Prepared by Skooped · Generated {dateGenerated}
            </p>
          </div>
        </div>

        {/* Summary */}
        {report.summary && (
          <div className="rounded-lg md:rounded-2xl border border-border bg-card p-4 md:p-6 mb-6">
            <h2 className="text-sm font-medium text-foreground mb-2">The short version</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{report.summary}</p>
          </div>
        )}

        {/* Metrics */}
        <div className="rounded-lg md:rounded-2xl border border-border bg-card p-4 md:p-6 mb-6">
          <h2 className="text-sm font-medium text-foreground mb-4">
            How your marketing did vs. {comparisonLabel}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {metrics.map((metric) => {
              const Icon = metric.icon
              const hasPrev = metric.prevValue !== null
              const trend = hasPrev
                ? getTrend(metric.value, metric.prevValue as number, metric.lowerIsBetter)
                : 'flat'
              const pct = hasPrev ? getChangePercent(metric.value, metric.prevValue as number) : null
              return (
                <div key={metric.label} className="rounded-xl bg-background border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-strawberry/10 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-strawberry" />
                    </div>
                    <span className="text-xs text-muted-foreground">{metric.label}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-2xl font-nunito font-bold text-foreground">
                        {formatValue(metric.value, metric.decimals)}
                        {metric.suffix ?? ''}
                      </span>
                      {hasPrev && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          vs. {formatValue(metric.prevValue as number, metric.decimals)} {comparisonLabel}
                        </p>
                      )}
                    </div>
                    {pct && (
                      <span
                        className={cn(
                          'text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg',
                          trend === 'up'
                            ? 'bg-mint/10 text-mint'
                            : trend === 'down'
                              ? 'bg-strawberry/10 text-strawberry'
                              : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {trend === 'up' && <TrendingUp className="w-3 h-3" />}
                        {trend === 'down' && <TrendingDown className="w-3 h-3" />}
                        {trend === 'flat' && <Minus className="w-3 h-3" />}
                        {pct}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Highlights */}
        {highlights.length > 0 && (
          <div className="rounded-lg md:rounded-2xl border border-border bg-card p-4 md:p-6 mb-6">
            <h2 className="text-sm font-medium text-foreground mb-3">Wins this period</h2>
            <ul className="space-y-2">
              {highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-mint shrink-0 mt-0.5" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-2 pb-6">
          <p className="text-xs text-muted-foreground">
            Prepared for {orgName} by{' '}
            <a
              href="https://skooped.io"
              className="font-medium text-strawberry hover:text-strawberry/80 transition-colors"
            >
              Skooped
            </a>
            , your AI-powered marketing team.
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            This is a private report link, please don&apos;t share it publicly.
          </p>
        </div>
      </div>
    </div>
  )
}
