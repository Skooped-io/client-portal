'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import {
  onboardingStep1Schema,
  onboardingStep2Schema,
  onboardingStep3Schema,
  type OnboardingStep1Data,
  type OnboardingStep2Data,
  type OnboardingStep3Data,
} from '@/lib/schemas'
import type { ActionResult } from '@/lib/types'

const TOTAL_STEPS = 5

// ─────────────────────────────────────────────
// Initialize or load onboarding progress
// ─────────────────────────────────────────────
export async function initOnboardingProgress(): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const orgId = await getCurrentOrgId(supabase)
    if (!orgId) return { success: false, error: 'No organization found' }

    const { data: existing } = await supabase
      .from('onboarding_progress')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!existing) {
      const { error } = await supabase.from('onboarding_progress').insert({
        user_id: user.id,
        org_id: orgId,
        current_step: 1,
        completed_steps: [],
        is_complete: false,
      })

      if (error) {
        console.error({ error })
        return { success: false, error: 'Failed to initialize onboarding' }
      }
    }

    return { success: true }
  } catch (err) {
    console.error({ err })
    return { success: false, error: 'Something went wrong' }
  }
}

// ─────────────────────────────────────────────
// Save step progress and advance
// ─────────────────────────────────────────────
async function advanceStep(userId: string, completedStep: number): Promise<void> {
  const supabase = await createClient()
  const nextStep = completedStep + 1

  const { data: current } = await supabase
    .from('onboarding_progress')
    .select('completed_steps')
    .eq('user_id', userId)
    .single()

  const completedSteps = Array.from(
    new Set([...(current?.completed_steps ?? []), completedStep])
  )

  await supabase
    .from('onboarding_progress')
    .update({
      current_step: nextStep,
      completed_steps: completedSteps,
    })
    .eq('user_id', userId)
}

// ─────────────────────────────────────────────
// Step 1: Business Basics
// ─────────────────────────────────────────────
export async function saveStep1Action(data: OnboardingStep1Data): Promise<ActionResult> {
  try {
    const parsed = onboardingStep1Schema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const orgId = await getCurrentOrgId(supabase)
    if (!orgId) return { success: false, error: 'No organization found' }

    const { data: existing } = await supabase
      .from('business_profiles')
      .select('org_id')
      .eq('org_id', orgId)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('business_profiles')
        .update({
          business_name: parsed.data.business_name,
          industry: parsed.data.industry ?? null,
          phone: parsed.data.phone ?? null,
          email: parsed.data.email || null,
          website_url: parsed.data.website_url || null,
        })
        .eq('org_id', orgId)

      if (error) {
        console.error({ error })
        return { success: false, error: 'Failed to save business info' }
      }
    } else {
      const { error } = await supabase.from('business_profiles').insert({
        org_id: orgId,
        business_name: parsed.data.business_name,
        industry: parsed.data.industry ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email || null,
        website_url: parsed.data.website_url || null,
      })

      if (error) {
        console.error({ error })
        return { success: false, error: 'Failed to save business info' }
      }
    }

    await advanceStep(user.id, 1)
    revalidatePath('/onboarding/step/2')
    return { success: true }
  } catch (err) {
    console.error({ err })
    return { success: false, error: 'Something went wrong' }
  }
}

// ─────────────────────────────────────────────
// Step 2: Location & Service Areas
// ─────────────────────────────────────────────
export async function saveStep2Action(data: OnboardingStep2Data): Promise<ActionResult> {
  try {
    const parsed = onboardingStep2Schema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const orgId = await getCurrentOrgId(supabase)
    if (!orgId) return { success: false, error: 'No organization found' }

    const { error } = await supabase
      .from('business_profiles')
      .update({
        city: parsed.data.city ?? null,
        state: parsed.data.state ?? null,
        service_areas: parsed.data.service_areas,
      })
      .eq('org_id', orgId)

    if (error) {
      console.error({ error })
      return { success: false, error: 'Failed to save location info' }
    }

    await advanceStep(user.id, 2)
    revalidatePath('/onboarding/step/3')
    return { success: true }
  } catch (err) {
    console.error({ err })
    return { success: false, error: 'Something went wrong' }
  }
}

// ─────────────────────────────────────────────
// Step 3: Services & Description
// ─────────────────────────────────────────────
export async function saveStep3Action(data: OnboardingStep3Data): Promise<ActionResult> {
  try {
    const parsed = onboardingStep3Schema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const orgId = await getCurrentOrgId(supabase)
    if (!orgId) return { success: false, error: 'No organization found' }

    const { error } = await supabase
      .from('business_profiles')
      .update({
        services: parsed.data.services,
        description: parsed.data.description ?? null,
      })
      .eq('org_id', orgId)

    if (error) {
      console.error({ error })
      return { success: false, error: 'Failed to save services info' }
    }

    await advanceStep(user.id, 3)
    revalidatePath('/onboarding/step/4')
    return { success: true }
  } catch (err) {
    console.error({ err })
    return { success: false, error: 'Something went wrong' }
  }
}

// ─────────────────────────────────────────────
// Skip a step (OAuth steps 4 and 5)
// ─────────────────────────────────────────────
export async function skipStepAction(step: number): Promise<ActionResult> {
  try {
    if (step < 4 || step > 5) {
      return { success: false, error: 'Only OAuth steps can be skipped' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    await advanceStep(user.id, step)
    return { success: true }
  } catch (err) {
    console.error({ err })
    return { success: false, error: 'Something went wrong' }
  }
}

// ─────────────────────────────────────────────
// Mark onboarding as complete
// ─────────────────────────────────────────────
export async function completeOnboardingAction(): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: current } = await supabase
      .from('onboarding_progress')
      .select('completed_steps')
      .eq('user_id', user.id)
      .single()

    const allSteps = [1, 2, 3, 4, 5]
    const completedSteps = Array.from(
      new Set([...(current?.completed_steps ?? []), ...allSteps])
    )

    const { error } = await supabase
      .from('onboarding_progress')
      .update({
        is_complete: true,
        current_step: TOTAL_STEPS,
        completed_steps: completedSteps,
      })
      .eq('user_id', user.id)

    if (error) {
      console.error({ error })
      return { success: false, error: 'Failed to complete onboarding' }
    }

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error({ err })
    return { success: false, error: 'Something went wrong' }
  }
}

// ─────────────────────────────────────────────
// Go back to a previous step
// ─────────────────────────────────────────────
export async function goBackAction(targetStep: number): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { error } = await supabase
      .from('onboarding_progress')
      .update({ current_step: targetStep })
      .eq('user_id', user.id)

    if (error) {
      console.error({ error })
      return { success: false, error: 'Failed to navigate back' }
    }

    return { success: true }
  } catch (err) {
    console.error({ err })
    return { success: false, error: 'Something went wrong' }
  }
}
