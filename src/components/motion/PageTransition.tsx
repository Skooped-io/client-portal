'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { pageTransition } from '@/lib/animations/variants'

interface PageTransitionProps {
  children: React.ReactNode
}

/**
 * Wraps page content with AnimatePresence for smooth route transitions.
 * Uses fade + subtle translateY based on PRD spec (200ms ease-in-out).
 *
 * Usage: wrap the children in (portal)/layout.tsx
 */
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={pageTransition}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="h-full w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
