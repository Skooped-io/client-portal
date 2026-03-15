import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export default async function OnboardingRootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: progress } = await supabase
    .from('onboarding_progress')
    .select('current_step, is_complete')
    .eq('user_id', user.id)
    .single()

  if (progress?.is_complete) redirect('/dashboard')

  const step = progress?.current_step ?? 1
  redirect(`/onboarding/step/${step}`)
}
