'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { AnimatedCounter } from '@/components/motion/AnimatedCounter'
import { SkeletonMetricCard } from '@/components/motion/Skeleton'
import { chartColors, generateSparklineData } from '@/lib/chart-theme'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

export interface MetricCardProps {
  id?: string
  label: string
  value: number
  prefix?: string
  suffix?: string
  trend?: number        // percentage change, positive or negative
  trendLabel?: string
  icon: LucideIcon
  iconColor?: string
  sparklineTrend?: 'up' | 'down' | 'flat'
  sparklineColor?: string
  isLoading?: boolean
  isDemo?: boolean
  className?: string
}

function TrendIndicator({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
        <TrendingUp className="w-3 h-3" />
        +{trend.toFixed(1)}%
      </span>
    )
  }
  if (trend < 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-strawberry">
        <TrendingDown className="w-3 h-3" />
        {trend.toFixed(1)}%
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Minus className="w-3 h-3" />
      No change
    </span>
  )
}

export function MetricCard({
  id,
  label,
  value,
  prefix = '',
  suffix = '',
  trend,
  trendLabel = 'vs last month',
  icon: Icon,
  iconColor = 'text-strawberry',
  sparklineTrend = 'up',
  sparklineColor,
  isLoading = false,
  isDemo = false,
  className,
}: MetricCardProps) {
  const sparkData = useMemo(
    () => generateSparklineData(sparklineTrend),
    [sparklineTrend]
  )

  const lineColor =
    sparklineColor ??
    (sparklineTrend === 'up'
      ? chartColors.mint
      : sparklineTrend === 'down'
      ? chartColors.strawberry
      : chartColors.vanilla)

  if (isLoading) return <SkeletonMetricCard className={className} />

  return (
    <motion.div
      id={id}
      className={cn(
        'group relative rounded-xl border border-border bg-card p-5 cursor-default overflow-hidden',
        isDemo && 'opacity-75',
        className
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={{
        y: -2,
        boxShadow: isDemo
          ? undefined
          : '0 8px 24px -4px rgba(217, 74, 122, 0.22), 0 0 0 1px rgba(217, 74, 122, 0.08)',
      }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Ice cream gradient accent top bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-strawberry/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      {/* Demo badge */}
      {isDemo && (
        <span className="absolute top-2.5 right-2.5 z-10 px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted/60 border border-border text-muted-foreground backdrop-blur-sm">
          Sample data
        </span>
      )}

      {/* Top row — label + icon */}
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-none">
          {label}
        </p>
        <div
          className={cn(
            'p-2 rounded-lg bg-strawberry/10 shrink-0 transition-transform duration-200',
            'group-hover:scale-110'
          )}
        >
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
      </div>

      {/* Value */}
      <div className="mb-2">
        <p className="text-2xl font-nunito font-bold text-foreground tabular-nums leading-none">
          {prefix}
          <AnimatedCounter
            value={value}
            formatNumber
            className="inline"
          />
          {suffix}
        </p>
      </div>

      {/* Trend + sparkline */}
      <div className="flex items-end justify-between gap-2">
        <div className="space-y-0.5">
          {trend !== undefined ? (
            <>
              <TrendIndicator trend={trend} />
              <p className="text-[10px] text-muted-foreground">{trendLabel}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No data yet</p>
          )}
        </div>

        {/* Sparkline */}
        <div className="w-20 h-10 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={lineColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive
                animationDuration={800}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  )
}
