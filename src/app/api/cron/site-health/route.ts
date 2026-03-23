import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'

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

interface HealthResult {
  orgId: string
  siteUrl: string
  status: 'up' | 'down' | 'slow' | 'error'
  statusCode: number | null
  responseTimeMs: number | null
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  ops.info('system', 'cron.site_health.started', 'started')

  // Get all live deployments
  const { data: deployments } = await supabase
    .from('site_deployments')
    .select('org_id, site_url')
    .eq('status', 'live')
    .not('site_url', 'is', null)

  if (!deployments || deployments.length === 0) {
    return NextResponse.json({ message: 'No live sites to check', results: [] })
  }

  // Deduplicate by org_id (keep latest)
  const orgSites = new Map<string, string>()
  for (const d of deployments) {
    if (d.site_url) orgSites.set(d.org_id, d.site_url)
  }

  const results: HealthResult[] = []
  const downSites: Array<{ orgId: string; url: string; error: string }> = []

  for (const [orgId, siteUrl] of orgSites) {
    try {
      const start = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

      const res = await fetch(siteUrl, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      })

      clearTimeout(timeout)
      const responseTimeMs = Date.now() - start

      if (res.ok) {
        const status = responseTimeMs > 5000 ? 'slow' : 'up'
        results.push({ orgId, siteUrl, status, statusCode: res.status, responseTimeMs })

        if (status === 'slow') {
          console.warn(`[site-health] ${siteUrl}: SLOW (${responseTimeMs}ms)`)
        }
      } else {
        results.push({ orgId, siteUrl, status: 'down', statusCode: res.status, responseTimeMs })
        downSites.push({ orgId, url: siteUrl, error: `HTTP ${res.status}` })
        console.error(`[site-health] ${siteUrl}: DOWN (${res.status})`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      results.push({ orgId, siteUrl, status: 'error', statusCode: null, responseTimeMs: null })
      downSites.push({ orgId, url: siteUrl, error: msg })
      console.error(`[site-health] ${siteUrl}: ERROR — ${msg}`)
    }

    // Small delay between checks
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  // Alert for any down sites
  if (downSites.length > 0) {
    const alertLines = downSites.map(s => `• ${s.url} — ${s.error}`).join('\n')
    await notifySlack(`🔴 *Site health alert*\n\n${downSites.length} site(s) down:\n${alertLines}`)

    // Log to agent_activity for each down site
    for (const site of downSites) {
      await supabase.from('agent_activity').insert({
        org_id: site.orgId,
        agent: 'bob',
        action_type: 'site_down',
        description: `Website ${site.url} is down: ${site.error}`,
        metadata: { url: site.url, error: site.error },
      })
    }
  }

  const upCount = results.filter(r => r.status === 'up').length
  const downCount = results.filter(r => r.status === 'down' || r.status === 'error').length
  const slowCount = results.filter(r => r.status === 'slow').length

  ops.info('system', 'cron.site_health.completed', 'completed', {
    metadata: { total: results.length, up: upCount, down: downCount, slow: slowCount },
  })

  await flush()

  console.log(`[site-health] Complete: ${upCount} up, ${downCount} down, ${slowCount} slow`)

  return NextResponse.json({
    total: results.length,
    up: upCount,
    down: downCount,
    slow: slowCount,
    results,
  })
}
