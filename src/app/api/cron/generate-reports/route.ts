import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Auth ────────────────────────────────────────────────────────────────────

function verifyCron(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return process.env.NODE_ENV === 'development'
  return secret === cronSecret
}

// ─── Report Generation ───────────────────────────────────────────────────────

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

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  ops.info('system', 'cron.generate_reports.started', 'started')

  const now = new Date()
  const periodEnd = now.toISOString().split('T')[0]
  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Get all orgs
  const { data: orgs } = await supabase.from('organizations').select('id, name')
  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: 'No orgs', reports: 0 })
  }

  let generated = 0

  for (const org of orgs) {
    try {
      // Fetch current week metrics
      const [seoRes, analyticsRes, gbpRes, adsRes] = await Promise.all([
        supabase.from('seo_metrics').select('*').eq('org_id', org.id).gte('date', periodStart).lte('date', periodEnd),
        supabase.from('analytics_metrics').select('*').eq('org_id', org.id).gte('date', periodStart).lte('date', periodEnd),
        supabase.from('gbp_metrics').select('*').eq('org_id', org.id).gte('date', periodStart).lte('date', periodEnd),
        supabase.from('ads_metrics').select('*').eq('org_id', org.id).gte('date', periodStart).lte('date', periodEnd),
      ])

      const seoRows = (seoRes.data ?? []) as MetricRow[]
      const analyticsRows = (analyticsRes.data ?? []) as MetricRow[]
      const gbpRows = (gbpRes.data ?? []) as MetricRow[]
      const adsRows = (adsRes.data ?? []) as MetricRow[]

      // Skip orgs with no data
      if (seoRows.length === 0 && analyticsRows.length === 0) continue

      // Fetch previous week for comparison
      const [prevSeoRes, prevAnalyticsRes, prevGbpRes] = await Promise.all([
        supabase.from('seo_metrics').select('*').eq('org_id', org.id).gte('date', prevStart).lt('date', periodStart),
        supabase.from('analytics_metrics').select('*').eq('org_id', org.id).gte('date', prevStart).lt('date', periodStart),
        supabase.from('gbp_metrics').select('*').eq('org_id', org.id).gte('date', prevStart).lt('date', periodStart),
      ])

      const prevSeo = (prevSeoRes.data ?? []) as MetricRow[]
      const prevAnalytics = (prevAnalyticsRes.data ?? []) as MetricRow[]
      const prevGbp = (prevGbpRes.data ?? []) as MetricRow[]

      // Calculate metrics
      const totalClicks = sum(seoRows, 'total_clicks')
      const prevClicks = sum(prevSeo, 'total_clicks')
      const totalImpressions = sum(seoRows, 'total_impressions')
      const totalSessions = sum(analyticsRows, 'sessions')
      const prevSessions = sum(prevAnalytics, 'sessions')
      const avgPosition = avg(seoRows, 'avg_position')
      const prevPosition = avg(prevSeo, 'avg_position')
      const totalReviews = gbpRows.length > 0 ? Number(gbpRows[gbpRows.length - 1].total_reviews) || 0 : 0
      const newReviews = sum(gbpRows, 'new_reviews')
      const phoneCalls = sum(gbpRows, 'phone_calls')
      const adSpend = sum(adsRows, 'total_spend')
      const adClicks = sum(adsRows, 'total_clicks')

      const clicksChange = pctChange(totalClicks, prevClicks)
      const sessionsChange = pctChange(totalSessions, prevSessions)
      const positionChange = Math.round((prevPosition - avgPosition) * 10) / 10

      // Generate highlights
      const highlights: string[] = []
      if (clicksChange > 0) highlights.push(`Organic clicks up ${clicksChange}% week-over-week`)
      if (clicksChange < 0) highlights.push(`Organic clicks down ${Math.abs(clicksChange)}% week-over-week`)
      if (sessionsChange > 0) highlights.push(`Website sessions up ${sessionsChange}% WoW`)
      if (positionChange > 0) highlights.push(`Average position improved by ${positionChange} positions`)
      if (newReviews > 0) highlights.push(`${newReviews} new Google review${newReviews > 1 ? 's' : ''} received`)
      if (phoneCalls > 0) highlights.push(`${phoneCalls} phone calls from Google Business Profile`)
      if (adSpend > 0) {
        const roi = adClicks > 0 ? Math.round((adClicks / adSpend) * 10) / 10 : 0
        highlights.push(`Ad spend: $${adSpend.toFixed(2)} (${roi}x click ROI)`)
      }

      // Generate summary
      const summaryParts: string[] = []
      if (totalClicks > 0) summaryParts.push(`${totalClicks} organic clicks`)
      if (totalSessions > 0) summaryParts.push(`${totalSessions} website sessions`)
      if (avgPosition > 0) summaryParts.push(`avg position ${avgPosition.toFixed(1)}`)
      const summary = summaryParts.length > 0
        ? `Weekly performance: ${summaryParts.join(', ')}. ${highlights[0] ?? ''}`
        : 'Data collection in progress.'

      // Insert report
      const { error } = await supabase.from('reports').insert({
        org_id: org.id,
        report_type: 'weekly',
        period_start: periodStart,
        period_end: periodEnd,
        summary,
        metrics: {
          clicks: totalClicks,
          impressions: totalImpressions,
          sessions: totalSessions,
          avg_position: Math.round(avgPosition * 10) / 10,
          new_reviews: newReviews,
          phone_calls: phoneCalls,
          ad_spend: Math.round(adSpend * 100) / 100,
          clicks_change_pct: clicksChange,
          sessions_change_pct: sessionsChange,
          position_change: positionChange,
        },
        highlights,
      })

      if (error) {
        console.error(`[reports] ${org.name}: insert failed:`, error.message)
        continue
      }

      // Log activity
      await supabase.from('agent_activity').insert({
        org_id: org.id,
        agent: 'riley',
        action_type: 'report_generated',
        description: `Weekly performance report generated (${periodStart} to ${periodEnd})`,
        metadata: { period_start: periodStart, period_end: periodEnd, highlights },
      })

      generated++
      console.log(`[reports] ${org.name}: weekly report generated ✅`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[reports] ${org.name}: failed:`, msg)
    }
  }

  ops.info('system', 'cron.generate_reports.completed', 'completed', {
    metadata: { generated, total_orgs: orgs.length },
  })

  await flush()

  return NextResponse.json({ generated, total_orgs: orgs.length })
}
