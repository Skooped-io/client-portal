'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signupSchema } from '@/lib/schemas'
import type { ActionResult } from '@/lib/types'

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const raw = {
    full_name: formData.get('full_name') as string,
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  if (data.user) {
    // Use admin client to bypass RLS for initial setup
    const admin = createAdminClient()

    // 1. Create profile
    const { error: profileError } = await admin
      .from('profiles')
      .insert({ id: data.user.id, full_name: parsed.data.full_name })

    if (profileError) {
      console.error('Profile creation failed:', profileError)
    }

    // 2. Create organization (use name from email or full name)
    const orgSlug = parsed.data.email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .insert({
        name: parsed.data.full_name + "'s Business",
        slug: orgSlug + '-' + Date.now().toString(36),
        owner_id: data.user.id,
        plan: 'starter',
        status: 'active',
      })
      .select('id')
      .single()

    if (orgError) {
      console.error('Org creation failed:', orgError)
      return { success: true } // still let them in, onboarding can handle it
    }

    // 3. Create org membership
    const { error: memberError } = await admin
      .from('organization_members')
      .insert({
        org_id: org.id,
        user_id: data.user.id,
        role: 'owner',
      })

    if (memberError) {
      console.error('Membership creation failed:', memberError)
    }

    // 4. Create onboarding progress
    const { error: onboardingError } = await admin
      .from('onboarding_progress')
      .insert({
        user_id: data.user.id,
        org_id: org.id,
        current_step: 1,
        completed_steps: [],
        is_complete: false,
      })

    if (onboardingError) {
      console.error('Onboarding init failed:', onboardingError)
    }
  }

  return { success: true }
}
