import { encrypt } from '@/lib/crypto'
import { refreshGoogleToken } from './google'
import { refreshMetaToken } from './meta'
import type { OauthConnection } from '@/lib/types'

const MAX_REFRESH_ERRORS = 5

export interface RefreshResult {
  connectionId: string
  provider: string
  success: boolean
  error?: string
  revoked?: boolean
}

export interface TokenRefreshSummary {
  refreshed: number
  failed: number
  revoked: number
  results: RefreshResult[]
}

/**
 * Refreshes a single OAuth connection's access token.
 * Returns the new token fields to write to the DB, or throws on failure.
 */
export async function refreshSingleToken(connection: OauthConnection): Promise<{
  access_token: string
  expires_at: string
  last_refreshed_at: string
  status: 'active'
  refresh_error: null
  refresh_error_count: 0
}> {
  if (connection.provider === 'google') {
    if (!connection.refresh_token) {
      throw new Error('No refresh token available for Google connection')
    }
    const { access_token, expires_in } = await refreshGoogleToken(connection.refresh_token)
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()
    return {
      access_token: encrypt(access_token),
      expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      status: 'active',
      refresh_error: null,
      refresh_error_count: 0,
    }
  }

  if (connection.provider === 'meta') {
    const metaToken = await refreshMetaToken(connection.access_token)
    const expiresIn = metaToken.expires_in ?? 60 * 24 * 60 * 60
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    return {
      access_token: encrypt(metaToken.access_token),
      expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      status: 'active',
      refresh_error: null,
      refresh_error_count: 0,
    }
  }

  throw new Error(`Unknown provider: ${connection.provider}`)
}

/**
 * Returns fields to write on a failed refresh attempt.
 * If error count hits the max, marks as revoked.
 */
export function buildRefreshErrorUpdate(
  connection: OauthConnection,
  errorMessage: string
): {
  refresh_error: string
  refresh_error_count: number
  status: 'error' | 'revoked'
} {
  const newCount = connection.refresh_error_count + 1
  const isRevoked = newCount >= MAX_REFRESH_ERRORS

  return {
    refresh_error: errorMessage,
    refresh_error_count: newCount,
    status: isRevoked ? 'revoked' : 'error',
  }
}

export { MAX_REFRESH_ERRORS }
