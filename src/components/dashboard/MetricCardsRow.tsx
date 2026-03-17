'use client'

import { motion } from 'framer-motion'
import { Users, Globe, TrendingUp, DollarSign } from 'lucide-react'
import { MetricCard } from './MetricCard'
import { stagger, slideUp } from '@/lib/animations/variants'
import { chartColors } from '@/lib/chart-theme'

interface MetricsData {
  totalLeads: number
  websiteTraffic: number
  googleRanking: number
  adSpend: number
  adROI: number
  // trend deltas (%)
  leadsTrend: number
  trafficTrend: number
  rankingTrend: number
  adTrend: number
}

interface MetricCardsRowProps {
  data?: MetricsData
  isLoading?: boolean
}

const DEMO_DATA: MetricsData = {
  totalLeads: 47,
  websiteTraffic: 3241,
  googleRanking: 4,
  adSpend: 850,
  adROI: 3.2,
  leadsTrend: 12.5,
  trafficTrend: 8.3,
  rankingTrend: 2,
  adTrend: -4.1,
}

export function MetricCardsRow({ data, isLoading = false }: MetricCardsRowProps) {
  const metrics = data ?? DEMO_DATA
  const isDemo = !data

  return (
    <motion.div
      id="dashboard-metrics"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={slideUp}>
        <MetricCard
          label="Total Leads"
          value={metrics.totalLeads}
          trend={metrics.leadsTrend}
          icon={Users}
          iconColor="text-strawberry"
          sparklineTrend={metrics.leadsTrend >= 0 ? 'up' : 'down'}
          sparklineColor={chartColors.strawberry}
          isLoading={isLoading}
          isDemo={isDemo}
        />
      </motion.div>

      <motion.div variants={slideUp}>
        <MetricCard
          label="Website Traffic"
          value={metrics.websiteTraffic}
          trend={metrics.trafficTrend}
          icon={Globe}
          iconColor="text-blueberry"
          sparklineTrend={metrics.trafficTrend >= 0 ? 'up' : 'down'}
          sparklineColor={chartColors.blueberry}
          isLoading={isLoading}
          isDemo={isDemo}
        />
      </motion.div>

      <motion.div variants={slideUp}>
        <MetricCard
          label="Google Ranking"
          value={metrics.googleRanking}
          prefix="#"
          trend={metrics.rankingTrend}
          trendLabel="positions gained"
          icon={TrendingUp}
          iconColor="text-mint"
          sparklineTrend={metrics.rankingTrend > 0 ? 'up' : 'flat'}
          sparklineColor={chartColors.mint}
          isLoading={isLoading}
          isDemo={isDemo}
        />
      </motion.div>

      <motion.div variants={slideUp}>
        <MetricCard
          label="Ad Spend / ROI"
          value={metrics.adSpend}
          prefix="$"
          trend={metrics.adTrend}
          icon={DollarSign}
          iconColor="text-[#C99035]"
          sparklineTrend={metrics.adTrend >= 0 ? 'up' : 'down'}
          sparklineColor={chartColors.gold}
          isLoading={isLoading}
          isDemo={isDemo}
        />
      </motion.div>
    </motion.div>
  )
}
