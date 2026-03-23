import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import ReportsPage from './reports-client'

export const metadata: Metadata = { title: 'Reports' }
export const revalidate = 300

export default async function ReportsServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <ReportsPage />

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('org_id', orgId)
    .order('period_end', { ascending: false })
    .limit(12)

  // TODO: pass reports as prop when reports-client.tsx accepts it
  return <ReportsPage />
}
