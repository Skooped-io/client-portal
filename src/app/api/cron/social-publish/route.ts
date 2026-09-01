import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'
import { createSupabaseStore, runSocialPublish } from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/social-publish — every 5 minutes (vercel.json)
 *
 * Ships what Joseph approved on /m/<token> (spec: docs/social-publisher.md).
 * This cron never drafts, never decides content, never touches a row that is
 * not already 'approved'. Two jobs per run:
 *
 *   1. Due rows (status 'approved', scheduled_at <= now): Instagram posts
 *      (no IG scheduling API) and any Facebook post outside the 10-min–30-day
 *      native window. Each row is CLAIMED (approved → publishing, with a
 *      state-conditioned update) before the Meta call, so an overlapping
 *      invocation can never publish the same post twice. Transient Meta
 *      errors (rate limit, container still processing, 5xx) return the row
 *      to 'approved' for up to MAX_ATTEMPTS; anything else parks it in
 *      'failed' with last_error shown on the page.
 *   2. Facebook rows Meta is holding ('scheduled') whose time has passed:
 *      read is_published and flip them to 'published' + stamp
 *      capture_uploads.posted_at, so the library reflects what went live.
 *
 * Auth: Bearer CRON_SECRET only (the x-vercel-cron header is spoofable).
 */

function verifyCron(request: NextRequest): boolean {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return process.env.NODE_ENV === 'development'
  return secret === cronSecret
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  ops.info('system', 'cron.social_publish.started', 'started')
  const store = createSupabaseStore(createAdminClient())

  try {
    const result = await runSocialPublish({ store, now: new Date() })
    const counts = {
      published: result.published.length,
      retried: result.retried.length,
      failed: result.failed.length,
      skipped: result.skipped.length,
      fbWentLive: result.fbWentLive.length,
      fbMissing: result.fbMissing.length,
    }
    ops.info('system', 'cron.social_publish.completed', 'completed', { metadata: counts })
    await flush()
    return NextResponse.json({ ...counts, result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    ops.error('system', 'cron.social_publish', msg, 'unknown')
    await flush()
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
