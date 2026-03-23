'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageTransition } from '@/components/motion/PageTransition'
import { Skeleton } from '@/components/motion/Skeleton'
import { stagger, slideUp } from '@/lib/animations/variants'
import { cn } from '@/lib/utils'
import { ChartWrapper, AreaChartBranded, LineChartBranded, ProgressRing } from '@/components/charts'
import { chartColors } from '@/lib/chart-theme'
import { generateKeywordRankingData, generateOrganicData, seoHealthScore } from '@/lib/chart-demo-data'

// ===== Demo Data =====

const DEMO_IMPRESSIONS_DATA = [
  { date: 'Mar 1', impressions: 1240, clicks: 87 },
  { date: 'Mar 5', impressions: 1580, clicks: 112 },
  { date: 'Mar 9', impressions: 1320, clicks: 94 },
  { date: 'Mar 13', impressions: 1890, clicks: 138 },
  { date: 'Mar 17', impressions: 2210, clicks: 167 },
  { date: 'Mar 21', impressions: 1970, clicks: 143 },
  { date: 'Mar 25', impressions: 2450, clicks: 189 },
  { date: 'Mar 29', impressions: 2680, clicks: 214 },
]

const KEYWORD_TREND_DATA = generateKeywordRankingData(8)
const ORGANIC_DATA = generateOrganicData(10)

const DEMO_KEYWORDS = [
  { keyword: 'fence installation near me', position: 3, prev: 5, volume: 1200, clicks: 48 },
  { keyword: 'vinyl fencing company franklin tn', position: 1, prev: 2, volume: 480, clicks: 67 },
  { keyword: 'wood fence cost estimate', position: 7, prev: 7, volume: 2100, clicks: 12 },
  { keyword: 'fencing contractors nashville', position: 5, prev: 8, volume: 720, clicks: 31 },
  { keyword: 'chain link fence installation', position: 12, prev: 9, volume: 950, clicks: 8 },
  { keyword: 'privacy fence panels', position: 4, prev: 4, volume: 1800, clicks: 22 },
  { keyword: 'aluminum fence near me', position: 9, prev: 14, volume: 640, clicks: 15 },
  { keyword: 'fence repair service', position: 6, prev: 6, volume: 530, clicks: 19 },
]

const DEMO_TOP_PAGES = [
  { url: '/vinyl-fencing', title: 'Vinyl Fencing Services', clicks: 214, impressions: 1840, ctr: '11.6%', position: 2.1 },
  { url: '/fence-installation', title: 'Professional Fence Installation', clicks: 167, impressions: 1420, ctr: '11.8%', position: 3.4 },
  { url: '/wood-fencing', title: 'Wood Fence Contractors', clicks: 98, impressions: 1180, ctr: '8.3%', position: 5.2 },
  { url: '/contact', title: 'Contact Us - Free Estimate', clicks: 73, impressions: 890, ctr: '8.2%', position: 6.1 },
  { url: '/', title: 'Home | Gunns Fencing', clicks: 62, impressions: 1230, ctr: '5.0%', position: 7.8 },
]

const DEMO_STATS = [
  { label: 'Total Impressions', value: '14.8K', change: '+22%', positive: true },
  { label: 'Total Clicks', value: '1,044', change: '+18%', positive: true },
  { label: 'Avg. Position', value: '5.8', change: '-1.2', positive: true },
  { label: 'Avg. CTR', value: '7.1%', change: '+0.8%', positive: true },
]

const gbpItems = [
  { label: 'Business Name & Category', complete: true },
  { label: 'Phone & Address', complete: true },
  { label: 'Business Hours', complete: true },
  { label: 'Photos (15+ uploaded)', complete: true },
  { label: 'Service Areas Added', complete: true },
  { label: 'Services & Prices', complete: false },
  { label: 'Questions & Answers', complete: false },
  { label: '10+ Google Reviews', complete: true },
]

const DATE_RANGES = ['7d', '30d', '90d'] as const
type DateRange = (typeof DATE_RANGES)[number]

// ===== Props interface for server-side data injection =====

export interface SeoPageData {
  stats: Array<{ label: string; value: string; change: string; positive: boolean }>
  impressions: Array<{ date: string; impressions: number; clicks: number }>
  keywords: Array<{ keyword: string; position: number; prev: number; volume: number; clicks: number }>
  pages: Array<{ url: string; title: string; clicks: number; impressions: number; ctr: string; position: number }>
}

interface SeoPageProps {
  data?: SeoPageData
}

// ===== Sub-components =====

function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
      Sample data
    </span>
  )
}

