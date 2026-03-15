import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshSingleToken, buildRefreshErrorUpdate } from '@/lib/oauth/token-refresh'
import type { OauthConnection } from '@/lib/types'
import type { RefreshResult, TokenRefreshSummary } from '@/lib/oauth/token-refresh'

/**
 * POST /api/oauth/token/refresh
 *
 * Called by Cooper's cron job every 30 minutes.
 * Requires SERVICE_API_KEY header for auth.
 *
 * Refreshes tokens that are:
 * - Active and expiring within 30 minutes
 * - In error state with fewer than 5 failed attempts
 */
export async function POST(request: NextRequest) {
  // Verify service API key
  const apiKey = request.headers.get('x-service-api-key')
  if (!apiKey || apiKey !== process.env.SERVICE_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const refreshThreshold = new Date(now.getTime() + 30 * 60 * 1000).toISOString()

  // Find connections that need refreshing
  const { data: connections, error: fetchError } = await supabase
    .from('oauth_connections')
    .select('*')
    .or(
      `and(status.eq.active,expires_at.lt.${refreshThreshold}),and(status.eq.error,refresh_error_count.lt.5)`
    )

  if (fetchError) {
    console.error({ fetchError })
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({
      refreshed: 0,
      failed: 0,
      revoked: 0,
      results: [],
    } satisfies TokenRefreshSummary)
  }

  const results: RefreshResult[] = []

  for (const connection of connections as OauthConnection[]) {
    try {
      const updates = await refreshSingleToken(connection)

      const { error: updateError } = await supabase
        .from('oauth_connections')
        .update(updates)
        .eq('id', connection.id)

      if (updateError) {
        throw new Error(`DB update failed: ${updateError.message}`)
      }

      results.push({
        connectionId: connection.id,
        provider: connection.provider,
        success: true,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error({ err, connectionId: connection.id, provider: connection.provider })

      const errorUpdate = buildRefreshErrorUpdate(connection, errorMessage)

      await supabase
        .from('oauth_connections')
        .update(errorUpdate)
        .eq('id', connection.id)

      results.push({
        connectionId: connection.id,
        provider: connection.provider,
        success: false,
        error: errorMessage,
        revoked: errorUpdate.status === 'revoked',
      })
    }
  }

  const summary: TokenRefreshSummary = {
    refreshed: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success && !r.revoked).length,
    revoked: results.filter((r) => r.revoked).length,
    results,
  }

  return NextResponse.json(summary)
}
