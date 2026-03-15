import { NextRequest, NextResponse } from 'next/server'
import { verifyServiceApiKey, getDecryptedOauthToken } from '@/lib/agents/auth'

interface AnalyticsMetric {
  date: string
  sessions: number
  pageviews: number
  users: number
  bounceRate: number
  avgSessionDuration: number
}

interface AnalyticsResponse {
  rows: AnalyticsMetric[]
  totals: Omit<AnalyticsMetric, 'date'>
  propertyId?: string
}

interface AgentParams {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/agents/[orgId]/google/analytics
 *
 * Returns Google Analytics 4 data (sessions, pageviews, users).
 * Used by Scout agent to track website performance.
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

  // TODO: Implement GA4 Data API calls using googleapis client
  // const auth = new google.auth.OAuth2()
  // auth.setCredentials({ access_token: tokenData.accessToken })
  // const analyticsdata = google.analyticsdata({ version: 'v1beta', auth })
  // const response = await analyticsdata.properties.runReport({ ... })

  const stub: AnalyticsResponse = {
    rows: [],
    totals: {
      sessions: 0,
      pageviews: 0,
      users: 0,
      bounceRate: 0,
      avgSessionDuration: 0,
    },
    propertyId: undefined,
  }

  return NextResponse.json({ data: stub, orgId })
}
