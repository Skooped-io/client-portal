import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/monthly-reports
 *
 * Runs on the 1st of each month (vercel.json). For every org whose
 * business_profiles.reports_enabled is true (i.e. the PAYING book — the flag
 * defaults false, so non-paying Lovable sites never get report rows):
 *
 *   1. Aggregates the PRIOR calendar month from the metric tables via the
 *      SECTION_BUILDERS registry below — each metric table (analytics, ads,
 *      seo, gbp) is one builder; a section only contributes numbers when it
 *      has rows, and unwired sections are named honestly in the summary.
 *      Adding a data source later (e.g. Meta ads for Triple clients) = add a
 *      builder, no other changes.
 *   2. Inserts a reports row (report_type 'monthly') with a share_token, so
 *      the report is immediately reachable at /r/<token> with no login.
 *      Idempotent: if a monthly report for that org+period already exists it
 *      is NOT regenerated (a missing share_token is backfilled so the digest
 *      always has a link).
 *   3. After all orgs: sends ONE digest email to the owner
 *      (joseph@skooped.io) listing each client and its /r/<token> link.
 *      Clients are NEVER emailed by this route. Email failure (missing/stale
 *      RESEND_API_KEY included) is logged and does not fail the run.
 *
 * Auth: Authorization: Bearer CRON_SECRET only. The x-vercel-cron header is NOT
 * accepted — it is spoofable by external callers (verified 2026-07-29), and this
 * route's response includes share URLs, so a spoofed trigger would leak report
 * links. Vercel's scheduler sends the Bearer automatically when CRON_SECRET is
 * set. If CRON_SECRET is unset, the route refuses in production.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────

function verifyCron(request: NextRequest): boolean {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return process.env.NODE_ENV === 'development'
  return secret === cronSecret
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

interface MetricRow {
  org_id: string
  date: string
  [key: string]: unknown
}

function sum(rows: MetricRow[], field: string): number {
  return rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0)
}

function avg(rows: MetricRow[], field: string): number {
  if (rows.length === 0) return 0
  return sum(rows, field) / rows.length
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

// ─── Section builders (one per metric table — the extension point) ───────────

interface SectionOutput {
  /** Merged into reports.metrics (jsonb). Keys match what /r/[token] renders;
   *  values may be numbers or small JSON arrays (top_sources, top_pages, device_split). */
  metrics: Record<string, unknown>
  /** Sentences for reports.highlights. */
  highlights: string[]
  /** Sentence fragment(s) for the summary. */
  summaryLines: string[]
}

interface SectionBuilder {
  key: string
  table: string
  /** Human name used in the "not yet connected" note when the table is empty. */
  label: string
  build: (rows: MetricRow[], prevRows: MetricRow[]) => SectionOutput
}

// Daily rows carry per-day traffic_sources [{source, sessions}] and top_pages
// [{path, pageviews}] jsonb (written by /api/ingest/analytics). Device rows ride
// inside traffic_sources with a reserved prefix so no schema change was needed.
const DEVICE_PREFIX = '__device__:'

interface SourceEntry { source: string; sessions: number }

function topN<T>(map: Map<string, number>, n: number, shape: (k: string, v: number) => T): T[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => shape(k, v))
}

