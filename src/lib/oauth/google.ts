import { encrypt, decrypt } from '@/lib/crypto'
import type { OauthConnection } from '@/lib/types'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
  id_token?: string
}

interface GoogleUserInfo {
  id: string
  email: string
  name: string
  picture: string
}

export function buildGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI must be set')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent', // force refresh_token issuance
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env vars are not set')
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google token exchange failed: ${error}`)
  }

  return response.json() as Promise<GoogleTokenResponse>
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch Google user info')
  }

  return response.json() as Promise<GoogleUserInfo>
}

export async function refreshGoogleToken(encryptedRefreshToken: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth env vars are not set')
  }

  const refreshToken = decrypt(encryptedRefreshToken)

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google token refresh failed: ${error}`)
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  return data
}

export async function revokeGoogleToken(encryptedAccessToken: string): Promise<void> {
  const accessToken = decrypt(encryptedAccessToken)

  const response = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
  })

  // Revoke can fail if token is already expired — log but don't throw
  if (!response.ok) {
    console.error({ error: 'Google token revocation returned non-OK', status: response.status })
  }
}

export function encryptGoogleTokens(tokens: GoogleTokenResponse): {
  access_token: string
  refresh_token: string | null
  expires_at: string
} {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  return {
    access_token: encrypt(tokens.access_token),
    refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    expires_at: expiresAt,
  }
}

export function getDecryptedAccessToken(connection: OauthConnection): string {
  return decrypt(connection.access_token)
}
