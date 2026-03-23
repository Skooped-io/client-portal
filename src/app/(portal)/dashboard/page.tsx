import { ArrowRight, BarChart2, Calendar, PieChart, Target, Zap } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Suspense } from 'react'
import { MetricCardsRow } from '@/components/dashboard/MetricCardsRow'
import { TrafficChart } from '@/components/dashboard/TrafficChart'
import { ContentCalendar } from '@/components/dashboard/ContentCalendar'
import { AgentActivityFeed } from '@/components/dashboard/AgentActivityFeed'
import { AIInsightsPanel } from '@/components/dashboard/AIInsightsPanel'
import { DashboardTourWrapper } from '@/components/dashboard/DashboardTourWrapper'
import { DonutChartBranded, ProgressRing } from '@/components/charts'
import { trafficSources as demoTrafficSources, seoHealthScore as demoSeoHealthScore } from '@/lib/chart-demo-data'
import { DashboardClientWrapper } from './dashboard-client-wrapper'

// ===== Skeleton fallbacks =====

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <Skeleton className="h-5 w-36 mb-6" />
      <Skeleton className="h-60 w-full rounded-lg" />
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-3 p-4 rounded-xl border border-border bg-card/50">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== Server-side data =====

async function DashboardData() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const orgId = await getCurrentOrgId(supabase)

  const [profileResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user?.id ?? '')
      .single(),
  ])

  const userName = profileResult.data?.full_name ?? user?.email ?? 'there'
  const firstName = userName.split(' ')[0]

  const now = new Date()
  const dateString = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // ── Fetch real metrics (graceful fallback to null if tables don't exist yet) ──

  let seoLatest = null
  let seoTrend: Array<{ date: string; total_clicks: number; total_impressions: number }> = []
  let analyticsLatest = null
  let adsLatest = null
  let gbpLatest = null
  let trafficSources = demoTrafficSources
  let seoHealthScore = demoSeoHealthScore
  let hasRealData = false

  if (orgId) {
    const [seoRes, seoTrendRes, analyticsRes, adsRes, gbpRes] = await Promise.all([
      supabase.from('seo_metrics').select('*').eq('org_id', orgId).order('date', { ascending: false }).limit(1).single(),
      supabase.from('seo_metrics').select('date, total_clicks, total_impressions').eq('org_id', orgId).order('date', { ascending: false }).limit(30),
      supabase.from('analytics_metrics').select('*').eq('org_id', orgId).order('date', { ascending: false }).limit(1).single(),
      supabase.from('ads_metrics').select('*').eq('org_id', orgId).order('date', { ascending: false }).limit(1).single(),
      supabase.from('gbp_metrics').select('*').eq('org_id', orgId).order('date', { ascending: false }).limit(1).single(),
    ])

    seoLatest = seoRes.data
    seoTrend = (seoTrendRes.data ?? []).reverse()
    analyticsLatest = analyticsRes.data
    adsLatest = adsRes.data
    gbpLatest = gbpRes.data

    if (seoLatest || analyticsLatest) hasRealData = true

    // Build traffic sources from analytics if available
    if (analyticsLatest?.traffic_sources && Array.isArray(analyticsLatest.traffic_sources) && analyticsLatest.traffic_sources.length > 0) {
      const colors = ['#D94A7A', '#5B8DEF', '#4CAF50', '#C99035', '#9b87f5']
      trafficSources = (analyticsLatest.traffic_sources as Array<{ source: string; sessions: number; percentage: number }>).slice(0, 5).map((s, i) => ({
        name: s.source,
        value: Math.round(s.percentage),
        color: colors[i % colors.length],
      }))
    }

    // Calculate SEO health from real data
    if (seoLatest) {
      const ctrScore = Math.min(100, (seoLatest.avg_ctr ?? 0) * 2000) // 5% CTR = 100
      const positionScore = Math.max(0, 100 - ((seoLatest.avg_position ?? 50) - 1) * 5) // position 1 = 100, position 20 = 5
      seoHealthScore = Math.round((ctrScore + positionScore) / 2)
    }
  }

  // Build MetricCardsRow data
  const metricCardsData = hasRealData ? {
    totalLeads: gbpLatest?.phone_calls ?? 0,
    websiteTraffic: analyticsLatest?.sessions ?? seoLatest?.total_clicks ?? 0,
    googleRanking: Math.round(seoLatest?.avg_position ?? 0),
    adSpend: adsLatest?.total_spend ?? 0,
    adROI: adsLatest?.total_clicks && adsLatest?.total_spend
      ? Math.round((adsLatest.total_clicks / adsLatest.total_spend) * 10) / 10
      : 0,
    leadsTrend: 0, // TODO: calculate from previous period
    trafficTrend: 0,
    rankingTrend: 0,
    adTrend: 0,
  } : undefined

  // Build TrafficChart data
  const trafficChartData = seoTrend.length > 0
    ? seoTrend.map(row => ({
        date: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        traffic: row.total_clicks,
        impressions: row.total_impressions,
      }))
    : undefined

  return {
    firstName,
    dateString,
    metricCardsData,
    trafficChartData,
    trafficSources,
    seoHealthScore,
    hasRealData,
  }
}

// ===== Main page =====

