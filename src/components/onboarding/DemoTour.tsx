'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type TourStep, TOUR_COMPLETE_STEP } from './tour-steps'

// ===== Types =====

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

interface DemoTourProps {
  steps: TourStep[]
  currentStep: number
  isComplete: boolean
  onNext: () => void
  onBack: () => void
  onComplete: () => void
  onSkip: () => void
}

// ===== Helpers =====

function getTargetRect(targetId: string): SpotlightRect | null {
  const el = document.querySelector(`[data-tour-id="${targetId}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

// ===== Spotlight =====

interface SpotlightProps {
  rect: SpotlightRect
}

function Spotlight({ rect }: SpotlightProps) {
  return (
    <motion.div
      aria-hidden
      className="fixed pointer-events-none rounded-xl"
      animate={{
        top: rect.top - 6,
        left: rect.left - 8,
        width: rect.width + 16,
        height: rect.height + 12,
      }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      style={{
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72)',
        zIndex: 9991,
        outline: '2px solid rgba(217, 74, 122, 0.7)',
        outlineOffset: '2px',
      }}
    />
  )
}

// ===== Tooltip card =====

interface TooltipCardProps {
  spotlightRect: SpotlightRect | null
  step: TourStep | null
  isFinalStep: boolean
  currentStep: number
  totalSteps: number
  onNext: () => void
  onBack: () => void
  onComplete: () => void
  onSkip: () => void
}

function TooltipCard({
  spotlightRect,
  step,
  isFinalStep,
  currentStep,
  totalSteps,
  onNext,
  onBack,
  onComplete,
  onSkip,
}: TooltipCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!cardRef.current) return

    const cardWidth = cardRef.current.offsetWidth || 320
    const cardHeight = cardRef.current.offsetHeight || 200
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pad = 20

    if (isFinalStep || !spotlightRect) {
      // Centered
      setPosition({
        top: Math.max(pad, (vh - cardHeight) / 2),
        left: Math.max(pad, (vw - cardWidth) / 2),
      })
      return
    }

    // Default: to the right of the spotlight
    let top = spotlightRect.top + spotlightRect.height / 2 - cardHeight / 2
    let left = spotlightRect.left + spotlightRect.width + 24

    // If overflows right, flip to left
    if (left + cardWidth > vw - pad) {
      left = spotlightRect.left - cardWidth - 24
    }

    // Clamp vertical
    top = Math.max(pad, Math.min(top, vh - cardHeight - pad))
    // Clamp horizontal
    left = Math.max(pad, Math.min(left, vw - cardWidth - pad))

    // On mobile/narrow: center below the spotlight
    if (vw < 768) {
      top = spotlightRect.top + spotlightRect.height + 16
      left = Math.max(pad, (vw - Math.min(cardWidth, vw - pad * 2)) / 2)
      // If too close to bottom, flip above
      if (top + cardHeight > vh - pad) {
        top = Math.max(pad, spotlightRect.top - cardHeight - 16)
      }
    }

    setPosition({ top, left })
  }, [spotlightRect, isFinalStep])

  const title = isFinalStep ? TOUR_COMPLETE_STEP.title : step?.title ?? ''
  const description = isFinalStep ? TOUR_COMPLETE_STEP.description : step?.description ?? ''

  return (
    <motion.div
      ref={cardRef}
      key={isFinalStep ? 'final' : step?.id}
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 4 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="fixed w-[min(320px,calc(100vw-40px))] rounded-xl border border-border/60 shadow-2xl"
      style={{
        top: position.top,
        left: position.left,
        zIndex: 9993,
        background: 'var(--card, #F2E8D6)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Strawberry top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-strawberry via-vanilla-500 to-strawberry rounded-t-xl opacity-80" />

      <div className="p-5">
        {/* Step counter + skip */}
        <div className="flex items-center justify-between mb-3">
          {!isFinalStep ? (
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Step {currentStep + 1} of {totalSteps}
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-strawberry uppercase tracking-wider">
              Tour complete
            </span>
          )}
          <button
            onClick={onSkip}
            aria-label="Skip tour"
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-card-hover"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Step dots */}
        {!isFinalStep && (
          <div className="flex items-center gap-1.5 mb-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1 rounded-full transition-all duration-300',
                  i === currentStep
                    ? 'w-5 bg-strawberry'
                    : i < currentStep
                    ? 'w-2 bg-strawberry/40'
                    : 'w-2 bg-border',
                )}
              />
            ))}
          </div>
        )}

        {/* Title */}
        <h3 className="font-nunito font-bold text-foreground text-base leading-snug mb-2">
          {isFinalStep && (
            <CheckCircle2 className="inline w-4 h-4 text-emerald-500 mr-1.5 -mt-0.5" />
          )}
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

        {/* Navigation */}
        <div className={cn('flex items-center mt-5', isFinalStep ? 'justify-end' : 'justify-between')}>
          {!isFinalStep && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              disabled={currentStep === 0}
              className="text-xs text-muted-foreground hover:text-foreground gap-1 h-8 rounded-xl disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back
            </Button>
          )}

          {isFinalStep ? (
            <Button
              size="sm"
              onClick={onComplete}
              className="bg-strawberry hover:bg-strawberry/90 text-white rounded-xl text-xs h-8 gap-1.5 px-4"
            >
              Get started
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onNext}
              className="bg-strawberry hover:bg-strawberry/90 text-white rounded-xl text-xs h-8 gap-1.5 px-4"
            >
              {currentStep === totalSteps - 1 ? 'Finish' : 'Next'}
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ===== Main DemoTour =====

export function DemoTour({ steps, currentStep, isComplete, onNext, onBack, onComplete, onSkip }: DemoTourProps) {
  const [mounted, setMounted] = useState(false)
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)

  const isFinalStep = isComplete
  const activeStep = !isFinalStep ? steps[currentStep] : null

  useEffect(() => {
    setMounted(true)
  }, [])

  // Recalculate spotlight rect whenever step changes or window resizes
  useEffect(() => {
    if (isFinalStep || !activeStep) {
      setSpotlightRect(null)
      return
    }

    function updateRect() {
      if (!activeStep) return
      const rect = getTargetRect(activeStep.targetId)
      setSpotlightRect(rect)
    }

    updateRect()

    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [activeStep, isFinalStep])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {/* Backdrop — blocks all clicks outside tooltip */}
      <motion.div
        key="tour-backdrop"
        aria-hidden
        className="fixed inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ zIndex: 9989, background: 'transparent', pointerEvents: 'all' }}
      />

      {/* Dark overlay — visible darkening (behind spotlight) */}
      {!isFinalStep && spotlightRect && (
        <motion.div
          key="tour-overlay"
          aria-hidden
          className="fixed inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ zIndex: 9990, background: 'rgba(0,0,0,0)', pointerEvents: 'none' }}
        />
      )}

      {/* Dark full-screen fill for non-spotlight steps */}
      {isFinalStep && (
        <motion.div
          key="tour-overlay-final"
          aria-hidden
          className="fixed inset-0 bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ zIndex: 9990, pointerEvents: 'none' }}
        />
      )}

      {/* Spotlight lens */}
      {!isFinalStep && spotlightRect && (
        <Spotlight key="spotlight" rect={spotlightRect} />
      )}

      {/* Tooltip card */}
      <TooltipCard
        key="tooltip"
        spotlightRect={spotlightRect}
        step={activeStep}
        isFinalStep={isFinalStep}
        currentStep={currentStep}
        totalSteps={steps.length}
        onNext={onNext}
        onBack={onBack}
        onComplete={onComplete}
        onSkip={onSkip}
      />
    </AnimatePresence>,
    document.body,
  )
}
