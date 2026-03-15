import { encrypt, decrypt } from '@/lib/crypto'
import type { OauthConnection } from '@/lib/types'

const META_GRAPH_URL = 'https://graph.facebook.com/v19.0'

export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
]

interface MetaTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

interface MetaPage {
  id: string
  name: string
  access_token: string
  instagram_business_account?: { id: string }
}

interface MetaUserInfo {
  id: string
  email?: string
  name: string
}

export function buildMetaAuthUrl(state: string): string {
  const appId = process.env.META_APP_ID
  const redirectUri = process.env.META_REDIRECT_URI

  if (!appId || !redirectUri) {
    throw new Error('META_APP_ID and META_REDIRECT_URI must be set')
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: META_SCOPES.join(','),
    response_type: 'code',
    state,
  })

  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`
}

export async function exchangeMetaCode(code: string): Promise<MetaTokenResponse> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const redirectUri = process.env.META_REDIRECT_URI

  if (!appId || !appSecret || !redirectUri) {
    throw new Error('Meta OAuth env vars are not set')
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })

  const response = await fetch(`${META_GRAPH_URL}/oauth/access_token?${params.toString()}`)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Meta code exchange failed: ${error}`)
  }

  return response.json() as Promise<MetaTokenResponse>
}

/**
 * Exchanges a short-lived token for a long-lived token (~60 days).
 */
export async function exchangeMetaLongLivedToken(shortToken: string): Promise<MetaTokenResponse> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET

  if (!appId || !appSecret) {
    throw new Error('Meta OAuth env vars are not set')
  }

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  })

  const response = await fetch(`${META_GRAPH_URL}/oauth/access_token?${params.toString()}`)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Meta long-lived token exchange failed: ${error}`)
  }

  return response.json() as Promise<MetaTokenResponse>
}

export async function refreshMetaToken(encryptedToken: string): Promise<MetaTokenResponse> {
  const token = decrypt(encryptedToken)
  // Meta long-lived tokens are refreshed by re-exchanging them
  return exchangeMetaLongLivedToken(token)
}

export async function fetchMetaUserInfo(accessToken: string): Promise<MetaUserInfo> {
  const params = new URLSearchParams({
    fields: 'id,name,email',
    access_token: accessToken,
  })

  const response = await fetch(`${META_GRAPH_URL}/me?${params.toString()}`)

  if (!response.ok) {
    throw new Error('Failed to fetch Meta user info')
  }

  return response.json() as Promise<MetaUserInfo>
}

export async function fetchMetaPages(accessToken: string): Promise<MetaPage[]> {
  const params = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account',
    access_token: accessToken,
  })

  const response = await fetch(`${META_GRAPH_URL}/me/accounts?${params.toString()}`)

  if (!response.ok) {
    throw new Error('Failed to fetch Meta pages')
  }

  const data = (await response.json()) as { data: MetaPage[] }
  return data.data
}

export async function revokeMetaToken(encryptedToken: string): Promise<void> {
  const accessToken = decrypt(encryptedToken)
  const appId = process.env.META_APP_ID

  if (!appId) {
    throw new Error('META_APP_ID is not set')
  }

  const params = new URLSearchParams({ access_token: accessToken })
  const response = await fetch(`${META_GRAPH_URL}/me/permissions?${params.toString()}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    console.error({ error: 'Meta token revocation returned non-OK', status: response.status })
  }
}

export function encryptMetaTokens(tokens: MetaTokenResponse): {
  access_token: string
  expires_at: string
} {
  // Meta long-lived tokens last ~60 days
  const expiresIn = tokens.expires_in ?? 60 * 24 * 60 * 60
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  return {
    access_token: encrypt(tokens.access_token),
    expires_at: expiresAt,
  }
}

export function getDecryptedAccessToken(connection: OauthConnection): string {
  return decrypt(connection.access_token)
}
