'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveStep1Action } from '@/app/(onboarding)/onboarding/actions'
import { INDUSTRIES } from '@/lib/schemas'
import type { BusinessProfile } from '@/lib/types'

interface BusinessBasicsStepProps {
  businessProfile: BusinessProfile | null
}

export function BusinessBasicsStep({ businessProfile }: BusinessBasicsStepProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [industry, setIndustry] = useState(businessProfile?.industry ?? '')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)
    const result = await saveStep1Action({
      business_name: formData.get('business_name') as string,
      industry: industry || undefined,
      phone: formData.get('phone') as string || undefined,
      email: formData.get('email') as string || undefined,
      website_url: formData.get('website_url') as string || undefined,
    })

    if (result.success) {
      router.push('/onboarding/step/2')
    } else {
      toast.error(result.error)
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="business_name" className="text-sm font-dm-sans text-foreground">
            Business Name <span className="text-strawberry">*</span>
          </Label>
          <Input
            id="business_name"
            name="business_name"
            defaultValue={businessProfile?.business_name ?? ''}
            placeholder="Your business name"
            required
            className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="industry" className="text-sm font-dm-sans text-foreground">
            Industry
          </Label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger
              id="industry"
              className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20"
            >
              <SelectValue placeholder="Select your industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-dm-sans text-foreground">
            Phone
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={businessProfile?.phone ?? ''}
            placeholder="(615) 555-1234"
            className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-dm-sans text-foreground">
            Business Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={businessProfile?.email ?? ''}
            placeholder="hello@yourbusiness.com"
            className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="website_url" className="text-sm font-dm-sans text-foreground">
            Website URL
          </Label>
          <Input
            id="website_url"
            name="website_url"
            type="url"
            defaultValue={businessProfile?.website_url ?? ''}
            placeholder="https://yourbusiness.com"
            className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-strawberry hover:bg-strawberry/90 text-white rounded-xl px-8"
        >
          {isSubmitting ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
