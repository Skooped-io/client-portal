import { ArrowRight, BarChart2, Calendar, Zap } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
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

  return { firstName, dateString }
}

async function WelcomeHeader() {
  const { firstName, dateString } = await DashboardData()

  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-nunito font-bold text-foreground">
          Welcome back, {firstName} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{dateString}</p>
      </div>
      <DashboardTourWrapper className="mt-1" />
    </div>
  )
}

// ===== Main page =====

export default async function DashboardPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">

      {/* Welcome header */}
      <Suspense
        fallback={
          <div className="mb-6 space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        }
      >
        <WelcomeHeader />
      </Suspense>

      {/* Metric Cards */}
      <Suspense fallback={<MetricsSkeleton />}>
        <MetricCardsRow />
      </Suspense>

      {/* Charts + AI Insights */}
      <div id="dashboard-chart-section" className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
              <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
                <TrafficChart />
              </Suspense>
            </CardContent>
          </Card>
        </div>

        {/* AI Insights — 1/3 width on xl */}
        <div>
          <AIInsightsPanel />
        </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
  )
}
