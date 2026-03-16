import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import { refreshSingleToken, buildRefreshErrorUpdate } from '@/lib/oauth/token-refresh'
import type { OauthConnection } from '@/lib/types'

/**
 * Verifies the SERVICE_API_KEY header on agent API requests.
 */
export function verifyServiceApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-service-api-key')
  return apiKey === process.env.SERVICE_API_KEY
}

/**
 * Loads and decrypts the access token for a given org + provider.
 * Auto-refreshes if the token is expired or expiring within 5 minutes.
 * Returns null if no active connection exists.
 */
export async function getDecryptedOauthToken(
  orgId: string,
  provider: 'google' | 'meta'
): Promise<{ connection: OauthConnection; accessToken: string } | null> {
  const supabase = createAdminClient()

  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .in('status', ['active', 'error'])
    .single()

  if (!connection) return null

  const conn = connection as OauthConnection

  // Check if token is expired or expiring within 5 minutes
  const isExpired = conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 5 * 60 * 1000

  if (isExpired && conn.refresh_token) {
    try {
      // Decrypt refresh token for the refresh call
      const decryptedRefresh = decrypt(conn.refresh_token)
      const refreshConn = { ...conn, refresh_token: decryptedRefresh }
      const updated = await refreshSingleToken(refreshConn)

      // Write refreshed token back to DB
      await supabase
        .from('oauth_connections')
        .update(updated)
        .eq('id', conn.id)

      // Return the fresh token (decrypt the newly encrypted one)
      const freshToken = decrypt(updated.access_token)
      return { connection: { ...conn, ...updated }, accessToken: freshToken }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown refresh error'
      const errorUpdate = buildRefreshErrorUpdate(conn, errorMsg)

      // Write error state to DB
      await supabase
        .from('oauth_connections')
        .update(errorUpdate)
        .eq('id', conn.id)

      // If not revoked, still try with the current token (might work briefly)
      if (errorUpdate.status !== 'revoked') {
        const accessToken = decrypt(conn.access_token)
        return { connection: conn, accessToken }
      }

      return null
    }
  }

  const accessToken = decrypt(conn.access_token)
  return { connection: conn, accessToken }
}
