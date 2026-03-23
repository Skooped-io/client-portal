'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SprinkleConfetti } from '@/components/motion/SprinkleConfetti'

const MESSAGES = [
  'Setting up your website...',
  'Configuring your dashboard...',
  'Optimizing for search engines...',
  'Training your AI team...',
  'Almost there...',
]

const TOTAL_DURATION_MS = 12000
const MESSAGE_INTERVAL_MS = 2500

interface LoadingScreenProps {
  onComplete: () => void
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  // Cycle messages every 2.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, MESSAGES.length - 1))
    }, MESSAGE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  // Animate progress from 0 → 100 over ~12s
  useEffect(() => {
    const startTime = Date.now()
    let raf: number

    const tick = () => {
      const elapsed = Date.now() - startTime
      const pct = Math.min((elapsed / TOTAL_DURATION_MS) * 100, 100)
      setProgress(pct)

      if (pct < 100) {
        raf = requestAnimationFrame(tick)
      } else {
        setDone(true)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Call onComplete after confetti has a moment to shine
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(onComplete, 1800)
    return () => clearTimeout(timer)
  }, [done, onComplete])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6">
      {/* Confetti burst at completion */}
      <SprinkleConfetti active={done} count={80} autoHideMs={2500} />

      {/* Ice cream scoop icon */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-8"
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: '#D94A7A18', border: '1.5px solid #D94A7A30' }}
        >
          <svg width="40" height="44" viewBox="0 0 20 22" fill="none" aria-hidden="true">
            <ellipse cx="10" cy="9" rx="8" ry="7" fill="#D94A7A" opacity={0.9} />
            <ellipse cx="8" cy="6" rx="2.5" ry="1.8" fill="white" opacity={0.3} />
            <polygon points="4,15 16,15 10,22" fill="#C99035" />
            <line x1="5" y1="17" x2="15" y2="17" stroke="#A07820" strokeWidth="0.8" opacity={0.5} />
          </svg>
        </div>
      </motion.div>

      {/* Cycling text */}
      <div className="h-8 flex items-center justify-center mb-10 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="font-nunito text-lg font-semibold text-foreground text-center"
          >
            {MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm">
        <div className="h-2.5 rounded-full bg-border overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #D94A7A 0%, #F07FA0 50%, #E8C87A 100%)',
              boxShadow: progress > 5 ? '0 0 8px 1px rgba(217,74,122,0.45)' : 'none',
            }}
            transition={{ ease: 'linear' }}
          />
        </div>

        <div className="flex justify-between mt-2">
          <span className="text-xs text-muted-foreground font-dm-sans">Building your site</span>
          <span className="text-xs font-medium text-foreground font-dm-sans tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* Subtle gradient accent at bottom */}
      <div className="fixed bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-strawberry via-vanilla-500 to-mint opacity-60" />
    </div>
  )
}
