"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/supabase/helpers"
import { businessProfileSchema } from "@/lib/schemas"
import type { ActionResult } from "@/lib/types"

export async function updateBusinessProfileAction(
  formData: FormData
): Promise<ActionResult> {
  const raw = {
    business_name: formData.get("business_name") as string,
    industry: (formData.get("industry") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    email: (formData.get("email") as string) || undefined,
    website_url: (formData.get("website_url") as string) || undefined,
    city: (formData.get("city") as string) || undefined,
    state: (formData.get("state") as string) || undefined,
    description: (formData.get("description") as string) || undefined,
  }

  const parsed = businessProfileSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0].message,
    }
  }

  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) {
    return { success: false, error: "No organization found for your account." }
  }

  const { error } = await supabase
    .from("business_profiles")
    .update(parsed.data)
    .eq("org_id", orgId)

  if (error) {
    console.error({ error })
    return { success: false, error: "Failed to update profile. Please try again." }
  }

  revalidatePath("/settings")
  return { success: true }
}
