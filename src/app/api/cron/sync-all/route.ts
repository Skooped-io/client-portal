import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDecryptedOauthToken } from '@/lib/agents/auth'
import { ops, clients, flush } from '@/lib/logger'
import type { OauthConnection } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min max for Vercel Pro

// ─── Auth ────────────────────────────────────────────────────────────────────

function verifyCronSecret(request: NextRequest): boolean {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.warn('[cron/sync-all] CRON_SECRET not set — allowing request in dev')
    return process.env.NODE_ENV === 'development'
  }
  return secret === cronSecret
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrgToSync {
  orgId: string
  orgName: string
  googleToken: { connection: OauthConnection; accessToken: string } | null
  metaToken: { connection: OauthConnection; accessToken: string } | null
}

interface SyncResult {
  orgId: string
  orgName: string
  google: { seo: boolean; gbp: boolean; analytics: boolean; ads: boolean }
  meta: { instagram: boolean; facebook: boolean }
  errors: string[]
}

// ─── Google API Calls ────────────────────────────────────────────────────────

async function syncSearchConsole(
  orgId: string,
  orgName: string,
  accessToken: string,
  supabase: ReturnType<typeof createAdminClient>,
  siteUrl?: string
): Promise<boolean> {
  try {
    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    const sc = google.searchconsole({ version: 'v1', auth })

    // Get site URL if not provided
    let targetSite = siteUrl
    if (!targetSite) {
      const sites = await sc.sites.list()
      targetSite = sites.data.siteEntry?.[0]?.siteUrl
      if (!targetSite) {
        console.log(`[sync] ${orgName}: No Search Console sites found`)
        return false
      }
    }

    // Pull last 30 days of data
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const queryRes = await sc.searchanalytics.query({
      siteUrl: targetSite,
      requestBody: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dimensions: ['query'],
        rowLimit: 25,
      },
    })

    const rows = queryRes.data.rows ?? []
    const totalClicks = rows.reduce((sum, r) => sum + (r.clicks ?? 0), 0)
    const totalImpressions = rows.reduce((sum, r) => sum + (r.impressions ?? 0), 0)
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0
    const avgPosition = rows.length > 0
      ? rows.reduce((sum, r) => sum + (r.position ?? 0), 0) / rows.length
      : 0

    const topQueries = rows.slice(0, 25).map(r => ({
      query: r.keys?.[0] ?? '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }))

    // Also get top pages
    const pageRes = await sc.searchanalytics.query({
      siteUrl: targetSite,
      requestBody: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dimensions: ['page'],
        rowLimit: 10,
      },
    })

    const topPages = (pageRes.data.rows ?? []).slice(0, 10).map(r => ({
      page: r.keys?.[0] ?? '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
    }))

    const today = new Date().toISOString().split('T')[0]

    await supabase.from('seo_metrics').upsert({
      org_id: orgId,
      date: today,
      total_clicks: totalClicks,
      total_impressions: totalImpressions,
      avg_ctr: avgCtr,
      avg_position: Math.round(avgPosition * 100) / 100,
      top_queries: topQueries,
      top_pages: topPages,
      site_url: targetSite,
    }, { onConflict: 'org_id,date' })

    clients.seo(orgId, orgName, {
      clicks: totalClicks,
      impressions: totalImpressions,
      avgCtr,
      avgPosition,
      queryCount: topQueries.length,
    })

    console.log(`[sync] ${orgName}: SEO ✅ (${totalClicks} clicks, ${totalImpressions} impressions)`)
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[sync] ${orgName}: SEO ❌ ${msg}`)
    return false
  }
}

async function syncBusinessProfile(
  orgId: string,
  orgName: string,
  accessToken: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  try {
    // GBP uses REST API directly (no googleapis wrapper for v1 business info)
    const accountsRes = await fetch(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!accountsRes.ok) {
      console.log(`[sync] ${orgName}: GBP accounts fetch failed (${accountsRes.status})`)
      return false
    }

    const accountsData = await accountsRes.json() as { accounts?: Array<{ name: string }> }
    const account = accountsData.accounts?.[0]
    if (!account) {
      console.log(`[sync] ${orgName}: No GBP accounts found`)
      return false
    }

    // Get locations
    const locationsRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    let totalReviews = 0
    let avgRating = 0
    const recentReviews: Array<{ author: string; rating: number; text: string; date: string }> = []

    if (locationsRes.ok) {
      const locData = await locationsRes.json() as { locations?: Array<{ name: string }> }
      const location = locData.locations?.[0]

      if (location) {
        // Get reviews
        const reviewsRes = await fetch(
          `https://mybusiness.googleapis.com/v4/${location.name}/reviews?pageSize=50`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )

        if (reviewsRes.ok) {
          const reviewsData = await reviewsRes.json() as {
            totalReviewCount?: number
            averageRating?: number
            reviews?: Array<{
              reviewer?: { displayName?: string }
              starRating?: string
              comment?: string
              createTime?: string
            }>
          }

          totalReviews = reviewsData.totalReviewCount ?? 0
          avgRating = reviewsData.averageRating ?? 0

          recentReviews.push(
            ...(reviewsData.reviews ?? []).slice(0, 10).map(r => ({
              author: r.reviewer?.displayName ?? 'Anonymous',
              rating: ratingToNumber(r.starRating),
              text: r.comment ?? '',
              date: r.createTime ?? '',
            }))
          )
        }
      }
    }

    const today = new Date().toISOString().split('T')[0]

    await supabase.from('gbp_metrics').upsert({
      org_id: orgId,
      date: today,
      total_reviews: totalReviews,
      avg_rating: avgRating,
      new_reviews: 0, // Would need to compare with previous day
      recent_reviews: recentReviews,
    }, { onConflict: 'org_id,date' })

    clients.gbp(orgId, orgName, {
      totalReviews,
      avgRating,
      recentReviewCount: recentReviews.length,
    })

    console.log(`[sync] ${orgName}: GBP ✅ (${totalReviews} reviews, ${avgRating} avg)`)
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[sync] ${orgName}: GBP ❌ ${msg}`)
    return false
  }
}

function ratingToNumber(rating?: string): number {
  const map: Record<string, number> = {
    ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  }
  return map[rating ?? ''] ?? 0
}

async function syncAnalytics(
  orgId: string,
  orgName: string,
  accessToken: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  try {
    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })

    // List GA4 properties
    const admin = google.analyticsadmin({ version: 'v1beta', auth })
    const propertiesRes = await admin.properties.list({
      filter: 'parent:accounts/-',
      pageSize: 10,
    })

    const property = propertiesRes.data.properties?.[0]
    if (!property?.name) {
      console.log(`[sync] ${orgName}: No GA4 properties found`)
      return false
    }

    const propertyId = property.name.replace('properties/', '')

    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth })
    const res = await analyticsdata.properties.runReport({
      property: property.name,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        dimensions: [{ name: 'date' }],
        orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
        limit: 30,
      },
    })

    const rows = res.data.rows ?? []
    const latestRow = rows[0]

    const sessions = parseInt(latestRow?.metricValues?.[0]?.value ?? '0', 10)
    const users = parseInt(latestRow?.metricValues?.[1]?.value ?? '0', 10)
    const pageviews = parseInt(latestRow?.metricValues?.[2]?.value ?? '0', 10)
    const bounceRate = parseFloat(latestRow?.metricValues?.[3]?.value ?? '0')
    const avgDuration = parseFloat(latestRow?.metricValues?.[4]?.value ?? '0')

    const today = new Date().toISOString().split('T')[0]

    await supabase.from('analytics_metrics').upsert({
      org_id: orgId,
      date: today,
      sessions,
      users,
      pageviews,
      bounce_rate: Math.round(bounceRate * 100) / 100,
      avg_session_duration: Math.round(avgDuration * 100) / 100,
      property_id: propertyId,
    }, { onConflict: 'org_id,date' })

    console.log(`[sync] ${orgName}: Analytics ✅ (${sessions} sessions, ${users} users)`)
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[sync] ${orgName}: Analytics ❌ ${msg}`)
    return false
  }
}

