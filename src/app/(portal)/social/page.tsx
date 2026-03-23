import type { Metadata } from 'next'
import { getSocialOverview } from '@/lib/data/social'
import SocialPage from './social-client'
import type { SocialPageData } from './social-client'

export const metadata: Metadata = { title: 'Social' }
export const revalidate = 300

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function SocialServerPage() {
  const { instagram, instagramTrend, hasData } = await getSocialOverview(14)

  if (!hasData || !instagram) return <SocialPage />

  // Compute follower gains from trend (diff between consecutive rows)
  const followerData = instagramTrend.map((row, i) => {
    const prev = instagramTrend[i - 1]
    const gained = prev ? Math.max(0, row.followers - prev.followers) : 0
    return { date: fmtDate(row.date), followers: row.followers, gained }
  })

  // Post performance from latest snapshot's top_posts
  const postPerformance = (instagram.top_posts ?? []).map((p) => ({
    label: p.caption.length > 20 ? p.caption.slice(0, 20) + '…' : p.caption,
    engagement: p.likes + p.comments + p.shares,
  }))

  // Summary: sum likes/comments/reach across all trend rows
  const totalLikes    = instagramTrend.reduce((a, r) => a + (r.top_posts ?? []).reduce((s, p) => s + p.likes, 0), 0)
  const totalComments = instagramTrend.reduce((a, r) => a + (r.top_posts ?? []).reduce((s, p) => s + p.comments, 0), 0)
  const totalReach    = instagramTrend.reduce((a, r) => a + r.reach, 0)

  const data: SocialPageData = {
    summary: {
      followers: instagram.followers,
      likes:     totalLikes,
      comments:  totalComments,
      reach:     totalReach,
    },
    followerData,
    postPerformance,
  }

  return <SocialPage data={data} />
}
