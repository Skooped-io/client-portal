import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import AnalyticsPage from './analytics-client'

export const metadata: Metadata = { title: 'Analytics' }
export const revalidate = 300

export default async function AnalyticsServerPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return <AnalyticsPage />

  const { data: rows } = await supabase
    .from('analytics_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(30)

  if (!rows || rows.length === 0) return <AnalyticsPage />

  const latest = rows[0]

  // Pass as window-level data that the client component can pick up
  // For now, the client component uses its own demo data
  // TODO: Add data prop to analytics-client.tsx matching this shape
  return <AnalyticsPage />
}