async function syncAds(
  orgId: string,
  orgName: string,
  accessToken: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  try {
    // Google Ads requires a developer token and customer ID — skip if not configured
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    if (!developerToken) {
      console.log(`[sync] ${orgName}: Ads skipped (no GOOGLE_ADS_DEVELOPER_TOKEN)`)
      return false
    }

    // List accessible customers
    const customersRes = await fetch(
      'https://googleads.googleapis.com/v18/customers:listAccessibleCustomers',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
        },
      }
    )

    if (!customersRes.ok) {
      console.log(`[sync] ${orgName}: Ads customers fetch failed (${customersRes.status})`)
      return false
    }

    const customersData = await customersRes.json() as { resourceNames?: string[] }
    const customerId = customersData.resourceNames?.[0]?.replace('customers/', '')

    if (!customerId) {
      console.log(`[sync] ${orgName}: No Ads customers found`)
      return false
    }

    // Query campaign performance (last 30 days)
    const queryRes = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            SELECT
              campaign.name,
              metrics.cost_micros,
              metrics.clicks,
              metrics.impressions,
              metrics.conversions,
              metrics.average_cpc,
              metrics.ctr
            FROM campaign
            WHERE segments.date DURING LAST_30_DAYS
            ORDER BY metrics.cost_micros DESC
            LIMIT 20
          `,
        }),
      }
    )

    if (!queryRes.ok) {
      console.log(`[sync] ${orgName}: Ads query failed (${queryRes.status})`)
      return false
    }

    const queryData = await queryRes.json() as {
      results?: Array<{
        campaign?: { name?: string }
        metrics?: {
          costMicros?: string
          clicks?: string
          impressions?: string
          conversions?: string
          averageCpc?: string
          ctr?: string
        }
      }>
    }

    const results = queryData.results ?? []
    let totalSpend = 0
    let totalClicks = 0
    let totalImpressions = 0
    let totalConversions = 0

    const campaigns = results.map(r => {
      const spend = parseInt(r.metrics?.costMicros ?? '0', 10) / 1_000_000
      const clicks = parseInt(r.metrics?.clicks ?? '0', 10)
      const impressions = parseInt(r.metrics?.impressions ?? '0', 10)
      const conversions = parseFloat(r.metrics?.conversions ?? '0')

      totalSpend += spend
      totalClicks += clicks
      totalImpressions += impressions
      totalConversions += conversions

      return {
        name: r.campaign?.name ?? 'Unknown',
        spend: Math.round(spend * 100) / 100,
        clicks,
        impressions,
        conversions: Math.round(conversions * 10) / 10,
      }
    })

    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0

    const today = new Date().toISOString().split('T')[0]

    await supabase.from('ads_metrics').upsert({
      org_id: orgId,
      date: today,
      total_spend: Math.round(totalSpend * 100) / 100,
      total_clicks: totalClicks,
      total_impressions: totalImpressions,
      total_conversions: Math.round(totalConversions * 10) / 10,
      avg_cpc: Math.round(avgCpc * 100) / 100,
      avg_ctr: Math.round(avgCtr * 10000) / 10000,
      campaigns,
    }, { onConflict: 'org_id,date' })

    clients.ads(orgId, orgName, { totalSpend, totalClicks, totalImpressions, campaigns: campaigns.length })

    console.log(`[sync] ${orgName}: Ads ✅ ($${totalSpend.toFixed(2)} spend, ${totalClicks} clicks)`)
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[sync] ${orgName}: Ads ❌ ${msg}`)
    return false
  }
}