export default async function DashboardPage() {
  const {
    firstName,
    dateString,
    metricCardsData,
    trafficChartData,
    trafficSources,
    seoHealthScore,
    hasRealData,
  } = await DashboardData()

  return (
    <DashboardClientWrapper>
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6 lg:space-y-8">

      {/* Welcome header */}
      <div className="flex items-start justify-between mb-4 md:mb-6 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{dateString}</p>
        </div>
        <DashboardTourWrapper className="mt-1 shrink-0" />
      </div>

      {/* Metric Cards */}
      <MetricCardsRow data={metricCardsData} />

      {/* Charts + AI Insights */}
      <div id="dashboard-chart-section" className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        {/* Main chart — 2/3 width on xl */}
        <div className="xl:col-span-2">
          <Card className="bg-card border-border rounded-xl h-full overflow-hidden">
            <CardHeader className="pb-2 relative">
              {/* Ice cream gradient accent top bar */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-strawberry via-vanilla-500 to-mint opacity-80" />
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-strawberry" />
                <CardTitle className="text-sm font-nunito font-semibold">Traffic & Impressions</CardTitle>
                <span className="ml-auto text-xs text-muted-foreground">Last 30 days</span>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <TrafficChart data={trafficChartData} isDemo={!hasRealData} />
            </CardContent>
          </Card>
        </div>

        {/* AI Insights — 1/3 width on xl */}
        <div>
          <AIInsightsPanel />
        </div>
      </div>

      {/* Traffic Sources + SEO Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Traffic Sources Donut */}
        <Card className="bg-card border-border rounded-xl overflow-hidden">
          <CardHeader className="pb-2 relative">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blueberry via-strawberry to-vanilla-500 opacity-70" />
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blueberry" />
              <CardTitle className="text-sm font-nunito font-semibold">Traffic Sources</CardTitle>
              <span className="ml-auto text-xs text-muted-foreground">Last 30 days</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <DonutChartBranded
              data={trafficSources}
              centerLabel="5 Sources"
              centerSublabel="of traffic"
              height={200}
              innerRadius={50}
              outerRadius={80}
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
              {trafficSources.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-xs text-muted-foreground truncate">{s.name}</span>
                  <span className="text-xs font-medium text-foreground ml-auto">{s.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* SEO Health Progress Ring */}
        <Card className="bg-card border-border rounded-xl overflow-hidden">
          <CardHeader className="pb-2 relative">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-strawberry via-gold to-mint opacity-70" />
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-strawberry" />
              <CardTitle className="text-sm font-nunito font-semibold">SEO Health Score</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 py-4">
            <ProgressRing
              value={seoHealthScore}
              size={128}
              strokeWidth={9}
              color="#D94A7A"
              label={`${seoHealthScore}%`}
              sublabel="health score"
            />
            <div className="w-full space-y-2 max-w-xs">
              {[
                { label: 'Title tags optimised', pct: 82, color: '#D94A7A' },
                { label: 'Page speed score',     pct: 68, color: '#5B8DEF' },
                { label: 'Backlink authority',   pct: 71, color: '#C99035' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium text-foreground">{item.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${item.pct}%`, background: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Link href="/seo">
              <Button variant="ghost" size="sm" className="text-xs text-strawberry gap-1 h-7 hover:bg-strawberry/10">
                View full SEO report
                <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Content Calendar */}
      <Card className="bg-card border-border rounded-xl overflow-hidden">
        <CardHeader className="pb-3 relative">
          {/* Gold/vanilla gradient for content section */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-gold via-vanilla-500 to-gold opacity-70" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-strawberry" />
              <CardTitle className="text-sm font-nunito font-semibold">Content Calendar</CardTitle>
            </div>
            <Link href="/social">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5 h-7">
                View full calendar
                <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">Next 7 days of scheduled content</p>
        </CardHeader>
        <CardContent>
          <ContentCalendar />
        </CardContent>
      </Card>

      {/* Activity Feed + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Activity Feed — 2/3 */}
        <div className="lg:col-span-2">
          <Card className="bg-card border-border rounded-xl overflow-hidden">
            <CardHeader className="pb-3 relative">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-strawberry via-mint to-blueberry opacity-60" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-strawberry" />
                  <CardTitle className="text-sm font-nunito font-semibold">Agent Activity</CardTitle>
                </div>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">What your AI team is working on</p>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<FeedSkeleton />}>
                <AgentActivityFeed />
              </Suspense>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions — 1/3 */}
        <div>
          <Card className="bg-card border-border rounded-xl overflow-hidden">
            <CardHeader className="relative">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-gold to-vanilla-500 opacity-70" />
              <CardTitle className="text-sm font-nunito font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/settings">
                <Button
                  variant="ghost"
                  className="w-full justify-between text-foreground hover:bg-card-hover rounded-xl text-sm"
                >
                  Update Business Profile
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              </Link>
              <Link href="/analytics">
                <Button
                  variant="ghost"
                  className="w-full justify-between text-foreground hover:bg-card-hover rounded-xl text-sm"
                >
                  View Reports
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              </Link>
              <Link href="/seo">
                <Button
                  variant="ghost"
                  className="w-full justify-between text-foreground hover:bg-card-hover rounded-xl text-sm"
                >
                  SEO Rankings
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              </Link>
              <Link href="/social">
                <Button
                  variant="ghost"
                  className="w-full justify-between text-foreground hover:bg-card-hover rounded-xl text-sm"
                >
                  Content Calendar
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              </Link>
              <Link href="/messages">
                <Button
                  variant="ghost"
                  className="w-full justify-between text-foreground hover:bg-card-hover rounded-xl text-sm"
                >
                  Send Message
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </DashboardClientWrapper>
  )
}
