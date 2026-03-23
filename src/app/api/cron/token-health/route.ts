import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshSingleToken, buildRefreshErrorUpdate } from '@/lib/oauth/token-refresh'
import { decrypt } from '@/lib/crypto'
import { ops, flush } from '@/lib/logger'
import type { OauthConnection } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function verifyCron(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return process.env.NODE_ENV === 'development'
  return secret === cronSecret
}

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN
const SLACK_CHANNEL = 'C0ALGCT1E4B'

async function notifySlack(text: string) {
  if (!SLACK_BOT_TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: SLACK_CHANNEL, text }),
  }).catch(() => {})
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  ops.info('system', 'cron.token_health.started', 'started')

  // Get all active connections
  const { data: connections } = await supabase
    .from('oauth_connections')
    .select('*')
    .in('status', ['active', 'error'])

  if (!connections || connections.length === 0) {
    return NextResponse.json({ message: 'No connections to check', results: [] })
  }

  const results: Array<{ orgId: string; provider: string; status: string; action: string }> = []
  const now = Date.now()
  const twentyFourHoursMs = 24 * 60 * 60 * 1000

  for (const conn of connections as OauthConnection[]) {
    const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : null

    // Check if token expires within 24 hours
    if (expiresAt && expiresAt < now + twentyFourHoursMs) {
      if (!conn.refresh_token) {
        results.push({ orgId: conn.org_id, provider: conn.provider, status: 'no_refresh_token', action: 'skipped' })
        continue
      }

      try {
        // Decrypt the refresh token for the refresh call
        const decryptedRefresh = decrypt(conn.refresh_token)
        const refreshConn = { ...conn, refresh_token: decryptedRefresh }
        const updated = await refreshSingleToken(refreshConn)

        // Write refreshed token back to DB
        await supabase
          .from('oauth_connections')
          .update(updated)
          .eq('id', conn.id)

        results.push({ orgId: conn.org_id, provider: conn.provider, status: 'refreshed', action: 'proactive_refresh' })
        console.log(`[token-health] ${conn.provider} for org ${conn.org_id}: proactively refreshed ✅`)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        const errorUpdate = buildRefreshErrorUpdate(conn, errorMsg)

        await supabase
          .from('oauth_connections')
          .update(errorUpdate)
          .eq('id', conn.id)

        results.push({ orgId: conn.org_id, provider: conn.provider, status: errorUpdate.status, action: 'refresh_failed' })
        console.error(`[token-health] ${conn.provider} for org ${conn.org_id}: refresh failed — ${errorMsg}`)

        // Alert if error count is getting high
        if (errorUpdate.refresh_error_count >= 3) {
          // Get org name for the alert
          const { data: org } = await supabase.from('organizations').select('name').eq('id', conn.org_id).single()
          const orgName = org?.name ?? conn.org_id

          await notifySlack(
            `⚠️ *Token health alert*\n\n` +
            `Org: *${orgName}*\n` +
            `Provider: ${conn.provider}\n` +
            `Status: ${errorUpdate.status}\n` +
            `Error count: ${errorUpdate.refresh_error_count}\n` +
            `Error: ${errorMsg.slice(0, 200)}\n\n` +
            `Client may need to re-connect their ${conn.provider === 'google' ? 'Google' : 'Meta'} account.`
          )

          // Log to agent_activity
          await supabase.from('agent_activity').insert({
            org_id: conn.org_id,
            agent: 'system',
            action_type: 'token_warning',
            description: `${conn.provider} token refresh failing (${errorUpdate.refresh_error_count} errors). Client may need to re-connect.`,
            metadata: { provider: conn.provider, error_count: errorUpdate.refresh_error_count, error: errorMsg },
          })
        }
      }
    } else {
      results.push({ orgId: conn.org_id, provider: conn.provider, status: 'healthy', action: 'none' })
    }

    // Also check connections in 'error' status that might be recoverable
    if (conn.status === 'error' && conn.refresh_error_count < 5 && conn.refresh_token) {
      try {
        const decryptedRefresh = decrypt(conn.refresh_token)
        const refreshConn = { ...conn, refresh_token: decryptedRefresh }
        const updated = await refreshSingleToken(refreshConn)

        await supabase
          .from('oauth_connections')
          .update(updated)
          .eq('id', conn.id)

        results.push({ orgId: conn.org_id, provider: conn.provider, status: 'recovered', action: 'error_recovery' })
        console.log(`[token-health] ${conn.provider} for org ${conn.org_id}: recovered from error ✅`)
      } catch {
        // Leave as-is, error count already incremented
      }
    }
  }

  const refreshed = results.filter(r => r.action === 'proactive_refresh' || r.action === 'error_recovery').length
  const failed = results.filter(r => r.action === 'refresh_failed').length
  const healthy = results.filter(r => r.status === 'healthy').length

  ops.info('system', 'cron.token_health.completed', 'completed', {
    metadata: { total: connections.length, healthy, refreshed, failed },
  })

  await flush()

  console.log(`[token-health] Complete: ${healthy} healthy, ${refreshed} refreshed, ${failed} failed`)

  return NextResponse.json({
    total: connections.length,
    healthy,
    refreshed,
    failed,
    results,
  })
}
