'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { completeOnboardingAction } from '@/app/(onboarding)/onboarding/actions'
import type { OauthConnection } from '@/lib/types'

interface OnboardingCompleteProps {
  googleConnection: OauthConnection | null
  metaConnection: OauthConnection | null
}

export function OnboardingComplete({ googleConnection, metaConnection }: OnboardingCompleteProps) {
  const router = useRouter()
  const [isFinishing, setIsFinishing] = useState(false)

  async function onGoToDashboard() {
    setIsFinishing(true)
    await completeOnboardingAction()
    router.push('/dashboard')
  }

  const completedItems = [
    'Business profile saved',
    'Location and service areas set',
    'Services and description added',
    googleConnection?.status === 'active' ? `Google connected (${googleConnection.provider_email ?? ''})` : null,
    metaConnection?.status === 'active' ? `Meta connected (${metaConnection.provider_email ?? ''})` : null,
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col items-center text-center space-y-8 py-8">
      <div className="p-5 bg-[#4CAF50]/10 rounded-full">
        <CheckCircle2 className="w-12 h-12 text-[#4CAF50]" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-nunito font-bold text-foreground">
          You&apos;re all set!
        </h2>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Your business is set up on Skooped. We&apos;ll start working behind the scenes right away.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-2 text-left">
        {completedItems.map((item) => (
          <div key={item} className="flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-[#4CAF50] shrink-0" />
            <span className="text-sm font-dm-sans text-foreground">{item}</span>
          </div>
        ))}
      </div>

      <Button
        onClick={onGoToDashboard}
        disabled={isFinishing}
        className="bg-strawberry hover:bg-strawberry/90 text-white rounded-xl px-8 flex items-center gap-2"
      >
        {isFinishing ? 'Loading...' : 'Go to Dashboard'}
        {!isFinishing && <ArrowRight className="w-4 h-4" />}
      </Button>
    </div>
  )
}
