'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, Instagram, Facebook } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { skipStepAction } from '@/app/(onboarding)/onboarding/actions'
import type { OauthConnection } from '@/lib/types'

interface MetaConnectStepProps {
  metaConnection: OauthConnection | null
  onBack: () => void
}

const META_SERVICES = [
  {
    key: 'instagram',
    label: 'Instagram',
    description: 'Publish posts and track engagement',
    icon: Instagram,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    description: 'Manage your Facebook page and insights',
    icon: Facebook,
  },
]

export function MetaConnectStep({ metaConnection, onBack }: MetaConnectStepProps) {
  const router = useRouter()
  const [isSkipping, setIsSkipping] = useState(false)
  const isConnected = metaConnection?.status === 'active'

  async function onSkip() {
    setIsSkipping(true)
    await skipStepAction(5)
    router.push('/onboarding/complete')
  }

  function onConnect() {
    window.location.href = '/api/oauth/meta/authorize?redirect=/onboarding/step/5'
  }

  function onContinue() {
    router.push('/onboarding/complete')
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {META_SERVICES.map(({ key, label, description, icon: Icon }) => {
          const isServiceConnected = isConnected &&
            metaConnection?.connected_services?.includes(key as 'instagram' | 'facebook')

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

      {isConnected && metaConnection?.provider_email && (
        <div className="p-3 bg-[#4CAF50]/10 border border-[#4CAF50]/20 rounded-xl">
          <p className="text-sm font-dm-sans text-foreground">
            <span className="font-medium">Connected:</span> {metaConnection.provider_email}
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        You can always connect Instagram and Facebook later from your dashboard settings.
      </p>

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
            <Facebook className="w-4 h-4" />
            Connect Instagram & Facebook
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
