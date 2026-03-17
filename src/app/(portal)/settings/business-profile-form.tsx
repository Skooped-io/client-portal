"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { updateBusinessProfileAction } from "./actions"
import type { BusinessProfile } from "@/lib/types"

interface BusinessProfileFormProps {
  profile: BusinessProfile | null
}

export function BusinessProfileForm({ profile }: BusinessProfileFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)
    const result = await updateBusinessProfileAction(formData)

    if (result.success) {
      toast.success("Profile updated successfully!")
    } else {
      toast.error(result.error)
    }

    setIsSubmitting(false)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="bg-card border-border rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-nunito">Business Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="business_name" className="text-sm font-dm-sans text-foreground">
                Business Name <span className="text-strawberry">*</span>
              </Label>
              <Input
                id="business_name"
                name="business_name"
                defaultValue={profile?.business_name ?? ""}
                placeholder="Your business name"
                required
                className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry" className="text-sm font-dm-sans text-foreground">
                Industry
              </Label>
              <Input
                id="industry"
                name="industry"
                defaultValue={profile?.industry ?? ""}
                placeholder="e.g. Home Services, Retail"
                className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-dm-sans text-foreground">
              Business Description
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={profile?.description ?? ""}
              placeholder="Tell us about your business..."
              rows={4}
              className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-nunito">Contact Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-dm-sans text-foreground">
                Phone
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={profile?.phone ?? ""}
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
                defaultValue={profile?.email ?? ""}
                placeholder="hello@yourbusiness.com"
                className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website_url" className="text-sm font-dm-sans text-foreground">
              Website URL
            </Label>
            <Input
              id="website_url"
              name="website_url"
              type="url"
              defaultValue={profile?.website_url ?? ""}
              placeholder="https://yourbusiness.com"
              className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-nunito">Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city" className="text-sm font-dm-sans text-foreground">
                City
              </Label>
              <Input
                id="city"
                name="city"
                defaultValue={profile?.city ?? ""}
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
                defaultValue={profile?.state ?? ""}
                placeholder="TN"
                maxLength={2}
                className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto bg-strawberry hover:bg-strawberry/90 text-white rounded-xl px-6 min-h-[44px]"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  )
}
