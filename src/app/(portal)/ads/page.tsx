import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import AdsPage from './ads-client'

export const metadata: Metadata = { title: 'Ads' }
export const revalidate = 300

export default async function AdsServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <AdsPage />

  const { data: rows } = await supabase
    .from('ads_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(30)

  // TODO: Add data prop to ads-client.tsx
  return <AdsPage />
}
