import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import SocialPage from './social-client'
import type { SocialPageData } from './social-client'

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

  if (!rows || rows.length === 0) return <SocialPage />

  const igRows = rows.filter(r => r.platform === 'instagram')
  const latest = igRows[0]
  const trend = [...igRows].reverse()

  const totalReach = igRows.reduce((sum, r) => sum + (r.reach ?? 0), 0)
  const topPosts = (latest?.top_posts as Array<{ caption?: string; likes?: number; comments?: number }>) ?? []

  const data: SocialPageData = {
    summary: {
      followers: latest?.followers ?? 0,
      likes: topPosts.reduce((sum, p) => sum + (p.likes ?? 0), 0),
      comments: topPosts.reduce((sum, p) => sum + (p.comments ?? 0), 0),
      reach: totalReach,
    },
    followerData: trend.map(r => ({
      date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      followers: r.followers ?? 0,
      gained: 0, // TODO: calculate delta from previous day
    })),
    postPerformance: topPosts.slice(0, 5).map((p, i) => ({
      label: (p.caption ?? `Post ${i + 1}`).slice(0, 30),
      engagement: (p.likes ?? 0) + (p.comments ?? 0),
    })),
  }

  return <SocialPage data={data} />
}