const SECTION_BUILDERS: SectionBuilder[] = [
  {
    key: 'analytics',
    table: 'analytics_metrics',
    label: 'website analytics',
    build: (rows, prevRows) => {
      const sessions = sum(rows, 'sessions')
      const pageviews = sum(rows, 'pageviews')
      const prevSessions = sum(prevRows, 'sessions')
      const sessionsChange = prevRows.length > 0 ? pctChange(sessions, prevSessions) : null

      const sourceTotals = new Map<string, number>()
      const deviceTotals = new Map<string, number>()
      const pageTotals = new Map<string, number>()
      for (const r of rows) {
        const sources = Array.isArray(r.traffic_sources) ? (r.traffic_sources as SourceEntry[]) : []
        for (const s of sources) {
          if (typeof s?.source !== 'string' || typeof s?.sessions !== 'number') continue
          if (s.source.startsWith(DEVICE_PREFIX)) {
            const d = s.source.slice(DEVICE_PREFIX.length)
            deviceTotals.set(d, (deviceTotals.get(d) ?? 0) + s.sessions)
          } else {
            sourceTotals.set(s.source, (sourceTotals.get(s.source) ?? 0) + s.sessions)
          }
        }
        // Two writer shapes exist in top_pages jsonb: ingest {path, pageviews} and
        // GA4-era/seed {page, views}. Accept both.
        const pages = Array.isArray(r.top_pages) ? (r.top_pages as Array<Record<string, unknown>>) : []
        for (const p of pages) {
          const path = typeof p?.path === 'string' ? p.path : typeof p?.page === 'string' ? p.page : null
          const views = typeof p?.pageviews === 'number' ? p.pageviews : typeof p?.views === 'number' ? p.views : null
          if (path === null || views === null) continue
          pageTotals.set(path, (pageTotals.get(path) ?? 0) + views)
        }
      }
      const topSources = topN(sourceTotals, 6, (source, sessions) => ({ source, sessions }))
      const topPages = topN(pageTotals, 6, (path, pageviews) => ({ path, pageviews }))
      const deviceSplit = topN(deviceTotals, 4, (device, sessions) => ({ device, sessions }))

      const line =
        `${fmt(sessions)} website visits and ${fmt(pageviews)} page views` +
        (sessionsChange !== null
          ? ` (visits ${sessionsChange >= 0 ? 'up' : 'down'} ${Math.abs(sessionsChange)}% vs the month before)`
          : '')

      const highlights: string[] = []
      if (sessionsChange !== null && sessionsChange > 0) {
        highlights.push(`Website visits up ${sessionsChange}% month-over-month`)
      }
      if (sessionsChange !== null && sessionsChange < 0) {
        highlights.push(`Website visits down ${Math.abs(sessionsChange)}% month-over-month`)
      }

      return {
        metrics: {
          sessions,
          pageviews,
          ...(sessionsChange !== null
            ? { sessions_change_pct: sessionsChange, sessions_prev: prevSessions }
            : {}),
          ...(topSources.length > 0 ? { top_sources: topSources } : {}),
          ...(topPages.length > 0 ? { top_pages: topPages } : {}),
          ...(deviceSplit.length > 0 ? { device_split: deviceSplit } : {}),
        },
        highlights,
        summaryLines: [line],
      }
    },
  },
  {
    key: 'ads',
    table: 'ads_metrics',
    label: 'ads performance',
    build: (rows, prevRows) => {
      const spend = Math.round(sum(rows, 'total_spend') * 100) / 100
      const clicks = sum(rows, 'total_clicks')
      const impressions = sum(rows, 'total_impressions')
      const conversions = sum(rows, 'total_conversions')
      const prevSpend = sum(prevRows, 'total_spend')
      const spendChange = prevRows.length > 0 ? pctChange(spend, prevSpend) : null

      const parts = [`$${spend.toFixed(2)} ad spend`, `${fmt(clicks)} ad clicks`]
      if (impressions > 0) parts.push(`${fmt(impressions)} impressions`)
      if (conversions > 0) parts.push(`${fmt(conversions)} conversions`)

      return {
        metrics: {
          ad_spend: spend,
          ad_clicks: clicks,
          ad_impressions: impressions,
          ad_conversions: conversions,
          ...(spendChange !== null
            ? { ad_spend_change_pct: spendChange, ad_spend_prev: Math.round(prevSpend * 100) / 100 }
            : {}),
        },
        highlights: conversions > 0 ? [`${fmt(conversions)} conversions from ads`] : [],
        summaryLines: [parts.join(', ')],
      }
    },
  },
  {
    key: 'seo',
    table: 'seo_metrics',
    label: 'Google Search data',
    build: (rows, prevRows) => {
      const clicks = sum(rows, 'total_clicks')
      const impressions = sum(rows, 'total_impressions')
      const position = avg(rows, 'avg_position')
      const prevClicks = sum(prevRows, 'total_clicks')
      const prevPosition = avg(prevRows, 'avg_position')
      const clicksChange = prevRows.length > 0 ? pctChange(clicks, prevClicks) : null
      const positionChange =
        prevRows.length > 0 ? Math.round((prevPosition - position) * 10) / 10 : null

      return {
        metrics: {
          clicks,
          impressions,
          avg_position: Math.round(position * 10) / 10,
          ...(clicksChange !== null
            ? { clicks_change_pct: clicksChange, clicks_prev: prevClicks }
            : {}),
          ...(positionChange !== null ? { position_change: positionChange } : {}),
        },
        highlights:
          clicksChange !== null && clicksChange > 0
            ? [`Google Search clicks up ${clicksChange}% month-over-month`]
            : [],
        summaryLines: [`${fmt(clicks)} clicks from Google Search`],
      }
    },
  },
  {
    key: 'gbp',
    table: 'gbp_metrics',
    label: 'Google Business Profile',
    build: (rows) => {
      const phoneCalls = sum(rows, 'phone_calls')
      const newReviews = sum(rows, 'new_reviews')

      const parts: string[] = []
      if (phoneCalls > 0) parts.push(`${fmt(phoneCalls)} phone calls from Google`)
      if (newReviews > 0) parts.push(`${fmt(newReviews)} new Google reviews`)

      return {
        metrics: { phone_calls: phoneCalls, new_reviews: newReviews },
        highlights:
          newReviews > 0
            ? [`${fmt(newReviews)} new Google review${newReviews > 1 ? 's' : ''}`]
            : [],
        summaryLines: parts.length > 0 ? [parts.join(', ')] : [],
      }
    },
  },
]

