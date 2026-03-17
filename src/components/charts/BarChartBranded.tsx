'use client'

import { useRef, useState, useEffect } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { useTheme } from 'next-themes'
import { chartColors } from '@/lib/chart-theme'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface BarChartBrandedProps {
  data: any[]
  dataKey: string
  label?: string
  xKey?: string
  color?: string
  height?: number
  yTickFormatter?: (v: number) => string
  /** If true, each bar gets a color from the ice cream palette */
  multiColor?: boolean
  className?: string
}

const multiColors = [
  chartColors.strawberry,
  chartColors.blueberry,
  chartColors.vanilla,
  chartColors.mint,
  chartColors.gold,
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BrandedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-popover/95 backdrop-blur-sm px-3 py-2 shadow-xl text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="font-medium" style={{ color: entry.color ?? entry.fill }}>
          {entry.name}: <span className="tabular-nums">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </p>
      ))}
    </div>
  )
}

export function BarChartBranded({
  data,
  dataKey,
  label,
  xKey = 'date',
  color = chartColors.strawberry,
  height = 200,
  yTickFormatter,
  multiColor = false,
  className,
}: BarChartBrandedProps) {
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

  const defaultYTick = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)

  return (
    <div ref={ref} className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart key={shouldReduceMotion ? 'static' : animKey} data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: axisColor, fontSize: 11, fontFamily: 'var(--font-nunito)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: axisColor, fontSize: 11, fontFamily: 'var(--font-nunito)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={yTickFormatter ?? defaultYTick}
            width={36}
          />
          <Tooltip content={<BrandedTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', radius: 6 }} />
          <Bar
            dataKey={dataKey}
            name={label ?? dataKey}
            fill={color}
            radius={[5, 5, 0, 0]}
            isAnimationActive={!shouldReduceMotion}
            animationDuration={800}
            animationEasing="ease-out"
          >
            {multiColor && data.map((_, i) => (
              <Cell key={i} fill={multiColors[i % multiColors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
