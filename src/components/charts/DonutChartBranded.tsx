'use client'

import { useRef, useState, useEffect } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export interface DonutSlice {
  name: string
  value: number
  color: string
}

export interface DonutChartBrandedProps {
  data: DonutSlice[]
  /** Label shown in the center hole */
  centerLabel?: string
  centerSublabel?: string
  height?: number
  innerRadius?: number
  outerRadius?: number
  className?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BrandedTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div className="rounded-xl border border-border bg-popover/95 backdrop-blur-sm px-3 py-2 shadow-xl text-sm">
      <p className="font-medium" style={{ color: entry.payload.color }}>
        {entry.name}
      </p>
      <p className="text-muted-foreground text-xs mt-0.5">
        <span className="tabular-nums font-semibold text-foreground">{entry.value}%</span> of traffic
      </p>
    </div>
  )
}

export function DonutChartBranded({
  data,
  centerLabel,
  centerSublabel,
  height = 220,
  innerRadius = 55,
  outerRadius = 85,
  className,
}: DonutChartBrandedProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const shouldReduceMotion = useReducedMotion()
  const [animKey, setAnimKey] = useState(0)

  useEffect(() => {
    if (isInView) setAnimKey((k) => k + 1)
  }, [isInView])

  return (
    <div ref={ref} className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart key={shouldReduceMotion ? 'static' : animKey}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            dataKey="value"
            nameKey="name"
            paddingAngle={2}
            isAnimationActive={!shouldReduceMotion}
            animationBegin={0}
            animationDuration={900}
            animationEasing="ease-out"
            strokeWidth={0}
          >
            {data.map((slice, i) => (
              <Cell
                key={i}
                fill={slice.color}
                opacity={0.92}
                style={{ filter: `drop-shadow(0 0 4px ${slice.color}55)`, outline: 'none' }}
              />
            ))}
          </Pie>
          <Tooltip content={<BrandedTooltip />} />
          {/* Center label rendered as SVG text */}
          {centerLabel && (
            <text
              x="50%"
              y={centerSublabel ? '46%' : '50%'}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground"
              style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-nunito)' }}
            >
              {centerLabel}
            </text>
          )}
          {centerSublabel && (
            <text
              x="50%"
              y="58%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-nunito)' }}
            >
              {centerSublabel}
            </text>
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
