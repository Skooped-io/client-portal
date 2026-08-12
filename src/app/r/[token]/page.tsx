import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Search,
  Megaphone,
  DollarSign,
  MousePointerClick,
  Eye,
  Smartphone,
  Globe,
  BookOpen,
  Users,
  Star,
  MessageSquare,
} from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isReservedSource } from '@/lib/reports/aggregate'
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
  prefix?: string
  suffix?: string
  decimals?: number
  lowerIsBetter?: boolean
  icon: React.ElementType
}

interface SourceRow {
  source: string
  sessions: number
}

interface PageRow {
  path: string
  pageviews: number
}

interface DeviceRow {
  device: string
  sessions: number
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
  const denominator = 1 + changePct / 100
  if (denominator <= 0) return null
  const prev = Math.round(value / denominator)
  return Number.isFinite(prev) ? prev : null
}

function formatValue(value: number, decimals = 0): string {
  return decimals > 0
    ? value.toFixed(decimals)
    : value.toLocaleString('en-US')
}

function num(m: Record<string, unknown>, key: string): number | undefined {
  const v = m[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

// Friendly label for a raw referrer host. Data-side prep normalizes most of these
// already; this is the render-side safety net so raw hosts never reach a client.
function sourceLabel(raw: string): string {
  const s = raw.toLowerCase()
  if (s === 'direct' || s === '(direct)') return 'Came directly (typed it in or saved link)'
  if (s.includes('googlequicksearchbox')) return 'Google app'
  if (s.includes('google')) return 'Google Search'
  if (s.includes('facebook')) return 'Facebook'
  if (s.includes('instagram')) return 'Instagram'
  if (s.includes('bing')) return 'Bing'
  if (s.includes('duckduckgo')) return 'DuckDuckGo'
  if (s.includes('yahoo')) return 'Yahoo'
  if (s.includes('chatgpt')) return 'ChatGPT'
  if (s.includes('youtube')) return 'YouTube'
  if (s.includes('psychologytoday')) return 'Psychology Today'
  if (s.includes('yelp')) return 'Yelp'
  return raw.replace(/^www\./, '')
}

// Merge rows whose friendly labels collide (m.facebook.com + facebook.com, etc.).
function mergeSources(rows: SourceRow[]): Array<{ label: string; sessions: number }> {
  const acc = new Map<string, number>()
  for (const r of rows) {
    // Reserved rows (device split, lead counts) must never render as a source.
    if (isReservedSource(r.source)) continue
    const label = sourceLabel(r.source)
    acc.set(label, (acc.get(label) ?? 0) + r.sessions)
  }
  return Array.from(acc.entries())
    .map(([label, sessions]) => ({ label, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
}

function pageLabel(path: string): string {
  if (path === '/' || path === '') return 'Home page'
  const cleaned = path.replace(/^\/+|\/+$/g, '').replace(/-/g, ' ').replace(/\//g, ' › ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function asArray<T>(v: unknown, guard: (x: unknown) => x is T): T[] {
  return Array.isArray(v) ? v.filter(guard) : []
}

const isSourceRow = (x: unknown): x is SourceRow =>
  typeof x === 'object' && x !== null &&
  typeof (x as SourceRow).source === 'string' && typeof (x as SourceRow).sessions === 'number'

const isPageRow = (x: unknown): x is PageRow =>
  typeof x === 'object' && x !== null &&
  typeof (x as PageRow).path === 'string' && typeof (x as PageRow).pageviews === 'number'

const isDeviceRow = (x: unknown): x is DeviceRow =>
  typeof x === 'object' && x !== null &&
  typeof (x as DeviceRow).device === 'string' && typeof (x as DeviceRow).sessions === 'number'

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
  const m = (report.metrics as Record<string, unknown>) ?? {}
  const highlights = ((report.highlights as Array<string | Record<string, unknown>>) ?? [])
    .filter((h): h is string => typeof h === 'string')

  const topSources = mergeSources(asArray(m.top_sources, isSourceRow)).slice(0, 6)
  const topPages = asArray(m.top_pages, isPageRow).slice(0, 6)
  const devices = asArray(m.device_split, isDeviceRow)
  const deviceTotal = devices.reduce((a, d) => a + d.sessions, 0)
  const phoneSessions = devices
    .filter((d) => d.device.toLowerCase() === 'mobile' || d.device.toLowerCase() === 'tablet')
    .reduce((a, d) => a + d.sessions, 0)
  // Only quote a phone share when the device sample is big enough to mean something:
  // at least 20 tracked sessions AND at least half of the reported visit total.
  const sessionsMetric = num(m, 'sessions')
  const deviceSampleOk =
    deviceTotal >= 20 && (sessionsMetric === undefined || deviceTotal >= sessionsMetric * 0.5)
  const phoneShare = deviceSampleOk ? Math.round((phoneSessions / deviceTotal) * 100) : null

  const maxSource = topSources[0]?.sessions ?? 0
  const maxPage = topPages.reduce((a, p) => Math.max(a, p.pageviews), 0)

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

  // Tiles only render when the number is real: no dead zeros for unwired sources.
  // Prefer the cron-stored *_prev values (exact) over back-deriving from the change
  // pct, which cannot represent a prior month of zero.
  const sessions = num(m, 'sessions')
  const pageviews = num(m, 'pageviews')
  const candidates: Array<PublicMetric & { show: boolean }> = [
    {
      label: 'Website Visits',
      value: sessions ?? 0,
      prevValue: num(m, 'sessions_prev') ?? prevFromChangePct(sessions ?? 0, num(m, 'sessions_change_pct')),
      icon: TrendingUp,
      show: sessions !== undefined,
    },
    {
      label: 'Pages Viewed',
      value: pageviews ?? 0,
      prevValue: null,
      icon: BookOpen,
      show: pageviews !== undefined && pageviews > 0,
    },
    {
      label: 'Ad Clicks',
      value: num(m, 'ad_clicks') ?? 0,
      prevValue: null,
      icon: MousePointerClick,
      show: (num(m, 'ad_clicks') ?? 0) > 0,
    },
    {
      label: 'Ad Spend',
      value: num(m, 'ad_spend') ?? 0,
      prevValue: num(m, 'ad_spend_prev') ?? prevFromChangePct(num(m, 'ad_spend') ?? 0, num(m, 'ad_spend_change_pct')),
      prefix: '$',
      decimals: 2,
      icon: DollarSign,
      show: (num(m, 'ad_spend') ?? 0) > 0,
    },
    {
      label: 'Ad Impressions',
      value: num(m, 'ad_impressions') ?? 0,
      prevValue: null,
      icon: Eye,
      show: (num(m, 'ad_impressions') ?? 0) > 0,
    },
    {
      label: 'Leads from Ads',
      value: num(m, 'ad_conversions') ?? 0,
      prevValue: null,
      icon: Users,
      show: (num(m, 'ad_conversions') ?? 0) > 0,
    },
    {
      label: 'Leads',
      value: num(m, 'leads') ?? 0,
      prevValue: null,
      icon: Users,
      show: (num(m, 'leads') ?? 0) > 0,
    },
    {
      label: 'New Google Reviews',
      value: num(m, 'new_reviews') ?? 0,
      prevValue: null,
      icon: Star,
      show: (num(m, 'new_reviews') ?? 0) > 0,
    },
    {
      label: 'Your Google Rating',
      value: num(m, 'reviews_avg_rating') ?? 0,
      prevValue: null,
      suffix: ' / 5',
      decimals: 1,
      icon: Star,
      show: (num(m, 'reviews_avg_rating') ?? 0) > 0,
    },
    {
      label: 'Reviews We Answered',
      value: num(m, 'review_replies') ?? 0,
      prevValue: null,
      icon: MessageSquare,
      show: (num(m, 'review_replies') ?? 0) > 0,
    },
    {
      label: 'Google Search Clicks',
      value: num(m, 'clicks') ?? 0,
      prevValue: num(m, 'clicks_prev') ?? prevFromChangePct(num(m, 'clicks') ?? 0, num(m, 'clicks_change_pct')),
      icon: Search,
      show: (num(m, 'clicks') ?? 0) > 0,
    },
    {
      label: 'Phone Calls',
      value: num(m, 'phone_calls') ?? 0,
      prevValue: null,
      icon: Megaphone,
      show: (num(m, 'phone_calls') ?? 0) > 0,
    },
  ]
  const metrics = candidates.filter((c) => c.show)

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
        {metrics.length > 0 && (
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
                          {metric.prefix ?? ''}
                          {formatValue(metric.value, metric.decimals)}
                          {metric.suffix ?? ''}
                        </span>
                        {hasPrev && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            vs. {metric.prefix ?? ''}{formatValue(metric.prevValue as number, metric.decimals)} {comparisonLabel}
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
            {phoneShare !== null && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
                <Smartphone className="w-3.5 h-3.5 text-strawberry shrink-0" />
                {phoneShare}% of your visitors were on a phone or tablet.
              </p>
            )}
          </div>
        )}

        {/* Empty state: tracking not wired yet */}
        {metrics.length === 0 && (
          <div className="rounded-lg md:rounded-2xl border border-border bg-card p-4 md:p-6 mb-6">
            <h2 className="text-sm font-medium text-foreground mb-2">Your numbers are coming</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We are still wiring up tracking for your account. Visits, leads, and marketing
              numbers will appear here starting with your next monthly report.
            </p>
          </div>
        )}

        {/* Traffic sources */}
        {topSources.length > 0 && (
          <div className="rounded-lg md:rounded-2xl border border-border bg-card p-4 md:p-6 mb-6">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground mb-4">
              <Globe className="w-4 h-4 text-strawberry" />
              Where your visitors came from
            </h2>
            <ul className="space-y-3">
              {topSources.map((s) => (
                <li key={s.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-foreground">{s.label}</span>
                    <span className="text-muted-foreground">{s.sessions.toLocaleString('en-US')}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-strawberry/60"
                      style={{ width: `${maxSource > 0 ? Math.max(4, Math.round((s.sessions / maxSource) * 100)) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top pages */}
        {topPages.length > 0 && (
          <div className="rounded-lg md:rounded-2xl border border-border bg-card p-4 md:p-6 mb-6">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground mb-4">
              <BookOpen className="w-4 h-4 text-strawberry" />
              What they looked at most
            </h2>
            <ul className="space-y-3">
              {topPages.map((p) => (
                <li key={p.path}>
                  <div className="flex items-center justify-between gap-3 text-sm mb-1">
                    <span className="text-foreground truncate">{pageLabel(p.path)}</span>
                    <span className="text-muted-foreground shrink-0">
                      {p.pageviews.toLocaleString('en-US')} views
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-mint/60"
                      style={{ width: `${maxPage > 0 ? Math.max(4, Math.round((p.pageviews / maxPage) * 100)) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

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
