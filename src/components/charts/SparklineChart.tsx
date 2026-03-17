'use client'

import { useRef, useState, useEffect } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { chartColors } from '@/lib/chart-theme'

export interface SparklineChartProps {
  data: Array<{ v: number }>
  color?: string
  height?: number
  showTooltip?: boolean
  className?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SparkTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur-sm px-2 py-1 text-xs shadow-lg">
      <span className="tabular-nums font-medium">{payload[0].value.toLocaleString()}</span>
    </div>
  )
}

export function SparklineChart({
  data,
  color = chartColors.strawberry,
  height = 40,
  showTooltip = false,
  className,
}: SparklineChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-20px' })
  const shouldReduceMotion = useReducedMotion()
  const [animKey, setAnimKey] = useState(0)

  useEffect(() => {
    if (isInView) setAnimKey((k) => k + 1)
  }, [isInView])

  const gradId = `spark-grad-${color.replace('#', '')}`

  return (
    <div ref={ref} className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart key={shouldReduceMotion ? 'static' : animKey} data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showTooltip && <Tooltip content={<SparkTooltip />} />}
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            isAnimationActive={!shouldReduceMotion}
            animationDuration={800}
            animationEasing="ease-out"
            dot={false}
            activeDot={showTooltip ? { r: 3, stroke: color, strokeWidth: 2, fill: 'var(--popover)' } : false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
