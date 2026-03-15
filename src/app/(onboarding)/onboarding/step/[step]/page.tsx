import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'
import type { BusinessProfile, OnboardingProgress, OauthConnection } from '@/lib/types'

const TOTAL_STEPS = 5

interface OnboardingStepPageProps {
  params: Promise<{ step: string }>
}

export default async function OnboardingStepPage({ params }: OnboardingStepPageProps) {
  const { step: stepParam } = await params
  const step = parseInt(stepParam, 10)

  if (isNaN(step) || step < 1 || step > TOTAL_STEPS) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const orgId = await getCurrentOrgId(supabase)
  if (!orgId) redirect('/login')

  // Load or initialize onboarding progress
  let progress: OnboardingProgress | null = null
  const { data: existingProgress } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (existingProgress) {
    if (existingProgress.is_complete) redirect('/dashboard')
    progress = existingProgress
  }

  // Load existing business profile for pre-fill
  const { data: businessProfile } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('org_id', orgId)
    .single()

  // Load OAuth connections
  const { data: oauthConnections } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('org_id', orgId)

  const googleConnection = oauthConnections?.find((c) => c.provider === 'google') ?? null
  const metaConnection = oauthConnections?.find((c) => c.provider === 'meta') ?? null

  return (
    <OnboardingWizard
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      userId={user.id}
      orgId={orgId}
      progress={progress}
      businessProfile={businessProfile as BusinessProfile | null}
      googleConnection={googleConnection as OauthConnection | null}
      metaConnection={metaConnection as OauthConnection | null}
    />
  )
}
