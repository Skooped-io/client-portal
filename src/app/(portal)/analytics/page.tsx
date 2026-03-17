'use client'

import { motion } from 'framer-motion'
import { BarChart3, Clock, MousePointerClick, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageTransition } from '@/components/motion/PageTransition'
import { stagger, slideUp } from '@/lib/animations/variants'
import { ChartWrapper, AreaChartBranded, BarChartBranded, LineChartBranded } from '@/components/charts'
import { chartColors } from '@/lib/chart-theme'
import { generatePageViewData, generateTrafficData } from '@/lib/chart-demo-data'

const TRAFFIC_DATA = generateTrafficData(14)
const PAGE_VIEW_DATA = generatePageViewData(14)

function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
      Sample data
    </span>
  )
}

export default function AnalyticsPage() {
  const totalVisitors = TRAFFIC_DATA.reduce((a, b) => a + b.visitors, 0)
  const totalPageviews = TRAFFIC_DATA.reduce((a, b) => a + b.pageviews, 0)
  const avgBounce = (PAGE_VIEW_DATA.reduce((a, b) => a + b.bounceRate, 0) / PAGE_VIEW_DATA.length).toFixed(1)
  const avgSession = Math.round(PAGE_VIEW_DATA.reduce((a, b) => a + b.avgSession, 0) / PAGE_VIEW_DATA.length)

  const fmtSecs = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`

  return (
    <PageTransition>
      <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-7xl mx-auto space-y-4 md:space-y-6">

        {/* Header */}
        <motion.div variants={slideUp} initial="hidden" animate="visible" className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">Analytics</h1>
              <SampleBadge />
            </div>
            <p className="text-muted-foreground text-sm">
              Website performance, visitor behaviour, and engagement metrics.
            </p>
          </div>
        </motion.div>

        {/* Stat Summary */}
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Visitors',   value: totalVisitors.toLocaleString(),  icon: Users,              color: 'text-strawberry' },
            { label: 'Total Page Views', value: totalPageviews.toLocaleString(), icon: BarChart3,           color: 'text-blueberry'  },
            { label: 'Avg. Bounce Rate', value: `${avgBounce}%`,                 icon: MousePointerClick,   color: 'text-vanilla'    },
            { label: 'Avg. Session',     value: fmtSecs(avgSession),             icon: Clock,               color: 'text-mint'       },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <motion.div key={stat.label} variants={slideUp}>
                <Card className="bg-card border-border rounded-lg md:rounded-xl">
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                        <p className="text-2xl font-nunito font-bold text-foreground">{stat.value}</p>
                      </div>
                      <div className={`p-2 rounded-lg bg-card-hover ${stat.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Page Views Area Chart */}
        <ChartWrapper
          title="Page Views"
          subtitle="Last 14 days"
          variant="strawberry"
          badge={<SampleBadge />}
          legend={[
            { label: 'Page Views', color: chartColors.strawberry },
          ]}
        >
          <AreaChartBranded
            data={TRAFFIC_DATA}
            series={[
              { dataKey: 'pageviews', label: 'Page Views', color: chartColors.strawberry },
            ]}
            xKey="date"
            height={220}
            xTickEvery={3}
          />
        </ChartWrapper>

        {/* Bounce Rate + Session Duration */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

          {/* Bounce Rate Bar Chart */}
          <ChartWrapper
            title="Bounce Rate"
            subtitle="Daily % — lower is better"
            variant="blueberry"
            badge={<SampleBadge />}
          >
            <BarChartBranded
              data={PAGE_VIEW_DATA}
              dataKey="bounceRate"
              label="Bounce Rate"
              xKey="date"
              color={chartColors.blueberry}
              height={200}
              yTickFormatter={(v) => `${v}%`}
            />
          </ChartWrapper>

          {/* Session Duration Line Chart */}
          <ChartWrapper
            title="Avg. Session Duration"
            subtitle="Seconds per visit"
            variant="mint"
            badge={<SampleBadge />}
            legend={[{ label: 'Avg. Session (sec)', color: chartColors.mint }]}
          >
            <LineChartBranded
              data={PAGE_VIEW_DATA}
              series={[
                { dataKey: 'avgSession', label: 'Session (sec)', color: chartColors.mint },
              ]}
              xKey="date"
              height={200}
              xTickEvery={3}
              yTickFormatter={(v) => `${v}s`}
            />
          </ChartWrapper>
        </div>

        {/* Visitors vs Sessions */}
        <ChartWrapper
          title="Visitors vs Sessions"
          subtitle="Last 14 days"
          variant="gold"
          badge={<SampleBadge />}
          legend={[
            { label: 'Visitors', color: chartColors.gold },
            { label: 'Sessions', color: chartColors.vanilla },
          ]}
        >
          <AreaChartBranded
            data={TRAFFIC_DATA}
            series={[
              { dataKey: 'sessions', label: 'Sessions', color: chartColors.vanilla },
              { dataKey: 'visitors', label: 'Visitors', color: chartColors.gold },
            ]}
            xKey="date"
            height={220}
            xTickEvery={3}
          />
        </ChartWrapper>

        {/* Top Pages table */}
        <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
          <Card className="bg-card border-border rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-strawberry" />
                  <CardTitle className="text-sm font-nunito font-semibold">Top Pages</CardTitle>
                </div>
                <SampleBadge />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider min-w-[400px]">
                  <span>Page</span>
                  <span className="text-right">Views</span>
                  <span className="text-right">Bounce</span>
                  <span className="text-right">Avg. Time</span>
                </div>
                {[
                  { page: '/vinyl-fencing',      views: 1840, bounce: '8.4%',  time: '3m 12s' },
                  { page: '/fence-installation', views: 1420, bounce: '10.1%', time: '2m 48s' },
                  { page: '/',                   views: 1230, bounce: '34.2%', time: '1m 05s' },
                  { page: '/wood-fencing',       views:  980, bounce: '12.3%', time: '2m 31s' },
                  { page: '/contact',            views:  760, bounce: '18.7%', time: '1m 52s' },
                ].map((row) => (
                  <div
                    key={row.page}
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-card-hover transition-colors min-w-[400px]"
                  >
                    <span className="text-sm font-medium text-foreground">{row.page}</span>
                    <span className="text-sm text-muted-foreground text-right tabular-nums">{row.views.toLocaleString()}</span>
                    <span className="text-sm text-muted-foreground text-right">{row.bounce}</span>
                    <span className="text-sm text-muted-foreground text-right">{row.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </PageTransition>
  )
}
