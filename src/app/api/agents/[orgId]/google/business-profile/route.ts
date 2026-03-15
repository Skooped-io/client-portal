import { NextRequest, NextResponse } from 'next/server'
import { verifyServiceApiKey, getDecryptedOauthToken } from '@/lib/agents/auth'

interface GbpReview {
  reviewId: string
  reviewer: { displayName: string }
  starRating: string
  comment?: string
  createTime: string
  reviewReply?: { comment: string; updateTime: string }
}

interface GbpLocation {
  name: string
  title: string
  phoneNumbers?: { primaryPhone: string }
  websiteUri?: string
}

interface BusinessProfileResponse {
  location: GbpLocation | null
  reviews: GbpReview[]
  totalReviewCount: number
  averageRating: number
}

interface AgentParams {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/agents/[orgId]/google/business-profile
 *
 * Returns Google Business Profile data (reviews, location info, insights).
 * Used by Sierra agent to manage the GBP listing.
 */
export async function GET(request: NextRequest, { params }: AgentParams) {
  if (!verifyServiceApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await params

  const tokenData = await getDecryptedOauthToken(orgId, 'google')
  if (!tokenData) {
    return NextResponse.json({ error: 'No active Google connection for this org' }, { status: 404 })
  }

  // TODO: Implement GBP API calls using googleapis client
  // const auth = new google.auth.OAuth2()
  // auth.setCredentials({ access_token: tokenData.accessToken })
  // const mybusiness = google.mybusinessbusinessinformation({ version: 'v1', auth })
  // const location = await mybusiness.accounts.locations.list({ ... })

  const stub: BusinessProfileResponse = {
    location: null,
    reviews: [],
    totalReviewCount: 0,
    averageRating: 0,
  }

  return NextResponse.json({ data: stub, orgId })
}
