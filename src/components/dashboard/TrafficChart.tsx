'use client'

import { useRef, useState, useEffect } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { chartColors, generate30DayData } from '@/lib/chart-theme'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

interface TrafficChartProps {
  data?: { date: string; traffic: number; impressions: number }[]
  isDemo?: boolean
  className?: string
}

const DEMO_DATA = generate30DayData()

// Only show every 5th label to avoid crowding
function tickFormatter(value: string, index: number) {
  return index % 5 === 0 ? value : ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-popover/95 backdrop-blur-sm px-3 py-2 shadow-xl text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {payload.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (entry: any) => (
          <p key={entry.name} className="font-medium" style={{ color: entry.color }}>
            {entry.name === 'traffic' ? 'Visitors' : 'Impressions'}:{' '}
            <span className="tabular-nums">{entry.value.toLocaleString()}</span>
          </p>
        )
      )}
    </div>
  )
}

export function TrafficChart({ data, isDemo, className }: TrafficChartProps) {
  const chartData = data ?? DEMO_DATA
  const showDemo = isDemo ?? !data
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const [animKey, setAnimKey] = useState(0)

  useEffect(() => {
    if (isInView) setAnimKey((k) => k + 1)
  }, [isInView])

  const gridColor = isDark ? chartColors.gridLineDark : chartColors.gridLineLight
  const axisColor = isDark ? chartColors.axisTextDark : chartColors.axisTextLight

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Demo overlay */}
      {showDemo && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-background/80 border border-border text-muted-foreground backdrop-blur-sm mb-2">
            Sample data
          </span>
          <p className="text-xs text-muted-foreground">
            Connect Google Analytics to see your real traffic
          </p>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn(showDemo && 'opacity-50 blur-[1px] pointer-events-none')}
      >
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart key={animKey} data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              {/* SVG glow filter for lines */}
              <filter id="glow-strawberry" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-blueberry" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Area fill gradients */}
              <linearGradient id="strawberryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.strawberry} stopOpacity={0.22} />
                <stop offset="95%" stopColor={chartColors.strawberry} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="blueberryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.blueberry} stopOpacity={0.18} />
                <stop offset="95%" stopColor={chartColors.blueberry} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={tickFormatter}
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="impressions"
              stroke={chartColors.blueberry}
              strokeWidth={1.5}
              fill="url(#blueberryFill)"
              filter={isDark ? 'url(#glow-blueberry)' : undefined}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
              animationBegin={0}
              name="impressions"
            />
            <Area
              type="monotone"
              dataKey="traffic"
              stroke={chartColors.strawberry}
              strokeWidth={2}
              fill="url(#strawberryFill)"
              filter={isDark ? 'url(#glow-strawberry)' : undefined}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
              animationBegin={150}
              name="traffic"
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 px-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full" style={{ background: chartColors.strawberry }} />
            <span className="text-xs text-muted-foreground">Website Visitors</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full" style={{ background: chartColors.blueberry }} />
            <span className="text-xs text-muted-foreground">Google Impressions</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
