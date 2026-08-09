/**
 * GBP fleet client — Model 2 auth (one Skooped-held token manages every
 * location; see hq/REVIEW-RESPONDER-2026-07.md). Authenticates with the
 * standalone OAuth client from GCP project skooped-review-responder
 * (GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN), NOT the portal's
 * per-client oauth_connections.
 */

interface CachedToken {
  accessToken: string
  expiresAt: number
}

let cached: CachedToken | null = null

export async function getGbpAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.accessToken
  }

  const clientId = process.env.GBP_CLIENT_ID
  const clientSecret = process.env.GBP_CLIENT_SECRET
  const refreshToken = process.env.GBP_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN not configured')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GBP token refresh failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cached = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return cached.accessToken
}

export interface GbpFetchResult<T> {
  ok: boolean
  status: number
  data: T
}

export async function gbpFetch<T>(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<GbpFetchResult<T>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T
  return { ok: res.ok, status: res.status, data }
}

/**
 * Resolve the account-scoped location path ("accounts/{a}/locations/{l}") for
 * a display name. Used once per location, then cached in
 * gbp_managed_locations. The v4 reviews/localPosts endpoints require the
 * account-scoped form; the v1 Business Information API returns bare
 * "locations/{l}" names, so we join them here.
 */
export async function resolveLocation(
  accessToken: string,
  displayName: string
): Promise<{ accountName: string; locationName: string } | null> {
  const accounts = await gbpFetch<{ accounts?: Array<{ name: string }> }>(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    accessToken
  )
  if (!accounts.ok) {
    throw new Error(`GBP account list failed (${accounts.status})`)
  }
  const target = displayName.trim().toLowerCase()
  for (const account of accounts.data.accounts ?? []) {
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({ readMask: 'name,title', pageSize: '100' })
      if (pageToken) params.set('pageToken', pageToken)
      const res = await gbpFetch<{
        locations?: Array<{ name: string; title: string }>
        nextPageToken?: string
      }>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?${params}`,
        accessToken
      )
      // Throw rather than fall through to null: a transient 429/500 or a 403
      // must surface as an error, not masquerade as "location not found".
      if (!res.ok) {
        throw new Error(`GBP locations list failed for ${account.name} (${res.status})`)
      }
      for (const loc of res.data.locations ?? []) {
        if (loc.title?.trim().toLowerCase() === target) {
          // loc.name is "locations/{l}" — join with the account for v4 paths.
          return { accountName: account.name, locationName: `${account.name}/${loc.name}` }
        }
      }
      pageToken = res.data.nextPageToken
    } while (pageToken)
  }
  return null
}
