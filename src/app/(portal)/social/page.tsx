import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import SocialPage from './social-client'

export const metadata: Metadata = { title: 'Social' }
export const revalidate = 300

export default async function SocialServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <SocialPage />

  const { data: rows } = await supabase
    .from('social_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(28)

  // TODO: Add data prop to social-client.tsx
  return <SocialPage />
}
