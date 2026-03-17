'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { DemoTour } from './DemoTour'
import { TOUR_STEPS } from './tour-steps'
import { createClient } from '@/lib/supabase/client'

// ===== Context =====

interface DemoTourContextValue {
  replayTour: () => void
}

const DemoTourContext = createContext<DemoTourContextValue>({ replayTour: () => {} })

export function useDemoTour() {
  return useContext(DemoTourContext)
}

// ===== Provider =====

interface DemoTourProviderProps {
  /** Passed from the server — true if user_metadata.tour_completed is set */
  tourCompleted: boolean
  children: React.ReactNode
}

type TourState = 'idle' | 'active' | 'complete'

export function DemoTourProvider({ tourCompleted, children }: DemoTourProviderProps) {
  const [tourState, setTourState] = useState<TourState>('idle')
  const [currentStep, setCurrentStep] = useState(0)

  // Auto-start on first login — small delay so the page fully renders first
  useEffect(() => {
    if (tourCompleted) return
    const timer = setTimeout(() => setTourState('active'), 1200)
    return () => clearTimeout(timer)
  }, [tourCompleted])

  const markComplete = useCallback(async () => {
    setTourState('idle')
    setCurrentStep(0)
    // Persist to Supabase user_metadata so tour never shows again
    const supabase = createClient()
    await supabase.auth.updateUser({ data: { tour_completed: true } })
  }, [])

  const onNext = useCallback(() => {
    if (currentStep >= TOUR_STEPS.length - 1) {
      // Move to the "complete" congratulations step
      setTourState('complete')
    } else {
      setCurrentStep((s) => s + 1)
    }
  }, [currentStep])

  const onBack = useCallback(() => {
    if (tourState === 'complete') {
      setTourState('active')
      setCurrentStep(TOUR_STEPS.length - 1)
    } else {
      setCurrentStep((s) => Math.max(0, s - 1))
    }
  }, [tourState])

  const onSkip = useCallback(async () => {
    await markComplete()
  }, [markComplete])

  const onComplete = useCallback(async () => {
    await markComplete()
  }, [markComplete])

  const replayTour = useCallback(() => {
    setCurrentStep(0)
    setTourState('active')
  }, [])

  const isTourVisible = tourState === 'active' || tourState === 'complete'

  return (
    <DemoTourContext.Provider value={{ replayTour }}>
      {children}
      {isTourVisible && (
        <DemoTour
          steps={TOUR_STEPS}
          currentStep={currentStep}
          isComplete={tourState === 'complete'}
          onNext={onNext}
          onBack={onBack}
          onComplete={onComplete}
          onSkip={onSkip}
        />
      )}
    </DemoTourContext.Provider>
  )
}