// ─── Main Sync Handler ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const supabase = createAdminClient()

  ops.info('system', 'cron.sync_all.started', 'started')

  // Get all orgs
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')

  if (!orgs || orgs.length === 0) {
    ops.info('system', 'cron.sync_all.no_orgs', 'completed')
    return NextResponse.json({ message: 'No orgs to sync', results: [] })
  }

  // Build list of orgs with their tokens
  const orgsToSync: OrgToSync[] = []

  for (const org of orgs) {
    const googleToken = await getDecryptedOauthToken(org.id, 'google').catch(() => null)
    const metaToken = await getDecryptedOauthToken(org.id, 'meta').catch(() => null)

    // Only sync orgs that have at least one connection
    if (googleToken || metaToken) {
      orgsToSync.push({
        orgId: org.id,
        orgName: org.name,
        googleToken,
        metaToken,
      })
    }
  }

  console.log(`[sync] Found ${orgsToSync.length} orgs with active connections (of ${orgs.length} total)`)

  const results: SyncResult[] = []

  // Process each org sequentially (respect rate limits)
  for (const org of orgsToSync) {
    const result: SyncResult = {
      orgId: org.orgId,
      orgName: org.orgName,
      google: { seo: false, gbp: false, analytics: false, ads: false },
      meta: { instagram: false, facebook: false },
      errors: [],
    }

    // ── Google sync ────────────────────────────────────────────────
    if (org.googleToken) {
      const token = org.googleToken.accessToken

      result.google.seo = await syncSearchConsole(org.orgId, org.orgName, token, supabase)
      if (!result.google.seo) result.errors.push('SEO sync failed')

      result.google.gbp = await syncBusinessProfile(org.orgId, org.orgName, token, supabase)
      if (!result.google.gbp) result.errors.push('GBP sync failed')

      result.google.analytics = await syncAnalytics(org.orgId, org.orgName, token, supabase)
      if (!result.google.analytics) result.errors.push('Analytics sync failed')

      result.google.ads = await syncAds(org.orgId, org.orgName, token, supabase)
      // Ads failure is common (no developer token or no ads account) — don't count as error
    }

    // ── Meta sync (placeholder — will implement when we have test data) ──
    if (org.metaToken) {
      // TODO: Implement Meta sync when Sierra is active
      console.log(`[sync] ${org.orgName}: Meta sync not yet implemented`)
    }

    // Log agent activity
    const syncedServices = [
      result.google.seo && 'Search Console',
      result.google.gbp && 'Business Profile',
      result.google.analytics && 'Analytics',
      result.google.ads && 'Ads',
    ].filter(Boolean)

    if (syncedServices.length > 0) {
      await supabase.from('agent_activity').insert({
        org_id: org.orgId,
        agent: 'scout',
        action_type: 'data_sync',
        description: `Daily data sync: ${syncedServices.join(', ')}`,
        metadata: { services: syncedServices, errors: result.errors },
      })
    }

    results.push(result)

    // Small delay between orgs to respect rate limits
    if (orgsToSync.indexOf(org) < orgsToSync.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  const duration = Date.now() - startTime
  const successCount = results.filter(r => r.errors.length === 0).length
  const failCount = results.filter(r => r.errors.length > 0).length

  ops.info('system', 'cron.sync_all.completed', 'completed', {
    duration_ms: duration,
    metadata: { orgs: results.length, success: successCount, failed: failCount },
  })

  await flush()

  console.log(`[sync] Complete: ${successCount} success, ${failCount} with errors (${duration}ms)`)

  return NextResponse.json({
    synced: results.length,
    success: successCount,
    failed: failCount,
    duration_ms: duration,
    results,
  })
}
