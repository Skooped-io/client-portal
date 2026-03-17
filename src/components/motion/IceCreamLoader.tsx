'use client'

import { motion, AnimatePresence } from 'framer-motion'

interface IceCreamLoaderProps {
  /** Show the full-page overlay variant */
  fullPage?: boolean
  /** Label shown under the animation */
  label?: string
  /** Show at all */
  show?: boolean
}

// ===== Individual Scoop =====

interface ScoopProps {
  color: string
  highlightColor: string
  delay: number
  index: number
  yOffset: number
}

function Scoop({ color, highlightColor, delay, yOffset }: ScoopProps) {
  return (
    <motion.g
      initial={{ opacity: 0, y: 40, scale: 0.6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 280,
        damping: 16,
        delay,
        opacity: { duration: 0.2, delay },
      }}
    >
      {/* Main scoop circle */}
      <motion.ellipse
        cx="50"
        cy={yOffset}
        rx="22"
        ry="20"
        fill={color}
        animate={{
          scaleY: [1, 1.02, 1],
          scaleX: [1, 0.99, 1],
        }}
        transition={{
          duration: 2.4,
          delay: delay + 0.8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ transformOrigin: `50px ${yOffset + 20}px` }}
      />
      {/* Highlight */}
      <ellipse cx="42" cy={yOffset - 7} rx="7" ry="5" fill={highlightColor} opacity={0.5} />
      {/* Small sparkle dot */}
      <circle cx="38" cy={yOffset - 10} r="2" fill="white" opacity={0.7} />
    </motion.g>
  )
}

// ===== Waffle Cone =====

function WaffleCone() {
  return (
    <motion.g
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* Cone body */}
      <polygon
        points="28,78 72,78 50,130"
        fill="#C99035"
        stroke="#A07820"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Waffle grid lines — horizontal */}
      <line x1="31" y1="87" x2="69" y2="87" stroke="#A07820" strokeWidth="1" opacity={0.6} />
      <line x1="34" y1="96" x2="66" y2="96" stroke="#A07820" strokeWidth="1" opacity={0.6} />
      <line x1="37" y1="105" x2="63" y2="105" stroke="#A07820" strokeWidth="1" opacity={0.6} />
      <line x1="41" y1="114" x2="59" y2="114" stroke="#A07820" strokeWidth="1" opacity={0.6} />
      {/* Waffle grid lines — diagonal */}
      <line x1="29" y1="78" x2="50" y2="130" stroke="#A07820" strokeWidth="0.8" opacity={0.35} />
      <line x1="38" y1="78" x2="53" y2="130" stroke="#A07820" strokeWidth="0.8" opacity={0.35} />
      <line x1="50" y1="78" x2="56" y2="130" stroke="#A07820" strokeWidth="0.8" opacity={0.35} />
      <line x1="62" y1="78" x2="59" y2="130" stroke="#A07820" strokeWidth="0.8" opacity={0.35} />
      <line x1="71" y1="78" x2="62" y2="130" stroke="#A07820" strokeWidth="0.8" opacity={0.35} />
      {/* Cone rim */}
      <rect x="27" y="75" width="46" height="6" rx="3" fill="#D4A43A" />
    </motion.g>
  )
}

// ===== Sprinkle Dots (decorative) =====

const sprinklePositions = [
  { x: 18, y: 50, rotate: 25, color: '#D94A7A' },
  { x: 82, y: 42, rotate: -15, color: '#E8C87A' },
  { x: 14, y: 80, rotate: 45, color: '#4CAF50' },
  { x: 86, y: 75, rotate: -30, color: '#5B8DEF' },
  { x: 22, y: 32, rotate: 60, color: '#C99035' },
  { x: 78, y: 28, rotate: -50, color: '#D94A7A' },
]

function Sprinkles() {
  return (
    <>
      {sprinklePositions.map((s, i) => (
        <motion.rect
          key={i}
          x={s.x - 2}
          y={s.y - 5}
          width="4"
          height="10"
          rx="2"
          fill={s.color}
          opacity={0.7}
          style={{ transformOrigin: `${s.x}px ${s.y}px`, rotate: s.rotate }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.7, 0.5, 0.7],
            scale: [0, 1, 1, 1],
            rotate: [s.rotate, s.rotate + 15, s.rotate - 10, s.rotate],
          }}
          transition={{
            duration: 3,
            delay: 1.2 + i * 0.12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </>
  )
}

// ===== Main Loader =====

function IceCreamSVG() {
  const scoops = [
    { color: '#D94A7A', highlightColor: '#F07FA0', delay: 0.6, yOffset: 58 },  // strawberry (bottom)
    { color: '#E8C87A', highlightColor: '#F5DFA0', delay: 1.1, yOffset: 38 },  // vanilla (middle)
    { color: '#4CAF70', highlightColor: '#7DD89A', delay: 1.6, yOffset: 19 },  // mint (top)
  ]

  return (
    <svg
      viewBox="0 0 100 135"
      width="100"
      height="135"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Loading..."
    >
      <Sprinkles />
      {/* Render scoops bottom to top */}
      {scoops.map((scoop, i) => (
        <Scoop key={i} {...scoop} index={i} />
      ))}
      <WaffleCone />
    </svg>
  )
}

export function IceCreamLoader({ fullPage = false, label = 'Loading...', show = true }: IceCreamLoaderProps) {
  if (!show) return null

  if (fullPage) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
        >
          <IceCreamSVG />
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="mt-4 text-sm font-medium text-muted-foreground font-dm-sans"
          >
            {label}
          </motion.p>
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <IceCreamSVG />
      <p className="mt-3 text-sm font-medium text-muted-foreground font-dm-sans">{label}</p>
    </div>
  )
}

// ===== Inline / small variant for buttons =====

export function IceCreamSpinner({ size = 24 }: { size?: number }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      animate={{ rotate: 360 }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="12" cy="12" r="10" stroke="#E0D4C4" strokeWidth="2" fill="none" />
      <path
        d="M12 2 A10 10 0 0 1 22 12"
        stroke="#D94A7A"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </motion.svg>
  )
}
