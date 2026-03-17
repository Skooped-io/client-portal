'use client'

import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface ChartWrapperProps {
  title?: string
  subtitle?: string
  legend?: Array<{ label: string; color: string }>
  variant?: 'strawberry' | 'gold' | 'blueberry' | 'mint'
  loading?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

const glowClasses: Record<NonNullable<ChartWrapperProps['variant']>, string> = {
  strawberry: 'hover:shadow-[0_0_24px_rgb(217_74_122_/_0.18)] dark:hover:shadow-[0_0_24px_rgb(217_74_122_/_0.28)]',
  gold:       'hover:shadow-[0_0_24px_rgb(201_144_53_/_0.18)]  dark:hover:shadow-[0_0_24px_rgb(201_144_53_/_0.28)]',
  blueberry:  'hover:shadow-[0_0_24px_rgb(91_141_239_/_0.18)]  dark:hover:shadow-[0_0_24px_rgb(91_141_239_/_0.28)]',
  mint:       'hover:shadow-[0_0_24px_rgb(76_175_80_/_0.18)]   dark:hover:shadow-[0_0_24px_rgb(76_175_80_/_0.28)]',
}

const accentClasses: Record<NonNullable<ChartWrapperProps['variant']>, string> = {
  strawberry: 'from-[#D94A7A] via-[#E8C87A] to-[#D94A7A]',
  gold:       'from-[#C99035] via-[#E8C87A] to-[#C99035]',
  blueberry:  'from-[#5B8DEF] via-[#D94A7A] to-[#5B8DEF]',
  mint:       'from-[#4CAF50] via-[#E8C87A] to-[#4CAF50]',
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-muted/60', className)} />
  )
}

export function ChartWrapper({
  title,
  subtitle,
  legend,
  variant = 'strawberry',
  loading = false,
  badge,
  children,
  className,
  contentClassName,
}: ChartWrapperProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      ref={ref}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.55, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border border-border bg-card overflow-hidden',
        'transition-shadow duration-300',
        glowClasses[variant],
        className,
      )}
    >
      {/* Accent top bar */}
      <div className={cn('h-0.5 w-full bg-gradient-to-r opacity-70', accentClasses[variant])} />

      {/* Header */}
      {(title || subtitle || badge) && (
        <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {loading ? (
              <>
                <SkeletonBlock className="h-4 w-36 mb-1.5" />
                {subtitle && <SkeletonBlock className="h-3 w-24" />}
              </>
            ) : (
              <>
                {title && (
                  <p className="text-sm font-nunito font-semibold text-foreground truncate">{title}</p>
                )}
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                )}
              </>
            )}
          </div>
          {badge && !loading && (
            <div className="shrink-0">{badge}</div>
          )}
        </div>
      )}

      {/* Content */}
      <div className={cn('px-5 pb-5', !title && !subtitle && !badge && 'pt-4', contentClassName)}>
        {loading ? (
          <SkeletonBlock className="h-52 w-full" />
        ) : (
          children
        )}
      </div>

      {/* Legend */}
      {legend && !loading && (
        <div className="flex flex-wrap items-center gap-4 px-5 pb-4">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full" style={{ background: item.color }} />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
