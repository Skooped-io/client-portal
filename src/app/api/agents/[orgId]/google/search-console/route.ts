import { NextRequest, NextResponse } from 'next/server'
import { verifyServiceApiKey, getDecryptedOauthToken } from '@/lib/agents/auth'

// Types for Search Console data
interface SearchConsoleQuery {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface SearchConsoleResponse {
  rows: SearchConsoleQuery[]
  totalClicks: number
  totalImpressions: number
  avgPosition: number
  avgCtr: number
  siteUrl?: string
}

interface AgentParams {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/agents/[orgId]/google/search-console
 *
 * Returns Google Search Console data for the org.
 * Used by Scout agent to track search performance.
 *
 * Query params:
 *   - startDate: ISO date string (default: 30 days ago)
 *   - endDate: ISO date string (default: today)
 *   - dimensions: comma-separated dimensions (default: query)
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

  // TODO: Implement GSC API calls using googleapis client
  // const auth = new google.auth.OAuth2()
  // auth.setCredentials({ access_token: tokenData.accessToken })
  // const searchconsole = google.searchconsole({ version: 'v1', auth })
  // const response = await searchconsole.searchanalytics.query({ ... })

  const stub: SearchConsoleResponse = {
    rows: [],
    totalClicks: 0,
    totalImpressions: 0,
    avgPosition: 0,
    avgCtr: 0,
    siteUrl: undefined,
  }

  return NextResponse.json({ data: stub, orgId })
}
