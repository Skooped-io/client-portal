import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingComplete } from '@/components/onboarding/onboarding-complete'
import type { OauthConnection } from '@/lib/types'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export default async function OnboardingCompletePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const orgId = await getCurrentOrgId(supabase)
  if (!orgId) redirect('/login')

  const { data: oauthConnections } = await supabase
    .from('oauth_connections')
    .select('provider, provider_email, connected_services, status')
    .eq('org_id', orgId)

  const googleConnection = (oauthConnections?.find((c) => c.provider === 'google') ?? null) as OauthConnection | null
  const metaConnection = (oauthConnections?.find((c) => c.provider === 'meta') ?? null) as OauthConnection | null

  return (
    <OnboardingComplete
      googleConnection={googleConnection}
      metaConnection={metaConnection}
    />
  )
}
