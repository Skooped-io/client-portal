import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'

export interface SocialSnapshot {
  date: string
  platform: 'instagram' | 'facebook'
  followers: number
  engagement_rate: number
  reach: number
  impressions: number
  posts_published: number
  top_posts: Array<{
    id: string
    caption: string
    likes: number
    comments: number
    shares: number
  }>
}

export interface SocialOverview {
  instagram: SocialSnapshot | null
  facebook: SocialSnapshot | null
  instagramTrend: SocialSnapshot[]
  facebookTrend: SocialSnapshot[]
  hasData: boolean
}

/**
 * Get latest social metrics for both platforms + trends.
 */
export async function getSocialOverview(days: number = 14): Promise<SocialOverview> {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId) {
    return { instagram: null, facebook: null, instagramTrend: [], facebookTrend: [], hasData: false }
  }

  const { data } = await supabase
    .from('social_metrics')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(days * 2) // Two platforms

  if (!data || data.length === 0) {
    return { instagram: null, facebook: null, instagramTrend: [], facebookTrend: [], hasData: false }
  }

  const rows = data as SocialSnapshot[]
  const igRows = rows.filter(r => r.platform === 'instagram')
  const fbRows = rows.filter(r => r.platform === 'facebook')

  return {
    instagram: igRows[0] ?? null,
    facebook: fbRows[0] ?? null,
    instagramTrend: igRows.reverse(),
    facebookTrend: fbRows.reverse(),
    hasData: true,
  }
}
