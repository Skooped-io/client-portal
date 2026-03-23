import { NextRequest, NextResponse } from 'next/server'
import { portal } from '@/lib/logger'
import { verifyServiceApiKey, getDecryptedOauthToken } from '@/lib/agents/auth'

interface FacebookPost {
  id: string
  message?: string
  createdTime: string
  likeCount: number
  commentCount: number
  shareCount: number
  reach?: number
}

interface FacebookPageInsights {
  pageLikes: number
  pageFollowers: number
  reach: number
  impressions: number
  engagement: number
}

interface FacebookResponse {
  pageId?: string
  pageName?: string
  insights: FacebookPageInsights
  recentPosts: FacebookPost[]
}

interface AgentParams {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/agents/[orgId]/meta/facebook
 *
 * Returns Facebook page insights and recent posts.
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

  // TODO: Implement Facebook Graph API calls
  // const pageId = tokenData.connection.metadata?.selected_page_id
  // GET /{page-id}?fields=id,name,fan_count,followers_count&access_token=...
  // GET /{page-id}/posts?fields=id,message,created_time,likes.summary(true),comments.summary(true),shares&access_token=...
  // GET /{page-id}/insights?metric=page_impressions,page_reach,page_engaged_users&period=day&access_token=...

  try {
    // TODO: Implement Facebook Graph API calls
    const stub: FacebookResponse = {
      pageId: undefined,
      pageName: undefined,
      insights: {
        pageLikes: 0,
        pageFollowers: 0,
        reach: 0,
        impressions: 0,
        engagement: 0,
      },
      recentPosts: [],
    }

    portal.api('GET', 'agents.meta.facebook', 200, 0)
    return NextResponse.json({ data: stub, orgId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    portal.error('agents.meta.facebook', message)
    return NextResponse.json({ error: 'Facebook API error' }, { status: 500 })
  }
}
