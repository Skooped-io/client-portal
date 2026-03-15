import { NextRequest, NextResponse } from 'next/server'
import { verifyServiceApiKey, getDecryptedOauthToken } from '@/lib/agents/auth'

interface AdsCampaign {
  id: string
  name: string
  status: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
}

interface AdsResponse {
  campaigns: AdsCampaign[]
  totals: {
    impressions: number
    clicks: number
    spend: number
    conversions: number
  }
  customerId?: string
}

interface AgentParams {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/agents/[orgId]/google/ads
 *
 * Returns Google Ads campaign data (spend, impressions, clicks, conversions).
 * Used by Riley agent to manage and report on paid campaigns.
 *
 * Query params:
 *   - startDate: ISO date string (default: 30 days ago)
 *   - endDate: ISO date string (default: today)
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

  // TODO: Implement Google Ads API calls using googleapis client
  // Google Ads requires the google-ads-api package or OAuth2 + REST API
  // const customer = client.Customer({ customer_id: '...', refresh_token: decryptedRefreshToken })
  // const campaigns = await customer.report({ entity: 'campaign', attributes: [...], metrics: [...] })

  const stub: AdsResponse = {
    campaigns: [],
    totals: {
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
    },
    customerId: undefined,
  }

  return NextResponse.json({ data: stub, orgId })
}
