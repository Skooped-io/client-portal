'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Home,
  TreePine,
  Fence,
  Heart,
  Hammer,
  Car,
  Brain,
  Building2,
  Dumbbell,
  Scissors,
  Wrench,
  Zap,
  Check,
  Sparkles,
  Crown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveTemplateAction } from '@/app/(onboarding)/onboarding/actions'

const TEMPLATES = [
  { id: 'roofing', label: 'Roofing', icon: Home, industry: 'Home Services' },
  { id: 'landscaping', label: 'Landscaping', icon: TreePine, industry: 'Home Services' },
  { id: 'fencing', label: 'Fencing', icon: Fence, industry: 'Home Services' },
  { id: 'therapy', label: 'Therapy', icon: Heart, industry: 'Healthcare' },
  { id: 'construction', label: 'Construction', icon: Hammer, industry: 'Construction' },
  { id: 'auto-repair', label: 'Auto Repair', icon: Car, industry: 'Automotive' },
  { id: 'life-coaching', label: 'Life Coaching', icon: Brain, industry: 'Fitness & Wellness' },
  { id: 'real-estate', label: 'Real Estate', icon: Building2, industry: 'Real Estate' },
  { id: 'personal-training', label: 'Personal Training', icon: Dumbbell, industry: 'Fitness & Wellness' },
  { id: 'salon-barber', label: 'Salon/Barber', icon: Scissors, industry: 'Beauty & Personal Care' },
  { id: 'plumbing', label: 'Plumbing', icon: Wrench, industry: 'Home Services' },
  { id: 'electrical', label: 'Electrical', icon: Zap, industry: 'Home Services' },
] as const

export function TemplatePickerStep() {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onContinue() {
    if (!selected) {
      toast.error('Please select a template to continue')
      return
    }
    setIsSubmitting(true)
    const template = TEMPLATES.find((t) => t.id === selected)
    const result = await saveTemplateAction({
      template: selected,
      industry: template?.industry,
    })
    if (result.success) {
      router.push('/onboarding/step/2')
    } else {
      toast.error(result.error)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {TEMPLATES.map(({ id, label, icon: Icon }) => {
          const isSelected = selected === id
          return (
            <motion.button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={[
                'relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors min-h-[80px]',
                isSelected
                  ? 'border-strawberry bg-strawberry/5'
                  : 'border-border bg-background/60 hover:border-strawberry/50',
              ].join(' ')}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-strawberry rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <div
                className={[
                  'w-9 h-9 rounded-xl flex items-center justify-center',
                  isSelected ? 'bg-strawberry/10' : 'bg-muted',
                ].join(' ')}
              >
                <Icon
                  className={[
                    'w-4 h-4',
                    isSelected ? 'text-strawberry' : 'text-muted-foreground',
                  ].join(' ')}
                />
              </div>
              <span className="text-xs font-dm-sans font-medium text-center leading-tight">
                {label}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* Custom Build with Cooper */}
      <motion.button
        type="button"
        onClick={() => setSelected('custom-cooper')}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
        className={[
          'w-full flex items-start gap-4 p-4 rounded-xl border transition-colors text-left',
          selected === 'custom-cooper'
            ? 'border-strawberry bg-strawberry/5'
            : 'border-border bg-background/60 hover:border-strawberry/50',
        ].join(' ')}
      >
        <div
          className={[
            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
            selected === 'custom-cooper' ? 'bg-strawberry/10' : 'bg-muted',
          ].join(' ')}
        >
          <Sparkles
            className={[
              'w-4 h-4',
              selected === 'custom-cooper' ? 'text-strawberry' : 'text-muted-foreground',
            ].join(' ')}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-nunito font-bold text-sm text-foreground">
              Custom Build with Cooper
            </span>
            <span className="text-xs bg-vanilla/30 text-chocolate px-2 py-0.5 rounded-full font-dm-sans font-medium">
              $299 one-time
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-dm-sans mt-0.5">
            Work 1-on-1 with Cooper to build a fully custom marketing strategy tailored to your
            business.
          </p>
        </div>
        {selected === 'custom-cooper' && (
          <div className="w-4 h-4 bg-strawberry rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </motion.button>

      {/* Build with Cooper + Jake (Concierge) */}
      <motion.button
        type="button"
        onClick={() => setSelected('concierge')}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
        className={[
          'w-full flex items-start gap-4 p-4 rounded-xl border transition-colors text-left',
          selected === 'concierge'
            ? 'border-strawberry bg-strawberry/5'
            : 'border-border bg-background/60 hover:border-strawberry/50',
        ].join(' ')}
      >
        <div
          className={[
            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
            selected === 'concierge' ? 'bg-strawberry/10' : 'bg-muted',
          ].join(' ')}
        >
          <Crown
            className={[
              'w-4 h-4',
              selected === 'concierge' ? 'text-strawberry' : 'text-muted-foreground',
            ].join(' ')}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-nunito font-bold text-sm text-foreground">
              Build with Cooper + Jake
            </span>
            <span className="text-xs bg-strawberry/10 text-strawberry px-2 py-0.5 rounded-full font-dm-sans font-medium border border-strawberry/20">
              Concierge
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-dm-sans mt-0.5">
            Full white-glove service. Custom strategy, setup, and ongoing management from our
            expert team. Pricing on request.
          </p>
        </div>
        {selected === 'concierge' && (
          <div className="w-4 h-4 bg-strawberry rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </motion.button>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          onClick={onContinue}
          disabled={isSubmitting || !selected}
          className="w-full sm:w-auto bg-strawberry hover:bg-strawberry/90 text-white rounded-xl px-8 min-h-[44px]"
        >
          {isSubmitting ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
