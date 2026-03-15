import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/supabase/helpers"
import { BusinessProfileForm } from "./business-profile-form"
import type { BusinessProfile } from "@/lib/types"

export default async function SettingsPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  let profile: BusinessProfile | null = null

  if (orgId) {
    const { data } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("org_id", orgId)
      .single()

    profile = data
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-nunito font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your business profile — this information powers your marketing.
        </p>
      </div>

      <BusinessProfileForm profile={profile} />
    </div>
  )
}
