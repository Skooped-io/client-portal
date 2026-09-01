import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'
import { createSupabaseStore, runSocialPublish } from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/social-publish
 *
 * Triggered every 5 minutes by the GitHub Actions workflow
 * .github/workflows/social-publish.yml (Vercel Hobby only allows daily crons;
 * vercel.json keeps a once-a-day safety sweep at 14:00 UTC).
 *
 * Ships what Joseph approved on /m/<token> (spec: docs/social-publisher.md).
 * This cron never drafts, never decides content, never touches a row that is
 * not already 'approved'. Three jobs per run:
 *
 *   0. Rows stuck in 'publishing' for 15+ minutes (a killed function):
 *      swept to 'failed' so Retry shows on /m and resumes the container.
 *   1. Due rows (status 'approved', scheduled_at <= now): Instagram posts
 *      (no IG scheduling API) and any Facebook post outside the 20-min–29-day
 *      native window. Each row is CLAIMED (approved → publishing, with a
 *      state-conditioned update) before the Meta call, so an overlapping
 *      invocation can never publish the same post twice. The run has a
 *      wall-clock budget (240 s): claiming stops when it is nearly spent and
 *      every container wait is cut to fit. Transient Meta errors (rate limit,
 *      container still processing, 5xx) return the row to 'approved' for up
 *      to MAX_ATTEMPTS; anything else parks it in 'failed' with last_error
 *      shown on the page.
 *   2. Facebook rows Meta is holding ('scheduled') whose time has passed:
 *      read the published flag and flip them to 'published' + stamp
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
    const result = await runSocialPublish({
      store,
      now: new Date(),
      onError: (message, postId) =>
        ops.error('system', 'cron.social_publish.row', message, 'unknown', { metadata: { postId } }),
    })
    const counts = {
      published: result.published.length,
      retried: result.retried.length,
      failed: result.failed.length,
      skipped: result.skipped.length,
      stale: result.stale.length,
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
