'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveStep2Action } from '@/app/(onboarding)/onboarding/actions'
import type { BusinessProfile } from '@/lib/types'

interface LocationStepProps {
  businessProfile: BusinessProfile | null
  onBack: () => void
}

export function LocationStep({ businessProfile, onBack }: LocationStepProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serviceAreas, setServiceAreas] = useState<string[]>(
    businessProfile?.service_areas ?? []
  )
  const [areaInput, setAreaInput] = useState('')

  function addArea() {
    const trimmed = areaInput.trim()
    if (trimmed && !serviceAreas.includes(trimmed)) {
      setServiceAreas((prev) => [...prev, trimmed])
    }
    setAreaInput('')
  }

  function removeArea(area: string) {
    setServiceAreas((prev) => prev.filter((a) => a !== area))
  }

  function onAreaKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addArea()
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)
    const result = await saveStep2Action({
      street_address: formData.get('street_address') as string || undefined,
      city: formData.get('city') as string || undefined,
      state: formData.get('state') as string || undefined,
      zip: formData.get('zip') as string || undefined,
      service_areas: serviceAreas,
    })

    if (result.success) {
      router.push('/onboarding/step/3')
    } else {
      toast.error(result.error)
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="street_address" className="text-sm font-dm-sans text-foreground">
          Street Address
        </Label>
        <Input
          id="street_address"
          name="street_address"
          defaultValue=""
          placeholder="123 Main St"
          className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="city" className="text-sm font-dm-sans text-foreground">
            City
          </Label>
          <Input
            id="city"
            name="city"
            defaultValue={businessProfile?.city ?? ''}
            placeholder="Franklin"
            className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="state" className="text-sm font-dm-sans text-foreground">
            State
          </Label>
          <Input
            id="state"
            name="state"
            defaultValue={businessProfile?.state ?? ''}
            placeholder="TN"
            maxLength={2}
            className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="zip" className="text-sm font-dm-sans text-foreground">
            ZIP Code
          </Label>
          <Input
            id="zip"
            name="zip"
            defaultValue=""
            placeholder="37064"
            maxLength={10}
            className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-dm-sans text-foreground">
          Service Areas
        </Label>
        <p className="text-xs text-muted-foreground">
          Add cities or regions where you serve customers.
        </p>
        <div className="flex gap-2">
          <Input
            value={areaInput}
            onChange={(e) => setAreaInput(e.target.value)}
            onKeyDown={onAreaKeyDown}
            placeholder="e.g. Nashville, Brentwood"
            className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
          />
          <Button
            type="button"
            variant="outline"
            onClick={addArea}
            className="border-strawberry text-strawberry hover:bg-strawberry/10 rounded-xl shrink-0"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {serviceAreas.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {serviceAreas.map((area) => (
              <Badge
                key={area}
                variant="secondary"
                className="bg-vanilla/20 text-chocolate border-0 rounded-full px-3 py-1 font-dm-sans text-xs flex items-center gap-1"
              >
                {area}
                <button
                  type="button"
                  onClick={() => removeArea(area)}
                  className="ml-1 hover:text-strawberry transition-colors"
                  aria-label={`Remove ${area}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
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
