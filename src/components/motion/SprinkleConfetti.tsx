'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface SprinkleParticle {
  id: number
  x: number
  y: number
  color: string
  rotate: number
  width: number
  height: number
  xDrift: number
  duration: number
  delay: number
}

const ICE_CREAM_COLORS = [
  '#D94A7A', // strawberry
  '#E8C87A', // vanilla
  '#C99035', // waffle gold
  '#4CAF50', // mint
  '#5B8DEF', // blueberry
  '#F07FA0', // light pink
  '#7DD89A', // light mint
  '#FFD166', // butter yellow
]

function generateParticles(count: number): SprinkleParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: -10 - Math.random() * 20,
    color: ICE_CREAM_COLORS[Math.floor(Math.random() * ICE_CREAM_COLORS.length)],
    rotate: Math.random() * 360,
    width: 4 + Math.random() * 6,
    height: 8 + Math.random() * 10,
    xDrift: (Math.random() - 0.5) * 200,
    duration: 1.8 + Math.random() * 1.2,
    delay: Math.random() * 0.5,
  }))
}

interface SprinkleConfettiProps {
  /** Whether to show the confetti */
  active: boolean
  /** Number of particles (default: 60) */
  count?: number
  /** Duration in ms before auto-hiding (default: 3000) */
  autoHideMs?: number
  /** Position mode (default: fixed) */
  position?: 'fixed' | 'absolute'
}

export function SprinkleConfetti({
  active,
  count = 60,
  autoHideMs = 3000,
  position = 'fixed',
}: SprinkleConfettiProps) {
  const [particles, setParticles] = useState<SprinkleParticle[]>([])
  const [visible, setVisible] = useState(false)

  const trigger = useCallback(() => {
    setParticles(generateParticles(count))
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), autoHideMs)
    return () => clearTimeout(timer)
  }, [count, autoHideMs])

  useEffect(() => {
    if (active) {
      return trigger()
    }
  }, [active, trigger])

  const posClass = position === 'fixed' ? 'fixed' : 'absolute'

  return (
    <AnimatePresence>
      {visible && (
        <div
          className={`${posClass} inset-0 pointer-events-none overflow-hidden z-50`}
          aria-hidden="true"
        >
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                x: `${p.x}vw`,
                y: `${p.y}vh`,
                rotate: p.rotate,
                opacity: 1,
                scale: 0.5,
              }}
              animate={{
                y: '110vh',
                x: `calc(${p.x}vw + ${p.xDrift}px)`,
                rotate: p.rotate + 720,
                opacity: [1, 1, 0.8, 0],
                scale: [0.5, 1, 1, 0.7],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: [0.2, 0.8, 0.4, 1],
              }}
              style={{
                position: 'absolute',
                width: p.width,
                height: p.height,
                backgroundColor: p.color,
                borderRadius: p.width / 2,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}

// ===== Hook for triggering confetti =====

export function useSprinkleConfetti() {
  const [active, setActive] = useState(false)

  const trigger = useCallback(() => {
    setActive(false)
    // Small tick ensures re-trigger works
    setTimeout(() => setActive(true), 10)
  }, [])

  const reset = useCallback(() => setActive(false), [])

  return { active, trigger, reset }
}