function TrendArrow({ current, prev }: { current: number; prev: number }) {
  const diff = prev - current // lower position = better
  if (diff > 0) return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
  if (diff < 0) return <TrendingDown className="w-3.5 h-3.5 text-red-400" />
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />
}

function TrendLabel({ current, prev }: { current: number; prev: number }) {
  const diff = prev - current
  if (diff > 0)
    return <span className="text-emerald-500 text-xs font-medium">+{diff}</span>
  if (diff < 0)
    return <span className="text-red-400 text-xs font-medium">{diff}</span>
  return <span className="text-muted-foreground text-xs">—</span>
}

function GBPRing({ score }: { score: number }) {
  const color = score >= 80 ? '#4CAF50' : score >= 60 ? '#C99035' : '#D94A7A'
  return (
    <ProgressRing
      value={score}
      size={112}
      strokeWidth={8}
      color={color}
      label={`${score}%`}
      sublabel="profile health"
    />
  )
}

// ===== Main page =====

export default function SeoPage({ data }: SeoPageProps = {}) {
  const isDemo = !data
  const displayStats = isDemo ? DEMO_STATS : data.stats
  const displayImpressions = isDemo ? DEMO_IMPRESSIONS_DATA : data.impressions
  const displayKeywords = isDemo ? DEMO_KEYWORDS : data.keywords
  const displayPages = isDemo ? DEMO_TOP_PAGES : data.pages

  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [loading] = useState(false)

  const gbpComplete = gbpItems.filter((i) => i.complete).length
  const gbpScore = Math.round((gbpComplete / gbpItems.length) * 100)

  return (
    <PageTransition>
      <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-7xl mx-auto space-y-4 md:space-y-6">

        {/* Header */}
        <motion.div
          variants={slideUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">SEO & Rankings</h1>
              {isDemo && <SampleBadge />}
            </div>
            <p className="text-muted-foreground text-sm">
              Keyword positions, search impressions, and Google Business Profile health.
            </p>
          </div>

          {/* Date range filter */}
          <div className="flex gap-1 p-1 rounded-xl bg-card border border-border self-start sm:self-auto">
            {DATE_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  dateRange === r
                    ? 'bg-strawberry text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card-hover',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Stat Summary Row */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {displayStats.map((stat) => (
            <motion.div key={stat.label} variants={slideUp}>
              <Card className="bg-card border-border rounded-lg md:rounded-xl">
                <CardContent className="p-4 md:p-5">
                  {loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-7 w-16" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                      <p className="text-2xl font-nunito font-bold text-foreground">{stat.value}</p>
                      {stat.change && (
                        <p className={cn('text-xs font-medium mt-1', stat.positive ? 'text-emerald-500' : 'text-red-400')}>
                          {stat.change} vs prev period
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Impressions / Clicks Chart */}
        <ChartWrapper
          title="Impressions & Clicks"
          variant="gold"
          badge={isDemo ? <SampleBadge /> : undefined}
          legend={[
            { label: 'Impressions', color: chartColors.vanilla },
            { label: 'Clicks',      color: chartColors.blueberry },
          ]}
        >
          {loading ? (
            <Skeleton className="h-56 w-full rounded-lg" />
          ) : (
            <AreaChartBranded
              data={displayImpressions}
              series={[
                { dataKey: 'impressions', label: 'Impressions', color: chartColors.vanilla  },
                { dataKey: 'clicks',      label: 'Clicks',      color: chartColors.blueberry },
              ]}
              xKey="date"
              height={220}
              xTickEvery={2}
            />
          )}
        </ChartWrapper>

        {/* Keyword Position Trend — always demo (no per-keyword historical trend in DB) */}
        <ChartWrapper
          title="Keyword Position Trends"
          subtitle="Top 3 keywords — lower position = better ranking"
          variant="strawberry"
          badge={<SampleBadge />}
          legend={[
            { label: 'Fence Installation',   color: chartColors.strawberry },
            { label: 'Vinyl Fencing Co.',    color: chartColors.blueberry  },
            { label: 'Wood Fence Cost',      color: chartColors.gold       },
          ]}
        >
          <LineChartBranded
            data={KEYWORD_TREND_DATA}
            series={[
              { dataKey: 'kw1', label: 'Fence Installation',  color: chartColors.strawberry },
              { dataKey: 'kw2', label: 'Vinyl Fencing Co.',   color: chartColors.blueberry  },
              { dataKey: 'kw3', label: 'Wood Fence Cost',     color: chartColors.gold       },
            ]}
            xKey="date"
            height={220}
            xTickEvery={2}
            invertY
          />
        </ChartWrapper>

        {/* Organic Traffic Area */}
        <ChartWrapper
          title="Organic Traffic"
          subtitle={isDemo ? 'Impressions & clicks over 10 weeks' : 'Impressions & clicks — 30 days'}
          variant="blueberry"
          badge={isDemo ? <SampleBadge /> : undefined}
          legend={[
            { label: 'Impressions', color: chartColors.vanilla  },
            { label: 'Clicks',      color: chartColors.blueberry },
          ]}
        >
          <AreaChartBranded
            data={isDemo ? ORGANIC_DATA : displayImpressions}
            series={[
              { dataKey: 'impressions', label: 'Impressions', color: chartColors.vanilla  },
              { dataKey: 'clicks',      label: 'Clicks',      color: chartColors.blueberry },
            ]}
            xKey="date"
            height={200}
            xTickEvery={2}
          />
        </ChartWrapper>

        {/* Keywords Table + GBP Card */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Keyword Table — 2/3 */}
          <motion.div
            variants={slideUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.15 }}
            className="xl:col-span-2"
          >
            <Card className="bg-card border-border rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-strawberry" />
                    <CardTitle className="text-sm font-nunito font-semibold">Keyword Rankings</CardTitle>
                  </div>
                  {isDemo && <SampleBadge />}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="px-6 pb-4">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-3 w-10 ml-auto" />
                        <Skeleton className="h-3 w-8" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Table Header */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider min-w-[480px]">
                      <span>Keyword</span>
                      <span className="text-right">Pos.</span>
                      <span className="text-right">Trend</span>
                      <span className="text-right">Volume</span>
                      <span className="text-right">Clicks</span>
                    </div>
                    <motion.div variants={stagger} initial="hidden" animate="visible">
                      {displayKeywords.map((kw) => (
                        <motion.div
                          key={kw.keyword}
                          variants={slideUp}
                          className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-card-hover transition-colors group min-w-[480px]"
                        >
                          <span className="text-sm text-foreground font-medium truncate pr-2">{kw.keyword}</span>
                          <span className={cn(
                            'text-sm font-bold text-right',
                            kw.position <= 3 ? 'text-emerald-500' :
                            kw.position <= 7 ? 'text-foreground' : 'text-muted-foreground',
                          )}>
                            #{kw.position}
                          </span>
                          <span className="flex items-center justify-end gap-1">
                            <TrendArrow current={kw.position} prev={kw.prev} />
                            <TrendLabel current={kw.position} prev={kw.prev} />
                          </span>
                          <span className="text-sm text-muted-foreground text-right">{kw.volume.toLocaleString()}</span>
                          <span className="text-sm text-foreground text-right font-medium">{kw.clicks}</span>
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* GBP Health Card — 1/3 */}
          <motion.div
            variants={slideUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-card border-border rounded-xl h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-strawberry" />
                    <CardTitle className="text-sm font-nunito font-semibold">Google Business Profile</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <GBPRing score={gbpScore} />
                <p className="text-sm text-muted-foreground text-center">
                  Profile {gbpScore >= 80 ? 'is in great shape' : 'needs some attention'}
                </p>
                <div className="w-full space-y-2">
                  {gbpItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      {item.complete ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className={cn(
                        'text-xs',
                        item.complete ? 'text-foreground' : 'text-muted-foreground',
                      )}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Top Performing Pages Table */}
        <motion.div
          variants={slideUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-card border-border rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-strawberry" />
                  <CardTitle className="text-sm font-nunito font-semibold">Top Performing Pages</CardTitle>
                </div>
                {isDemo && <SampleBadge />}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="px-6 pb-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-3 w-16 ml-auto" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider min-w-[480px]">
                    <span>Page</span>
                    <span className="text-right">Clicks</span>
                    <span className="text-right">Impressions</span>
                    <span className="text-right">CTR</span>
                    <span className="text-right">Avg Pos.</span>
                  </div>
                  <motion.div variants={stagger} initial="hidden" animate="visible">
                    {displayPages.map((page) => (
                      <motion.div
                        key={page.url}
                        variants={slideUp}
                        className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-card-hover transition-colors min-w-[480px]"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{page.title}</p>
                          <p className="text-xs text-muted-foreground">{page.url}</p>
                        </div>
                        <span className="text-sm font-medium text-foreground text-right self-center">{page.clicks}</span>
                        <span className="text-sm text-muted-foreground text-right self-center">{page.impressions.toLocaleString()}</span>
                        <Badge variant="secondary" className="self-center ml-auto text-xs">{page.ctr}</Badge>
                        <span className="text-sm text-muted-foreground text-right self-center">
                          {page.position > 0 ? page.position : '—'}
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </PageTransition>
  )
}
