import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
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

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function metricVal(
  row: { metricValues?: Array<{ value?: string | null }> },
  idx: number
): number {
  return parseFloat(row.metricValues?.[idx]?.value ?? '0') || 0
}

function dimVal(
  row: { dimensionValues?: Array<{ value?: string | null }> },
  idx: number
): string {
  return row.dimensionValues?.[idx]?.value ?? ''
}

function getHttpStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const e = err as Record<string, unknown>
  return (e.status as number) ?? (e.code as number)
}

/**
 * GET /api/agents/[orgId]/google/analytics
 *
 * Returns Google Analytics 4 data (sessions, pageviews, users).
 * Used by Scout agent to track website performance.
 *
 * Query params:
 *   - startDate: ISO date string (default: 28 days ago)
 *   - endDate: ISO date string (default: yesterday)
 *
 * Metadata keys read from oauth_connections.metadata:
 *   - ga4_property_id: GA4 numeric property ID (e.g. "123456789") — REQUIRED
 */
export async function GET(request: NextRequest, { params }: AgentParams) {
  if (!verifyServiceApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await params

  const searchParams = request.nextUrl.searchParams
  const endDate = searchParams.get('endDate') ?? daysAgo(1)
  const startDate = searchParams.get('startDate') ?? daysAgo(28)

  const tokenData = await getDecryptedOauthToken(orgId, 'google')
  if (!tokenData) {
    return NextResponse.json({ error: 'No active Google connection for this org' }, { status: 404 })
  }

  const propertyId = tokenData.connection.metadata?.ga4_property_id as string | undefined
  if (!propertyId) {
    return NextResponse.json(
      {
        error:
          'GA4 property ID not configured. Set metadata.ga4_property_id on the oauth connection.',
      },
      { status: 422 }
    )
  }

  try {
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: tokenData.accessToken })
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth })

    const res = await analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'totalUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
      },
    })

    const rows: AnalyticsMetric[] = (res.data.rows ?? []).map(row => ({
      date: dimVal(row, 0),
      sessions: metricVal(row, 0),
      pageviews: metricVal(row, 1),
      users: metricVal(row, 2),
      bounceRate: metricVal(row, 3),
      avgSessionDuration: metricVal(row, 4),
    }))

    const totals: Omit<AnalyticsMetric, 'date'> = {
      sessions: rows.reduce((s, r) => s + r.sessions, 0),
      pageviews: rows.reduce((s, r) => s + r.pageviews, 0),
      users: rows.reduce((s, r) => s + r.users, 0),
      bounceRate:
        rows.length > 0 ? rows.reduce((s, r) => s + r.bounceRate, 0) / rows.length : 0,
      avgSessionDuration:
        rows.length > 0
          ? rows.reduce((s, r) => s + r.avgSessionDuration, 0) / rows.length
          : 0,
    }

    const data: AnalyticsResponse = { rows, totals, propertyId }
    return NextResponse.json({ data, orgId })
  } catch (err: unknown) {
    const status = getHttpStatus(err)
    if (status === 401)
      return NextResponse.json({ error: 'Google token invalid or revoked' }, { status: 401 })
    if (status === 403)
      return NextResponse.json(
        { error: 'Insufficient permissions for Analytics' },
        { status: 403 }
      )
    const message = err instanceof Error ? err.message : 'Unknown error'; console.error('[analytics] GA4 API error', message)
    return NextResponse.json({ error: 'Analytics API error' }, { status: 500 })
  }
}
