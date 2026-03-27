'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { motion } from 'framer-motion'
import { StepProgress } from './step-progress'
import { TemplatePickerStep } from './template-picker-step'
import { BusinessBasicsStep } from './business-basics-step'
import { LocationStep } from './location-step'
import { ServicesStep } from './services-step'
import { GoogleConnectStep } from './google-connect-step'
import { MetaConnectStep } from './meta-connect-step'
import { PlanSelectionStep } from './plan-selection-step'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { goBackAction } from '@/app/(onboarding)/onboarding/actions'
import type { BusinessProfile, OnboardingProgress, OauthConnection } from '@/lib/types'

// ===== Ice cream scoop step icon =====

function StepScoopIcon({ step }: { step: number }) {
  const colors = ['#D94A7A', '#E8C87A', '#4CAF50', '#5B8DEF', '#C99035']
  const color = colors[(step - 1) % colors.length]
  return (
    <motion.div
      initial={{ scale: 0, rotate: -20 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
      className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
      style={{ backgroundColor: `${color}18`, border: `1.5px solid ${color}30` }}
    >
      <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden="true">
        <ellipse cx="10" cy="9" rx="8" ry="7" fill={color} opacity={0.9} />
        <ellipse cx="8" cy="6" rx="2.5" ry="1.8" fill="white" opacity={0.3} />
        <polygon points="4,15 16,15 10,22" fill="#C99035" />
        <line x1="5" y1="17" x2="15" y2="17" stroke="#A07820" strokeWidth="0.8" opacity={0.5} />
      </svg>
    </motion.div>
  )
}

interface OnboardingWizardProps {
  currentStep: number
  totalSteps: number
  userId: string
  orgId: string
  progress: OnboardingProgress | null
  businessProfile: BusinessProfile | null
  googleConnection: OauthConnection | null
  metaConnection: OauthConnection | null
}

const STEP_CONFIG = [
  {
    title: 'Pick your starting template',
    description: 'Choose the industry template that best fits your business — or go custom.',
  },
  {
    title: "Let's get your business set up on Skooped",
    description: 'First, tell us the basics about your business.',
  },
  {
    title: 'Where are you located?',
    description: 'This helps us target your marketing to the right areas.',
  },
  {
    title: 'What do you offer?',
    description: 'Your services and description power your SEO and content.',
  },
  {
    title: 'Connect Google',
    description:
      'Connecting Google lets us track your search performance, manage your business listing, and run ads for you.',
  },
  {
    title: 'Connect Instagram & Facebook',
    description: 'Connect your social accounts so we can publish and track content for you.',
  },
  {
    title: 'Choose your plan',
    description: 'Select the plan that fits your goals. No charge until your website is approved.',
  },
]

export function OnboardingWizard({
  currentStep,
  totalSteps,
  progress,
  businessProfile,
  googleConnection,
  metaConnection,
}: OnboardingWizardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const stepConfig = STEP_CONFIG[currentStep - 1]
  const completedSteps = progress?.completed_steps ?? []

  function goBack() {
    if (currentStep > 1) {
      const prevStep = currentStep - 1
      startTransition(async () => {
        await goBackAction(prevStep)
        router.push(`/onboarding/step/${prevStep}`)
        router.refresh()
      })
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-strawberry flex items-center justify-center shadow-strawberry-glow">
              <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">
                <ellipse cx="7" cy="6" rx="5.5" ry="5" fill="white" opacity={0.9} />
                <polygon points="2,10 12,10 7,16" fill="#E8C87A" />
              </svg>
            </div>
            <span className="text-base font-nunito font-bold text-foreground">Skooped</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-strawberry" />
            <span className="text-sm text-muted-foreground font-dm-sans">
              Step {currentStep} of {totalSteps}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-6">
          {/* Progress */}
          <StepProgress
            currentStep={currentStep}
            totalSteps={totalSteps}
            completedSteps={completedSteps}
          />

          {/* Step Card */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
          <Card className="bg-card border-border rounded-xl overflow-hidden">
            {/* Ice cream gradient accent */}
            <div className="h-0.5 bg-gradient-to-r from-strawberry via-vanilla-500 to-mint" />
            <CardHeader className="pb-4">
              <StepScoopIcon step={currentStep} />
              <CardTitle className="text-xl font-nunito text-foreground">
                {stepConfig?.title}
              </CardTitle>
              {stepConfig?.description && (
                <CardDescription className="text-muted-foreground text-sm font-dm-sans">
                  {stepConfig.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {currentStep === 1 && (
                <TemplatePickerStep />
              )}
              {currentStep === 2 && (
                <BusinessBasicsStep businessProfile={businessProfile} />
              )}
              {currentStep === 3 && (
                <LocationStep businessProfile={businessProfile} onBack={goBack} />
              )}
              {currentStep === 4 && (
                <ServicesStep businessProfile={businessProfile} onBack={goBack} />
              )}
              {currentStep === 5 && (
                <GoogleConnectStep googleConnection={googleConnection} onBack={goBack} />
              )}
              {currentStep === 6 && (
                <MetaConnectStep metaConnection={metaConnection} onBack={goBack} />
              )}
              {currentStep === 7 && (
                <PlanSelectionStep businessProfile={businessProfile} onBack={goBack} />
              )}
            </CardContent>
          </Card>
          </motion.div>

          {/* Ice cream flavor tagline */}
          <p className="text-center text-xs text-muted-foreground">
            🍦 You&apos;re one scoop closer to growing your business
          </p>
        </div>
      </main>
    </div>
  )
}
