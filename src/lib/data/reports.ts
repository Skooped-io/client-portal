import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export interface ReportRow {
  id: string
  report_type: 'weekly' | 'monthly'
  period_start: string
  period_end: string
  summary: string | null
  metrics: Record<string, unknown>
  highlights: Array<string | Record<string, unknown>>
  created_at: string
}

/**
 * Get reports for the current org.
 */
export async function getReports(limit: number = 12): Promise<{
  reports: ReportRow[]
  hasData: boolean
}> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) return { reports: [], hasData: false }

  const { data } = await supabase
    .from('reports')
    .select('*')
    .eq('org_id', orgId)
    .order('period_end', { ascending: false })
    .limit(limit)

  if (!data || data.length === 0) {
    return { reports: [], hasData: false }
  }

  return {
    reports: data as ReportRow[],
    hasData: true,
  }
}
