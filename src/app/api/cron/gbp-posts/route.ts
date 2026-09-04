import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'
import { getGbpAccessToken } from '@/lib/gbp/client'
import { createLocalPost } from '@/lib/gbp/posts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/gbp-posts — NO SCHEDULE ANYMORE (manual invocation only).
 *
 * The vercel.json cron entry was removed 2026-09-03 (Joseph): the monthly
 * markdown-batch pipeline is retired in favor of the /m publisher, where
 * 'google' is a first-class platform and Google itself holds every scheduled
 * post (LocalPost.scheduledTime). This route is kept for manual runs against
 * whatever gbp_scheduled_posts rows still exist (Bearer CRON_SECRET); the
 * loader script and the table are untouched.
 *
 * Publishes approved GBP posts whose publish_date has arrived (America/Chicago).
 * Approve-then-publish (spec §3): rows only exist after Joseph approves a
 * fortnight batch and scripts/load-gbp-posts.ts loads it — this cron never
 * drafts or decides content, it only ships what was approved. Published posts
 * are treated as immutable (redline before approval, not after).
 *
 * Double-publish guard: each row is CLAIMED (approved → publishing, with a
 * state-conditioned update) before the API call, so an overlapping invocation
 * or a failed post-publish state write can never ship the same post twice. A
 * row stuck in 'publishing' means the process died mid-publish — the digest
 * surfaces it for a manual check instead of silently retrying.
 */

function verifyCron(request: NextRequest): boolean {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return process.env.NODE_ENV === 'development'
  return secret === cronSecret
}

interface DuePostRow {
  id: string
  location_id: string
  batch: string
  post_seq: number
  body: string
  cta_type: string | null
  cta_url: string | null
  media_url: string | null
  gbp_managed_locations: {
    client_key: string
    display_name: string
    gbp_location_name: string | null
    active: boolean
  } | null
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  ops.info('system', 'cron.gbp_posts.started', 'started')

  // "Today" in the business's timezone, not UTC — a post dated Aug 10 ships
  // on Aug 10 in Franklin, TN.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
  }).format(new Date())

  const { data: due, error } = await supabase
    .from('gbp_scheduled_posts')
    .select(
      'id, location_id, batch, post_seq, body, cta_type, cta_url, media_url, gbp_managed_locations(client_key, display_name, gbp_location_name, active)'
    )
    .eq('state', 'approved')
    .lte('publish_date', today)
    .order('publish_date', { ascending: true })

  if (error) {
    ops.error('system', 'cron.gbp_posts', error.message, 'unknown')
    await flush()
    return NextResponse.json({ error: 'Failed to load due posts' }, { status: 500 })
  }

  const dueRows = (due ?? []) as unknown as DuePostRow[]
  if (dueRows.length === 0) {
    ops.info('system', 'cron.gbp_posts.completed', 'skipped', { metadata: { due: 0 } })
    await flush()
    return NextResponse.json({ today, published: 0, failed: 0, skipped: 0, results: [] })
  }

  // One token for the whole run. If auth itself is down (refresh-token
  // expired, Google blip), abort WITHOUT touching row states — everything
  // stays 'approved' and the next daily run retries.
  let accessToken: string
  try {
    accessToken = await getGbpAccessToken()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    ops.error('system', 'cron.gbp_posts.auth', msg, 'unknown')
    await flush()
    return NextResponse.json({ error: `GBP auth failed, nothing published: ${msg}` }, { status: 500 })
  }

  let published = 0
  let failed = 0
  let skipped = 0
  const results: Record<string, unknown>[] = []

  for (const row of dueRows) {
    const loc = row.gbp_managed_locations
    const label = `${loc?.client_key ?? row.location_id} ${row.batch} #${row.post_seq}`
    if (!loc?.active || !loc.gbp_location_name) {
      // Location unresolved (review-responder resolves it) or deactivated —
      // leave the row approved for a later run, but flag it.
      results.push({ post: label, status: 'waiting', reason: 'location unresolved or inactive' })
      skipped++
      continue
    }

    // Claim the row. The .eq('state','approved') condition makes this a
    // compare-and-swap: a concurrent run that already claimed it matches 0
    // rows and we skip.
    const { data: claimed, error: claimError } = await supabase
      .from('gbp_scheduled_posts')
      .update({ state: 'publishing' })
      .eq('id', row.id)
      .eq('state', 'approved')
      .select('id')
    if (claimError || !claimed || claimed.length === 0) {
      results.push({ post: label, status: 'skipped', reason: 'claim failed (concurrent run?)' })
      skipped++
      continue
    }

    try {
      const name = await createLocalPost(
        loc.gbp_location_name,
        { body: row.body, ctaType: row.cta_type, ctaUrl: row.cta_url, mediaUrl: row.media_url },
        accessToken
      )
      const { error: doneError } = await supabase
        .from('gbp_scheduled_posts')
        .update({
          state: 'published',
          published_post_name: name,
          published_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', row.id)
      if (doneError) {
        // The post IS live; the row stays 'publishing' so it can never be
        // re-claimed and re-published. The digest flags it for a manual look.
        ops.error('system', 'cron.gbp_posts.state_write', doneError.message, 'unknown', {
          metadata: { post: label, published_post_name: name },
        })
        results.push({ post: label, status: 'published_state_write_failed', name })
      } else {
        results.push({ post: label, status: 'published' })
      }
      published++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      const { error: failError } = await supabase
        .from('gbp_scheduled_posts')
        .update({ state: 'failed', error: msg })
        .eq('id', row.id)
      if (failError) {
        ops.error('system', 'cron.gbp_posts.fail_write', failError.message, 'unknown', {
          metadata: { post: label },
        })
      }
      results.push({ post: label, status: 'failed', error: msg })
      failed++
    }
  }

  ops.info('system', 'cron.gbp_posts.completed', 'completed', {
    metadata: { published, failed, skipped },
  })
  await flush()

  return NextResponse.json({ today, published, failed, skipped, results })
}
