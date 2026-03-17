'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { saveStep3Action } from '@/app/(onboarding)/onboarding/actions'
import type { BusinessProfile } from '@/lib/types'

const COMMON_SERVICES = [
  'Fence Installation',
  'Fence Repair',
  'Landscaping',
  'Lawn Care',
  'HVAC',
  'Plumbing',
  'Electrical',
  'Roofing',
  'Painting',
  'Flooring',
  'Cleaning',
  'Pressure Washing',
  'Tree Service',
  'Pest Control',
  'Windows & Doors',
]

interface ServicesStepProps {
  businessProfile: BusinessProfile | null
  onBack: () => void
}

export function ServicesStep({ businessProfile, onBack }: ServicesStepProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [services, setServices] = useState<string[]>(businessProfile?.services ?? [])
  const [customInput, setCustomInput] = useState('')
  const [charCount, setCharCount] = useState(businessProfile?.description?.length ?? 0)

  function toggleService(service: string) {
    setServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    )
  }

  function addCustomService() {
    const trimmed = customInput.trim()
    if (trimmed && !services.includes(trimmed)) {
      setServices((prev) => [...prev, trimmed])
    }
    setCustomInput('')
  }

  function removeService(service: string) {
    setServices((prev) => prev.filter((s) => s !== service))
  }

  function onCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCustomService()
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)
    const result = await saveStep3Action({
      services,
      description: formData.get('description') as string || undefined,
    })

    if (result.success) {
      router.push('/onboarding/step/4')
    } else {
      toast.error(result.error)
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-3">
        <Label className="text-sm font-dm-sans text-foreground">
          What services do you offer?
        </Label>
        <div className="flex flex-wrap gap-2">
          {COMMON_SERVICES.map((service) => {
            const isSelected = services.includes(service)
            return (
              <button
                key={service}
                type="button"
                onClick={() => toggleService(service)}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-dm-sans font-medium transition-colors border',
                  isSelected
                    ? 'bg-strawberry text-white border-strawberry'
                    : 'bg-background text-muted-foreground border-border hover:border-strawberry hover:text-strawberry',
                ].join(' ')}
              >
                {service}
              </button>
            )
          })}
        </div>

        <div className="flex gap-2">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={onCustomKeyDown}
            placeholder="Add a custom service..."
            className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
          />
          <Button
            type="button"
            variant="outline"
            onClick={addCustomService}
            className="border-strawberry text-strawberry hover:bg-strawberry/10 rounded-xl shrink-0"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {services.some((s) => !COMMON_SERVICES.includes(s)) && (
          <div className="flex flex-wrap gap-2">
            {services
              .filter((s) => !COMMON_SERVICES.includes(s))
              .map((service) => (
                <Badge
                  key={service}
                  variant="secondary"
                  className="bg-vanilla/20 text-chocolate border-0 rounded-full px-3 py-1 font-dm-sans text-xs flex items-center gap-1"
                >
                  {service}
                  <button
                    type="button"
                    onClick={() => removeService(service)}
                    className="ml-1 hover:text-strawberry transition-colors"
                    aria-label={`Remove ${service}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="description" className="text-sm font-dm-sans text-foreground">
            Business Description
          </Label>
          <span className={`text-xs font-dm-sans ${charCount > 480 ? 'text-strawberry' : 'text-muted-foreground'}`}>
            {charCount}/500
          </span>
        </div>
        <Textarea
          id="description"
          name="description"
          defaultValue={businessProfile?.description ?? ''}
          placeholder="Tell us about your business — what you do, who you serve, what makes you different..."
          rows={4}
          maxLength={500}
          onChange={(e) => setCharCount(e.target.value.length)}
          className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry resize-none"
        />
      </div>

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
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto bg-strawberry hover:bg-strawberry/90 text-white rounded-xl px-8 min-h-[44px]"
        >
          {isSubmitting ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
