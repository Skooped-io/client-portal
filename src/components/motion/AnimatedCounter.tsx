'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView, motion } from 'framer-motion'
import { counterVariants } from '@/lib/animations/variants'
import { cn } from '@/lib/utils'

interface AnimatedCounterProps {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
  decimals?: number
  className?: string
  /** Format with commas (e.g. 1,234) */
  formatNumber?: boolean
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Animated counter that counts up from 0 to value when it enters the viewport.
 * Uses framer-motion for the container animation + RAF for the count interpolation.
 */
export function AnimatedCounter({
  value,
  duration = 1200,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
  formatNumber = false,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const [hasAnimated, setHasAnimated] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isInView || hasAnimated) return

    setHasAnimated(true)
    const startTime = performance.now()
    const startValue = 0

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutCubic(progress)
      const current = startValue + (value - startValue) * easedProgress

      setDisplayValue(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [isInView, hasAnimated, value, duration])

  const formatted = formatNumber
    ? displayValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : displayValue.toFixed(decimals)

  return (
    <motion.span
      ref={ref}
      variants={counterVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className={cn('tabular-nums', className)}
    >
      {prefix}
      {formatted}
      {suffix}
    </motion.span>
  )
}
