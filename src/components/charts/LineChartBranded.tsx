'use client'

import { useRef, useState, useEffect } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useTheme } from 'next-themes'
import { chartColors } from '@/lib/chart-theme'

export interface LineSeries {
  dataKey: string
  label: string
  color: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface LineChartBrandedProps {
  data: any[]
  series: LineSeries[]
  xKey?: string
  height?: number
  xTickEvery?: number
  yTickFormatter?: (v: number) => string
  /** If true, lower Y values are better (e.g. keyword positions) */
  invertY?: boolean
  className?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BrandedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-popover/95 backdrop-blur-sm px-3 py-2 shadow-xl text-sm min-w-[130px]">
      <p className="text-muted-foreground text-xs mb-1.5">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="font-medium flex items-center gap-1.5" style={{ color: entry.color }}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
          {entry.name}: <span className="tabular-nums">#{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

export function LineChartBranded({
  data,
  series,
  xKey = 'date',
  height = 220,
  xTickEvery = 2,
  yTickFormatter,
  invertY = false,
  className,
}: LineChartBrandedProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const shouldReduceMotion = useReducedMotion()
  const [animKey, setAnimKey] = useState(0)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  useEffect(() => {
    if (isInView) setAnimKey((k) => k + 1)
  }, [isInView])

  const gridColor = isDark ? chartColors.gridLineDark : chartColors.gridLineLight
  const axisColor = isDark ? chartColors.axisTextDark : chartColors.axisTextLight

  const defaultTick = (v: number) => invertY ? `#${v}` : (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))

  return (
    <div ref={ref} className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart key={shouldReduceMotion ? 'static' : animKey} data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <filter key={s.dataKey} id={`glow-line-${s.dataKey}`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v, i) => (i % xTickEvery === 0 ? v : '')}
            tick={{ fill: axisColor, fontSize: 11, fontFamily: 'var(--font-nunito)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: axisColor, fontSize: 11, fontFamily: 'var(--font-nunito)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={yTickFormatter ?? defaultTick}
            reversed={invertY}
            width={42}
          />
          <Tooltip content={<BrandedTooltip />} />

          {series.map((s, i) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              filter={isDark ? `url(#glow-line-${s.dataKey})` : undefined}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: s.color, fill: 'var(--popover)' }}
              isAnimationActive={!shouldReduceMotion}
              animationDuration={900}
              animationEasing="ease-out"
              animationBegin={i * 100}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
