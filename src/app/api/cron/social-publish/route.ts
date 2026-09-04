import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'
import { verifyCronSecret } from '@/lib/cron-secret'
import { createSupabaseStore, runSocialReconcile } from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/social-publish — RECONCILIATION ONLY.
 *
 * Triggered every 5 minutes by the GitHub Actions workflow
 * .github/workflows/social-publish.yml (Vercel Hobby only allows daily crons;
 * vercel.json keeps a once-a-day safety sweep at 14:00 UTC).
 *
 * Product rule (Joseph, 2026-09-01; Google added 2026-09-03): Skooped never
 * publishes. The only content writes are the scheduled posts the approve
 * route creates on /m/<token> (Facebook held via published=false, Google held
 * via LocalPost.scheduledTime); the vendor publishes at the chosen time after
 * Joseph has had the post in Business Suite Planner / Business Profile
 * Manager. So this tick creates nothing and publishes nothing — it never
 * calls a Meta or Google create/publish endpoint. It only:
 *
 *   0. Sweeps rows stuck in 'publishing' for 15+ minutes (an approve request
 *      that was killed mid-call) to 'failed' so Retry shows on /m.
 *   1. For Facebook rows Meta is holding ('scheduled') whose time has passed
 *      (+60 s grace): reads the post back. Published → 'published' +
 *      published_at + capture_uploads.posted_at stamped. Gone from Meta
 *      (deleted in Planner) → 'cancelled'. Otherwise left 'scheduled' and
 *      checked again next tick.
 *   2. Same pass for Google rows ('scheduled'): LIVE → 'published' + stamp
 *      (gbp:<name>); gone (deleted in Business Profile Manager) →
 *      'cancelled'; otherwise left 'scheduled'.
 *
 * Instagram rows (legacy) and legacy 'approved' rows are never touched.
 *
 * Auth: Bearer CRON_SECRET or SOCIAL_CRON_SECRET only (the x-vercel-cron header is spoofable).
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  ops.info('system', 'cron.social_publish.started', 'started')
  const store = createSupabaseStore(createAdminClient())

  try {
    const result = await runSocialReconcile({
      store,
      now: new Date(),
      onError: (message, postId) =>
        ops.error('system', 'cron.social_publish.row', message, 'unknown', { metadata: { postId } }),
    })
    const counts = {
      stale: result.stale.length,
      fbWentLive: result.fbWentLive.length,
      fbMissing: result.fbMissing.length,
      fbHeld: result.fbHeld.length,
      googleWentLive: result.googleWentLive.length,
      googleMissing: result.googleMissing.length,
      googleHeld: result.googleHeld.length,
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
