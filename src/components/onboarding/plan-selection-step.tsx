'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Check, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { completeOnboardingAction } from '@/app/(onboarding)/onboarding/actions'
import type { BusinessProfile } from '@/lib/types'

type PlanName = 'Starter' | 'Growth' | 'Scale'

const PLANS: { id: PlanName; price: string; popular: boolean; features: string[] }[] = [
  {
    id: 'Starter',
    price: '$49/mo',
    popular: false,
    features: [
      'Custom website',
      'Basic SEO',
      'Google Business Profile',
      'Monthly report',
    ],
  },
  {
    id: 'Growth',
    price: '$99/mo',
    popular: true,
    features: [
      'Everything in Starter',
      'Social media management',
      'Google Ads',
      'Weekly reports',
      'Priority support',
    ],
  },
  {
    id: 'Scale',
    price: '$149/mo',
    popular: false,
    features: [
      'Everything in Growth',
      'Advanced SEO',
      'Content creation',
      'Call tracking',
      'Dedicated account manager',
    ],
  },
]

interface PlanSelectionStepProps {
  businessProfile: BusinessProfile | null
  onBack: () => void
}

export function PlanSelectionStep({ businessProfile, onBack }: PlanSelectionStepProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<PlanName>('Growth')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isConcierge = businessProfile?.template === 'concierge'

  async function onStartTrial() {
    setIsSubmitting(true)
    try {
      if (isConcierge) {
        await completeOnboardingAction()
        router.push('/dashboard')
        return
      }

      // Redirect to Stripe FIRST — complete onboarding on success callback
      // This prevents the dashboard from flashing before Stripe loads
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selected }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error((data as { error?: string }).error ?? 'Failed to start checkout')
      }

      const { url } = await res.json() as { url: string }
      if (url) {
        // Complete onboarding right before redirect so there's no flash
        await completeOnboardingAction()
        window.location.href = url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setIsSubmitting(false)
    }
  }

  if (isConcierge) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center text-center space-y-4 py-6">
          <div className="w-14 h-14 bg-strawberry/10 rounded-2xl flex items-center justify-center">
            <Crown className="w-7 h-7 text-strawberry" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-nunito font-bold text-foreground">
              Concierge Onboarding
            </h3>
            <p className="text-sm text-muted-foreground font-dm-sans max-w-sm">
              We&apos;ll reach out to set up a call with Jake to build your custom marketing
              strategy. No payment needed today.
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground rounded-xl min-h-[44px]"
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={onStartTrial}
            disabled={isSubmitting}
            className="w-full sm:w-auto bg-strawberry hover:bg-strawberry/90 text-white rounded-xl px-8 min-h-[44px]"
          >
            {isSubmitting ? 'Loading...' : 'Go to Dashboard'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isSelected = selected === plan.id
          return (
            <motion.button
              key={plan.id}
              type="button"
              onClick={() => setSelected(plan.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={[
                'relative flex flex-col items-start p-4 rounded-xl border text-left transition-colors',
                isSelected
                  ? 'border-strawberry bg-strawberry/5'
                  : 'border-border bg-background/60 hover:border-strawberry/50',
              ].join(' ')}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-xs bg-strawberry text-white px-3 py-0.5 rounded-full font-dm-sans font-medium whitespace-nowrap">
                    POPULAR
                  </span>
                </div>
              )}
              {isSelected && (
                <div className="absolute top-3 right-3 w-5 h-5 bg-strawberry rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <div className="space-y-0.5 mb-4 pr-6">
                <p className="font-nunito font-bold text-foreground">{plan.id}</p>
                <p className="text-xl font-nunito font-bold text-strawberry">{plan.price}</p>
              </div>
              <ul className="space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#4CAF50] shrink-0 mt-0.5" />
                    <span className="text-xs font-dm-sans text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.button>
          )
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground font-dm-sans">
        No charge until your website is approved — 14-day free trial included.
      </p>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground rounded-xl min-h-[44px]"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={onStartTrial}
          disabled={isSubmitting}
          className="w-full sm:w-auto bg-strawberry hover:bg-strawberry/90 text-white rounded-xl px-8 min-h-[44px]"
        >
          {isSubmitting ? 'Loading...' : 'Start Free Trial'}
        </Button>
      </div>
    </div>
  )
}
