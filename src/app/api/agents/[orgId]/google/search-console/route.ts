import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
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

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function getHttpStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const e = err as Record<string, unknown>
  return (e.status as number) ?? (e.code as number)
}

/**
 * GET /api/agents/[orgId]/google/search-console
 *
 * Returns Google Search Console data for the org.
 * Used by Scout agent to track search performance.
 *
 * Query params:
 *   - startDate: ISO date string (default: 29 days ago — accounts for GSC 2-day lag)
 *   - endDate: ISO date string (default: 2 days ago)
 *   - dimensions: comma-separated dimensions (default: query)
 *
 * Metadata keys read from oauth_connections.metadata:
 *   - gsc_site_url: verified site URL (e.g. "https://example.com/")
 *     If absent, auto-discovers the first verified site on the account.
 */
export async function GET(request: NextRequest, { params }: AgentParams) {
  if (!verifyServiceApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await params

  const searchParams = request.nextUrl.searchParams
  // GSC has a ~2-day data lag; default window is the prior 28 days
  const endDate = searchParams.get('endDate') ?? daysAgo(2)
  const startDate = searchParams.get('startDate') ?? daysAgo(29)

  const tokenData = await getDecryptedOauthToken(orgId, 'google')
  if (!tokenData) {
    return NextResponse.json({ error: 'No active Google connection for this org' }, { status: 404 })
  }

  try {
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: tokenData.accessToken })
    const sc = google.webmasters({ version: 'v3', auth })

    // Resolve site URL: prefer stored metadata, otherwise auto-discover
    let siteUrl = tokenData.connection.metadata?.gsc_site_url as string | undefined
    if (!siteUrl) {
      const sitesRes = await sc.sites.list()
      const sites = sitesRes.data.siteEntry ?? []
      // Prefer a fully-verified site over unverified
      const verified = sites.find(s => s.permissionLevel !== 'siteUnverifiedUser')
      siteUrl = verified?.siteUrl ?? sites[0]?.siteUrl ?? undefined
    }

    if (!siteUrl) {
      const empty: SearchConsoleResponse = {
        rows: [],
        totalClicks: 0,
        totalImpressions: 0,
        avgPosition: 0,
        avgCtr: 0,
      }
      return NextResponse.json({ data: empty, orgId })
    }

    const queryRes = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 50,
      },
    })

    const rows: SearchConsoleQuery[] = (queryRes.data.rows ?? []).map(row => ({
      keys: row.keys ?? [],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }))

    const totalClicks = rows.reduce((s, r) => s + r.clicks, 0)
    const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0)
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0
    const avgPosition =
      rows.length > 0 ? rows.reduce((s, r) => s + r.position, 0) / rows.length : 0

    const data: SearchConsoleResponse = {
      rows,
      totalClicks,
      totalImpressions,
      avgCtr,
      avgPosition,
      siteUrl,
    }

    return NextResponse.json({ data, orgId })
  } catch (err: unknown) {
    const status = getHttpStatus(err)
    if (status === 401)
      return NextResponse.json({ error: 'Google token invalid or revoked' }, { status: 401 })
    if (status === 403)
      return NextResponse.json(
        { error: 'Insufficient permissions for Search Console' },
        { status: 403 }
      )
    console.error('[search-console] API error', err)
    return NextResponse.json({ error: 'Search Console API error' }, { status: 500 })
  }
}
