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

// Maps GBP star rating strings to numeric values
const STAR_RATING: Record<string, number> = {
  STAR_RATING_UNSPECIFIED: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
}

async function gbpFetch<T>(
  url: string,
  accessToken: string
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = (await res.json().catch(() => ({}))) as T
  return { ok: res.ok, status: res.status, data }
}

/**
 * GET /api/agents/[orgId]/google/business-profile
 *
 * Returns Google Business Profile data (location info + reviews with rating).
 * Used by Sierra agent to manage the GBP listing.
 *
 * Metadata keys read from oauth_connections.metadata:
 *   - gbp_account_name:  e.g. "accounts/123456789"      (auto-discovered if absent)
 *   - gbp_location_name: e.g. "accounts/123/locations/456" (auto-discovered if absent)
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

  const { accessToken, connection } = tokenData
  const meta = connection.metadata as Record<string, string>

  try {
    // ── 1. Resolve account name ─────────────────────────────────────────────
    let accountName = meta?.gbp_account_name
    if (!accountName) {
      const res = await gbpFetch<{ accounts?: Array<{ name: string }> }>(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
        accessToken
      )
      if (res.status === 401)
        return NextResponse.json({ error: 'Google token invalid or revoked' }, { status: 401 })
      if (res.status === 403)
        return NextResponse.json(
          { error: 'Insufficient permissions for Business Profile' },
          { status: 403 }
        )
      accountName = res.data.accounts?.[0]?.name
    }

    if (!accountName) {
      const empty: BusinessProfileResponse = {
        location: null,
        reviews: [],
        totalReviewCount: 0,
        averageRating: 0,
      }
      return NextResponse.json({ data: empty, orgId })
    }

    // ── 2. Resolve location name ────────────────────────────────────────────
    let locationName = meta?.gbp_location_name
    if (!locationName) {
      const readMask = 'name,title,phoneNumbers,websiteUri'
      const res = await gbpFetch<{
        locations?: Array<{ name: string; title: string }>
      }>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=${readMask}`,
        accessToken
      )
      locationName = res.data.locations?.[0]?.name
    }

    if (!locationName) {
      const empty: BusinessProfileResponse = {
        location: null,
        reviews: [],
        totalReviewCount: 0,
        averageRating: 0,
      }
      return NextResponse.json({ data: empty, orgId })
    }

    // ── 3. Fetch location details and reviews in parallel ───────────────────
    const readMask = 'name,title,phoneNumbers,websiteUri'
    const [locationRes, reviewsRes] = await Promise.all([
      gbpFetch<GbpLocation>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=${readMask}`,
        accessToken
      ),
      gbpFetch<{
        reviews?: GbpReview[]
        totalReviewCount?: number
        averageRating?: number
      }>(
        `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50`,
        accessToken
      ),
    ])

    const location: GbpLocation | null = locationRes.ok ? locationRes.data : null

    const reviews: GbpReview[] = reviewsRes.data.reviews ?? []

    // Prefer the API-reported average; fall back to computing from fetched reviews
    let averageRating = reviewsRes.data.averageRating ?? 0
    const totalReviewCount = reviewsRes.data.totalReviewCount ?? reviews.length

    if (!averageRating && reviews.length > 0) {
      const total = reviews.reduce((sum, r) => sum + (STAR_RATING[r.starRating] ?? 0), 0)
      averageRating = total / reviews.length
    }

    const data: BusinessProfileResponse = {
      location,
      reviews,
      totalReviewCount,
      averageRating,
    }

    return NextResponse.json({ data, orgId })
  } catch (err: unknown) {
    console.error('[business-profile] API error', err)
    return NextResponse.json({ error: 'Business Profile API error' }, { status: 500 })
  }
}
