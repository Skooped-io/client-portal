import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
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
    .eq('status', 'active')
    .single()

  if (!connection) return null

  const accessToken = decrypt(connection.access_token)
  return { connection: connection as OauthConnection, accessToken }
}
