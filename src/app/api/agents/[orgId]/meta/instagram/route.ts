import { NextRequest, NextResponse } from 'next/server'
import { portal } from '@/lib/logger'
import { verifyServiceApiKey, getDecryptedOauthToken } from '@/lib/agents/auth'

interface InstagramPost {
  id: string
  caption?: string
  mediaType: string
  timestamp: string
  likeCount: number
  commentsCount: number
  reach?: number
  impressions?: number
}

interface InstagramInsights {
  followerCount: number
  reach: number
  impressions: number
  profileViews: number
}

interface InstagramResponse {
  accountId?: string
  username?: string
  insights: InstagramInsights
  recentPosts: InstagramPost[]
}

interface AgentParams {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/agents/[orgId]/meta/instagram
 *
 * Returns Instagram account insights and recent posts.
 * Used by Sierra agent for social content management.
 */
export async function GET(request: NextRequest, { params }: AgentParams) {
  if (!verifyServiceApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await params

  const tokenData = await getDecryptedOauthToken(orgId, 'meta')
  if (!tokenData) {
    return NextResponse.json({ error: 'No active Meta connection for this org' }, { status: 404 })
  }

  // TODO: Implement Instagram Graph API calls
  // const igAccountId = tokenData.connection.metadata?.instagram_account_id
  // GET /{ig-user-id}?fields=id,username,followers_count,media_count&access_token=...
  // GET /{ig-user-id}/media?fields=id,caption,media_type,timestamp,like_count,comments_count&access_token=...
  // GET /{ig-user-id}/insights?metric=reach,impressions,profile_views&period=day&access_token=...

  try {
    // TODO: Implement Instagram Graph API calls
    const stub: InstagramResponse = {
      accountId: undefined,
      username: undefined,
      insights: {
        followerCount: 0,
        reach: 0,
        impressions: 0,
        profileViews: 0,
      },
      recentPosts: [],
    }

    portal.api('GET', 'agents.meta.instagram', 200, 0)
    return NextResponse.json({ data: stub, orgId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    portal.error('agents.meta.instagram', message)
    return NextResponse.json({ error: 'Instagram API error' }, { status: 500 })
  }
}
