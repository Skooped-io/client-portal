import { NextRequest, NextResponse } from 'next/server'
import { verifyServiceApiKey, getDecryptedOauthToken } from '@/lib/agents/auth'
import { portal } from '@/lib/logger'

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

// Google Ads API version
const ADS_API_VERSION = 'v18'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

interface AdsApiRow {
  campaign?: {
    id?: string
    name?: string
    status?: string
  }
  metrics?: {
    impressions?: string
    clicks?: string
    costMicros?: string
    conversions?: number
  }
}

/**
 * GET /api/agents/[orgId]/google/ads
 *
 * Returns Google Ads campaign data (spend, impressions, clicks, conversions).
 * Used by Riley agent to manage and report on paid campaigns.
 *
 * Query params:
 *   - startDate: ISO date string (default: 28 days ago)
 *   - endDate: ISO date string (default: yesterday)
 *
 * Metadata keys read from oauth_connections.metadata:
 *   - ads_customer_id:         10-digit Ads customer ID, no hyphens (REQUIRED)
 *   - ads_manager_customer_id: MCC/manager customer ID (optional, for agency accounts)
 *
 * Required env var:
 *   - GOOGLE_ADS_DEVELOPER_TOKEN
 */
export async function GET(request: NextRequest, { params }: AgentParams) {
  if (!verifyServiceApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await params

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!devToken) {
    return NextResponse.json(
      { error: 'GOOGLE_ADS_DEVELOPER_TOKEN is not configured' },
      { status: 500 }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const endDate = searchParams.get('endDate') ?? daysAgo(1)
  const startDate = searchParams.get('startDate') ?? daysAgo(28)

  const tokenData = await getDecryptedOauthToken(orgId, 'google')
  if (!tokenData) {
    return NextResponse.json({ error: 'No active Google connection for this org' }, { status: 404 })
  }

  const { accessToken, connection } = tokenData
  const meta = connection.metadata as Record<string, string>

  const customerId = meta?.ads_customer_id
  if (!customerId) {
    return NextResponse.json(
      {
        error:
          'Google Ads customer ID not configured. Set metadata.ads_customer_id on the oauth connection.',
      },
      { status: 422 }
    )
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': devToken,
    'Content-Type': 'application/json',
  }

  // Required when accessing a client account through a manager (MCC) account
  const managerId = meta?.ads_manager_customer_id
  if (managerId) {
    headers['login-customer-id'] = managerId
  }

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
    LIMIT 50
  `

  try {
    const res = await fetch(
      `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      }
    )

    if (res.status === 401)
      return NextResponse.json({ error: 'Google token invalid or revoked' }, { status: 401 })
    if (res.status === 403)
      return NextResponse.json(
        { error: 'Insufficient permissions for Google Ads' },
        { status: 403 }
      )

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      console.error('[ads] Google Ads API error', res.status, errBody)
      portal.error('agents.google.ads', `API error ${res.status}`, { metadata: { status: res.status } })
      return NextResponse.json({ error: 'Google Ads API error' }, { status: 500 })
    }

    const body = (await res.json()) as { results?: AdsApiRow[] }
    const results = body.results ?? []

    const campaigns: AdsCampaign[] = results.map(row => ({
      id: row.campaign?.id ?? '',
      name: row.campaign?.name ?? '',
      status: row.campaign?.status ?? 'UNKNOWN',
      impressions: parseInt(row.metrics?.impressions ?? '0', 10),
      clicks: parseInt(row.metrics?.clicks ?? '0', 10),
      // costMicros → currency units (divide by 1,000,000)
      spend: parseInt(row.metrics?.costMicros ?? '0', 10) / 1_000_000,
      conversions: row.metrics?.conversions ?? 0,
    }))

    const totals = {
      impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
      clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
      spend: campaigns.reduce((s, c) => s + c.spend, 0),
      conversions: campaigns.reduce((s, c) => s + c.conversions, 0),
    }

    const data: AdsResponse = { campaigns, totals, customerId }
    return NextResponse.json({ data, orgId })
  } catch (err: unknown) {
    console.error('[ads] API error', err)
    return NextResponse.json({ error: 'Google Ads API error' }, { status: 500 })
  }
}
