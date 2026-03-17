'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, Search, Building2, BarChart2, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { skipStepAction } from '@/app/(onboarding)/onboarding/actions'
import type { OauthConnection } from '@/lib/types'

interface GoogleConnectStepProps {
  googleConnection: OauthConnection | null
  onBack: () => void
}

const GOOGLE_SERVICES = [
  {
    key: 'search_console',
    label: 'Search Console',
    description: 'Track search rankings and keywords',
    icon: Search,
  },
  {
    key: 'business_profile',
    label: 'Business Profile',
    description: 'Manage your Google Business listing',
    icon: Building2,
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Monitor website traffic and conversions',
    icon: BarChart2,
  },
  {
    key: 'ads',
    label: 'Google Ads',
    description: 'Run and track paid search campaigns',
    icon: Megaphone,
  },
]

export function GoogleConnectStep({ googleConnection, onBack }: GoogleConnectStepProps) {
  const router = useRouter()
  const [isSkipping, setIsSkipping] = useState(false)
  const isConnected = googleConnection?.status === 'active'

  async function onSkip() {
    setIsSkipping(true)
    await skipStepAction(4)
    router.push('/onboarding/step/5')
  }

  function onConnect() {
    window.location.href = '/api/oauth/google/authorize?redirect=/onboarding/step/4'
  }

  function onContinue() {
    router.push('/onboarding/step/5')
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {GOOGLE_SERVICES.map(({ key, label, description, icon: Icon }) => {
          const isServiceConnected = isConnected &&
            googleConnection?.connected_services?.includes(key as 'search_console' | 'business_profile' | 'analytics' | 'ads')

          return (
            <div
              key={key}
              className="flex items-start gap-3 p-3 rounded-xl bg-background/60"
            >
              <div className="p-2 bg-vanilla/20 rounded-lg shrink-0">
                <Icon className="w-4 h-4 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-dm-sans font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              {isServiceConnected ? (
                <CheckCircle2 className="w-5 h-5 text-[#4CAF50] shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-border shrink-0 mt-0.5" />
              )}
            </div>
          )
        })}
      </div>

      {isConnected && googleConnection?.provider_email && (
        <div className="p-3 bg-[#4CAF50]/10 border border-[#4CAF50]/20 rounded-xl">
          <p className="text-sm font-dm-sans text-foreground">
            <span className="font-medium">Connected:</span> {googleConnection.provider_email}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {isConnected ? (
          <Button
            type="button"
            onClick={onContinue}
            className="w-full bg-strawberry hover:bg-strawberry/90 text-white rounded-xl min-h-[44px]"
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onConnect}
            className="w-full bg-strawberry hover:bg-strawberry/90 text-white rounded-xl flex items-center justify-center gap-2 min-h-[44px]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Connect Google Account
          </Button>
        )}

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground rounded-xl min-h-[44px]"
          >
            Back
          </Button>
          {!isConnected && (
            <button
              type="button"
              onClick={onSkip}
              disabled={isSkipping}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors disabled:opacity-50 min-h-[44px] px-2"
            >
              {isSkipping ? 'Skipping...' : 'Skip for now'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
