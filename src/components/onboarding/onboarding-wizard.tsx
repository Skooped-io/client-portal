'use client'

import { useRouter } from 'next/navigation'
import { StepProgress } from './step-progress'
import { BusinessBasicsStep } from './business-basics-step'
import { LocationStep } from './location-step'
import { ServicesStep } from './services-step'
import { GoogleConnectStep } from './google-connect-step'
import { MetaConnectStep } from './meta-connect-step'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { BusinessProfile, OnboardingProgress, OauthConnection } from '@/lib/types'

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
  const stepConfig = STEP_CONFIG[currentStep - 1]
  const completedSteps = progress?.completed_steps ?? []

  function goBack() {
    if (currentStep > 1) {
      router.push(`/onboarding/step/${currentStep - 1}`)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="text-lg font-nunito font-bold text-foreground">Skooped</span>
          <span className="text-sm text-muted-foreground font-dm-sans">
            Step {currentStep} of {totalSteps}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-8">
          {/* Progress */}
          <StepProgress
            currentStep={currentStep}
            totalSteps={totalSteps}
            completedSteps={completedSteps}
          />

          {/* Step Card */}
          <Card className="bg-card border-border rounded-xl">
            <CardHeader className="pb-4">
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
                <BusinessBasicsStep businessProfile={businessProfile} />
              )}
              {currentStep === 2 && (
                <LocationStep businessProfile={businessProfile} onBack={goBack} />
              )}
              {currentStep === 3 && (
                <ServicesStep businessProfile={businessProfile} onBack={goBack} />
              )}
              {currentStep === 4 && (
                <GoogleConnectStep googleConnection={googleConnection} onBack={goBack} />
              )}
              {currentStep === 5 && (
                <MetaConnectStep metaConnection={metaConnection} onBack={goBack} />
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