// ─── Digest email (owner only — clients are never emailed here) ──────────────

const OWNER_EMAIL = 'joseph@skooped.io'

interface DigestEntry {
  name: string
  plan: string | null
  url: string
  status: 'generated' | 'existing'
  summary: string
}

async function sendOwnerDigest(period: string, entries: DigestEntry[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[monthly-reports] RESEND_API_KEY not set — skipping owner digest')
    return false
  }

  const rowsHtml = entries
    .map(
      (e) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">
          <strong>${e.name}</strong>${e.plan ? ` <span style="color:#999;font-size:12px">(${e.plan})</span>` : ''}
          ${e.status === 'existing' ? ' <span style="color:#999;font-size:12px">— already existed</span>' : ''}
          <br><span style="color:#666;font-size:12px">${e.summary}</span>
          <br><a href="${e.url}" style="color:#D94A7A;font-size:13px">${e.url}</a>
        </td>
      </tr>`
    )
    .join('')

  const html = `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
    <h2 style="color:#361C24">Monthly reports generated — ${period}</h2>
    <p style="color:#666;font-size:13px">${entries.length} client report${entries.length === 1 ? '' : 's'}. Links are public (tokenized, no login). Nothing has been sent to clients — forward or paste links as you see fit.</p>
    <table style="width:100%;border-collapse:collapse">${rowsHtml}</table>
  </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Skooped <reports@skooped.io>',
        to: [OWNER_EMAIL],
        subject: `Monthly client reports ready — ${period} (${entries.length} client${entries.length === 1 ? '' : 's'})`,
        html,
      }),
    })
    if (!res.ok) {
      console.error(`[monthly-reports] Resend responded ${res.status} — digest not sent`)
    }
    return res.ok
  } catch (err) {
    console.error('[monthly-reports] Resend request failed:', err)
    return false
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  ops.info('system', 'cron.monthly_reports.started', 'started')

  // Prior calendar month (UTC), plus the month before it for comparisons.
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const iso = (d: Date) => d.toISOString().split('T')[0]
  const periodStart = iso(new Date(Date.UTC(y, m - 1, 1)))
  const periodEnd = iso(new Date(Date.UTC(y, m, 0)))
  const prevStart = iso(new Date(Date.UTC(y, m - 2, 1)))
  const prevEnd = iso(new Date(Date.UTC(y, m - 1, 0)))
  const periodLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  // Paying book only: reports_enabled defaults false and is flipped on per client.
  const { data: profiles, error: profilesError } = await supabase
    .from('business_profiles')
    .select('org_id, business_name, plan, organizations(name)')
    .eq('reports_enabled', true)

  if (profilesError) {
    ops.error('system', 'cron.monthly_reports', profilesError.message, 'unknown')
    await flush()
    return NextResponse.json({ error: 'Failed to load report-enabled orgs' }, { status: 500 })
  }

  if (!profiles || profiles.length === 0) {
    await flush()
    return NextResponse.json({ message: 'No orgs with reports_enabled', generated: 0 })
  }

  const digest: DigestEntry[] = []
  let generated = 0
  let skipped = 0
  let failed = 0

  for (const profile of profiles) {
    const orgId = profile.org_id as string
    const org = profile.organizations as unknown as { name: string } | null
    const name = org?.name || (profile.business_name as string) || 'Unknown client'
    const plan = (profile.plan as string | null) ?? null

    try {
      // Idempotency: one monthly report per org+period.
      const { data: existing } = await supabase
        .from('reports')
        .select('id, share_token, summary')
        .eq('org_id', orgId)
        .eq('report_type', 'monthly')
        .eq('period_start', periodStart)
        .maybeSingle()

      if (existing) {
        let token = existing.share_token as string | null
        if (!token) {
          // Backfill a token so the digest always carries a working link.
          token = randomUUID()
          await supabase.from('reports').update({ share_token: token }).eq('id', existing.id)
        }
        digest.push({
          name,
          plan,
          url: `https://app.skooped.io/r/${token}`,
          status: 'existing',
          summary: (existing.summary as string | null) ?? '',
        })
        skipped++
        continue
      }

      // Run every registered section builder over the prior month.
      const metrics: Record<string, unknown> = {}
      const highlights: string[] = []
      const summaryLines: string[] = []
      const notWired: string[] = []

      for (const builder of SECTION_BUILDERS) {
        const [curRes, prevRes] = await Promise.all([
          supabase
            .from(builder.table)
            .select('*')
            .eq('org_id', orgId)
            .gte('date', periodStart)
            .lte('date', periodEnd),
          supabase
            .from(builder.table)
            .select('*')
            .eq('org_id', orgId)
            .gte('date', prevStart)
            .lte('date', prevEnd),
        ])

        const rows = (curRes.data ?? []) as MetricRow[]
        const prevRows = (prevRes.data ?? []) as MetricRow[]

        if (rows.length === 0) {
          notWired.push(builder.label)
          continue
        }

        const out = builder.build(rows, prevRows)
        Object.assign(metrics, out.metrics)
        highlights.push(...out.highlights)
        summaryLines.push(...out.summaryLines)
      }

      // Honest plain-English summary: numbers we have, and what isn't wired.
      let summary: string
      if (summaryLines.length > 0) {
        summary = `${periodLabel}: ${summaryLines.join('. ')}.`
        if (notWired.length > 0) {
          summary += ` Not yet connected: ${notWired.join(', ')}; those numbers will appear here once we wire them up.`
        }
      } else {
        summary = `${periodLabel}: no tracking data was collected for this period yet (${notWired.join(', ')} not connected). Numbers will appear once data collection is wired up.`
      }

      const shareToken = randomUUID()
      const { error: insertError } = await supabase.from('reports').insert({
        org_id: orgId,
        report_type: 'monthly',
        period_start: periodStart,
        period_end: periodEnd,
        summary,
        metrics,
        highlights,
        share_token: shareToken,
      })

      if (insertError) {
        console.error(`[monthly-reports] ${name}: insert failed:`, insertError.message)
        failed++
        continue
      }

      await supabase.from('agent_activity').insert({
        org_id: orgId,
        agent: 'riley',
        action_type: 'report_generated',
        description: `Monthly performance report generated (${periodLabel})`,
        metadata: { period_start: periodStart, period_end: periodEnd, report_type: 'monthly' },
      })

      digest.push({
        name,
        plan,
        url: `https://app.skooped.io/r/${shareToken}`,
        status: 'generated',
        summary,
      })
      generated++
      console.log(`[monthly-reports] ${name}: monthly report generated`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[monthly-reports] ${name}: failed:`, msg)
      failed++
    }
  }

  // One owner digest, never client emails. Failure logged, run still succeeds.
  const emailSent = digest.length > 0 ? await sendOwnerDigest(periodLabel, digest) : false

  ops.info('system', 'cron.monthly_reports.completed', 'completed', {
    metadata: { generated, skipped, failed, email_sent: emailSent, period: periodLabel },
  })
  await flush()

  return NextResponse.json({
    period: { start: periodStart, end: periodEnd },
    generated,
    skipped,
    failed,
    email_sent: emailSent,
    reports: digest.map((d) => ({ name: d.name, status: d.status, url: d.url })),
  })
}
