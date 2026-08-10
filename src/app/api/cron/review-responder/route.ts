import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'
import { getGbpAccessToken, resolveLocation } from '@/lib/gbp/client'
import { listAllReviews, starValue, updateReply, type GbpReview } from '@/lib/gbp/reviews'
import { draftReply } from '@/lib/gbp/draft'
import { sendEscalation } from '@/lib/gbp/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/review-responder — every 6h (vercel.json)
 *
 * The autonomy contract (hq/GBP-AUTOMATION-SPEC-2026-08.md, locked 2026-08-09):
 *   - First sync per location classifies every pre-existing review:
 *     has an owner reply → 'locked' (NEVER edited, overwritten, or deleted);
 *     unreplied → 'retro' (4-5★ queue for paced posting, ≤3★ held).
 *   - New (live) reviews: 4-5★ draft + auto-post; 3★ draft + hold;
 *     1-2★ draft + hold + IMMEDIATE urgent email.
 *   - Retro posting is paced (retro_weekly_cap per trailing 7 days per
 *     location) and only runs where retro_enabled.
 *   - Retro NEGATIVES (policy approved 2026-08-10): a <=3★ retro review older
 *     than RETRO_NEGATIVE_MIN_AGE_DAYS, on a location with
 *     retro_negative_enabled (one-time blanket client consent), gets an
 *     "open door" reply (nothing admitted, no past outreach claimed, phone
 *     call is the only offer) and joins the paced retro queue. A run never
 *     publishes negatives and positives together. Everywhere the flag is off,
 *     behavior is unchanged: held forever.
 *   - GBP_DRY_RUN=1: full pipeline, drafts stored, NOTHING posted to Google —
 *     except locations with live_replies = true, which run the live posting
 *     path even under the global dry-run (per-location early-live switch,
 *     Joseph 2026-08-10; first use: Skooped's own profile).
 *
 * State machine per review row (see the migration for the state list):
 *   pending      → drafted on a later run once budget allows (stored
 *                  classification wins — retro is never reclassified live)
 *   drafted      → posted by the next non-dry run (also the crash-safe
 *                  pre-post record in the live path: row first, PUT second)
 *   retro_queued → posted by publishRetroBatch inside the pacing cap
 *   held/failed  → terminal until Joseph acts (digest surfaces them)
 *   locked       → an owner reply the system did not write. No code path
 *                  posts over it; any unposted row is re-locked the moment a
 *                  fresh sync shows an owner reply arrived underneath it.
 *
 * Auth: Bearer CRON_SECRET only (the x-vercel-cron header is spoofable).
 */

function verifyCron(request: NextRequest): boolean {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return process.env.NODE_ENV === 'development'
  return secret === cronSecret
}

// Bound drafting work per run so the route stays inside maxDuration; the 6h
// cadence drains the remainder via 'pending' rows.
const MAX_DRAFTS_PER_RUN = 12

// A retro negative younger than this is still "fresh": it stays held for the
// client's account of the facts. Older, the open-door policy applies.
const RETRO_NEGATIVE_MIN_AGE_DAYS = 60

/** True only when the review's create time is known AND older than the
 *  threshold — an unknown age is treated as fresh (conservative: held). */
function isRetroNegativeAge(createTime: string | null | undefined): boolean {
  if (!createTime) return false
  const created = Date.parse(createTime)
  if (Number.isNaN(created)) return false
  return Date.now() - created > RETRO_NEGATIVE_MIN_AGE_DAYS * 24 * 60 * 60 * 1000
}

interface LocationRow {
  id: string
  client_key: string
  display_name: string
  gbp_account_name: string | null
  gbp_location_name: string | null
  brand_voice: string
  active: boolean
  retro_enabled: boolean
  retro_weekly_cap: number
  first_synced_at: string | null
  live_replies: boolean
  retro_negative_enabled: boolean
  public_phone: string | null
}

interface ReplyRow {
  id: string
  review_name: string
  classification: string
  state: string
  escalated: boolean
  reply_text: string | null
}

interface LocSummary {
  client_key: string
  new_locked: number
  relocked: number
  retro_queued: number
  posted: number
  held: number
  pending: number
  escalated: number
  retro_posted: number
  failed: number
  live: boolean
  errors: string[]
}

interface RunCtx {
  supabase: ReturnType<typeof createAdminClient>
  accessToken: string
  dryRun: boolean
  location: LocationRow
  recentReplies: string[]
  summary: LocSummary
  budget: { used: number }
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const dryRun = process.env.GBP_DRY_RUN === '1'
  ops.info('system', 'cron.review_responder.started', 'started', {
    metadata: { dry_run: dryRun },
  })

  const { data: locations, error: locError } = await supabase
    .from('gbp_managed_locations')
    .select('*')
    .eq('active', true)

  if (locError) {
    ops.error('system', 'cron.review_responder', locError.message, 'unknown')
    await flush()
    return NextResponse.json({ error: 'Failed to load locations' }, { status: 500 })
  }

  const budget = { used: 0 }
  const summaries: LocSummary[] = []

  for (const location of (locations ?? []) as LocationRow[]) {
    // Per-location effective dry-run: the global env gates everything EXCEPT
    // locations Joseph has explicitly flipped live via live_replies.
    const locDryRun = dryRun && !location.live_replies
    const summary: LocSummary = {
      client_key: location.client_key,
      new_locked: 0,
      relocked: 0,
      retro_queued: 0,
      posted: 0,
      held: 0,
      pending: 0,
      escalated: 0,
      retro_posted: 0,
      failed: 0,
      live: !locDryRun,
      errors: [],
    }
    summaries.push(summary)

    try {
      const accessToken = await getGbpAccessToken()

      let locationName = location.gbp_location_name
      if (!locationName) {
        const resolved = await resolveLocation(accessToken, location.display_name)
        if (!resolved) {
          summary.errors.push('location not found in Business Profile (check Manager access)')
          continue
        }
        locationName = resolved.locationName
        const { error } = await supabase
          .from('gbp_managed_locations')
          .update({
            gbp_account_name: resolved.accountName,
            gbp_location_name: resolved.locationName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', location.id)
        if (error) throw new Error(`caching location name failed: ${error.message}`)
      }

      const reviews = await listAllReviews(locationName, accessToken)
      const firstSync = !location.first_synced_at

      const { data: existingRows, error: rowsError } = await supabase
        .from('gbp_review_replies')
        .select('id, review_name, classification, state, escalated, reply_text')
        .eq('location_id', location.id)
      if (rowsError) throw new Error(`loading known reviews failed: ${rowsError.message}`)
      const known = new Map(((existingRows ?? []) as ReplyRow[]).map((r) => [r.review_name, r]))

      // Anti-template context: what is already public on this profile —
      // system-posted replies plus hand-written locked ones.
      const { data: recentRows } = await supabase
        .from('gbp_review_replies')
        .select('reply_text')
        .eq('location_id', location.id)
        .in('state', ['posted', 'locked'])
        .not('reply_text', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(10)
      const recentReplies = ((recentRows ?? []) as { reply_text: string }[]).map(
        (r) => r.reply_text
      )

      const ctx: RunCtx = {
        supabase,
        accessToken,
        dryRun: locDryRun,
        location,
        recentReplies,
        summary,
        budget,
      }

      for (const review of reviews) {
        const existing = known.get(review.name)
        if (existing) {
          await handleKnownReview(ctx, review, existing)
        } else {
          await handleNewReview(ctx, review, firstSync)
        }
      }

      if ((location.retro_enabled || location.retro_negative_enabled) && !locDryRun) {
        summary.retro_posted = await publishRetroBatch(ctx)
      }

      if (firstSync) {
        if (summary.errors.length > 0) {
          // A failed row-write during first sync means a pre-existing review
          // may have no row; committing first_synced_at now would reclassify
          // it 'live' next run (auto-post, unpaced — or a spurious urgent
          // escalation for a stale review). Retry the whole first sync
          // instead: existing rows are skipped via the known map, so only
          // the failed ones are re-attempted.
          ops.warn('system', 'cron.review_responder.first_sync_incomplete', 'failed', {
            metadata: { client_key: location.client_key, errors: summary.errors },
          })
        } else {
          const { error } = await supabase
            .from('gbp_managed_locations')
            .update({
              first_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', location.id)
          if (error) throw new Error(`setting first_synced_at failed: ${error.message}`)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      summary.errors.push(msg)
      console.error(`[review-responder] ${location.client_key}:`, msg)
    }
  }

  ops.info('system', 'cron.review_responder.completed', 'completed', {
    metadata: { dry_run: dryRun, drafts_used: budget.used, locations: summaries },
  })
  await flush()

  return NextResponse.json({ dry_run: dryRun, drafts_used: budget.used, locations: summaries })
}

/** States where our reply is not yet on Google, so an owner reply arriving
 *  underneath must permanently lock the row. */
const UNPOSTED_STATES = ['pending', 'held', 'retro_queued', 'drafted', 'failed']

async function handleKnownReview(ctx: RunCtx, review: GbpReview, existing: ReplyRow) {
  const { supabase, summary } = ctx

  // Never-touch invariant: if an owner reply appeared under an unposted row
  // (Andy answered it himself in Business Profile Manager), lock it — the
  // stored draft must never post over a hand-written reply. 'posted' rows are
  // exempt: the reviewReply there is our own.
  if (review.reviewReply?.comment && UNPOSTED_STATES.includes(existing.state)) {
    const { error } = await supabase
      .from('gbp_review_replies')
      .update({
        classification: 'locked',
        state: 'locked',
        reply_text: review.reviewReply.comment,
        digested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) summary.errors.push(`re-lock failed for ${review.name}: ${error.message}`)
    else summary.relocked++
    return
  }

  // Budget-stalled rows: draft them now, using the STORED classification —
  // recomputing from firstSync would reclassify retro reviews as live on the
  // second run and auto-post them, bypassing retro pacing. The draft budget
  // applies here too, or a large pending backlog would blow past maxDuration.
  if (existing.state === 'pending') {
    if (ctx.budget.used >= MAX_DRAFTS_PER_RUN) return // stays pending for the next run
    await draftAndRoute(ctx, review, existing.classification as 'live' | 'retro', existing)
    return
  }

  // Dry-run leftovers: a lint-passed draft that never posted. A non-dry run
  // posts it (the owner-reply lock above already ran, so this can't stomp a
  // hand-written reply).
  if (existing.state === 'drafted' && !ctx.dryRun && existing.reply_text) {
    await postExistingDraft(ctx, existing)
    return
  }

  // Held RETRO negatives on a location that has since gained blanket consent:
  // redraft in open-door mode and queue (draftAndRoute re-detects the
  // retro-negative path and replaces the held draft in place). Live held rows
  // are untouched — the human gate on fresh negatives is permanent.
  if (
    existing.state === 'held' &&
    existing.classification === 'retro' &&
    ctx.location.retro_negative_enabled
  ) {
    const rating = starValue(review)
    if (rating > 0 && rating <= 3 && isRetroNegativeAge(review.createTime)) {
      if (ctx.budget.used >= MAX_DRAFTS_PER_RUN) return // retried next run
      await draftAndRoute(ctx, review, 'retro', existing)
      return
    }
  }

  // posted / held / retro_queued / failed / locked: nothing to do this run.
}

async function handleNewReview(ctx: RunCtx, review: GbpReview, firstSync: boolean) {
  const { supabase, location, summary } = ctx

  if (review.reviewReply?.comment) {
    // Pre-existing owner reply — permanently locked, never touched.
    const { error } = await supabase.from('gbp_review_replies').insert({
      location_id: location.id,
      review_name: review.name,
      reviewer_name: review.reviewer?.displayName ?? null,
      star_rating: starValue(review) || null,
      review_comment: review.comment ?? null,
      review_create_time: review.createTime ?? null,
      review_update_time: review.updateTime ?? null,
      classification: 'locked',
      state: 'locked',
      reply_text: review.reviewReply.comment,
      digested_at: new Date().toISOString(), // nothing to report
    })
    if (error) summary.errors.push(`locked insert failed for ${review.name}: ${error.message}`)
    else summary.new_locked++
    return
  }

  const rating = starValue(review)
  const classification: 'live' | 'retro' = firstSync ? 'retro' : 'live'

  if (ctx.budget.used >= MAX_DRAFTS_PER_RUN) {
    // Out of draft budget: record as 'pending' so the next run drafts it.
    // A live 1-2★ still escalates NOW — the urgent email must not wait 6h.
    const escalate = classification === 'live' && rating > 0 && rating <= 2
    let escalationSent = false
    if (escalate) {
      escalationSent = await sendEscalation({
        locationName: location.display_name,
        reviewerName: review.reviewer?.displayName ?? null,
        starRating: rating,
        comment: review.comment ?? null,
        draftReply: null,
      })
      if (escalationSent) summary.escalated++
    }
    const { error } = await supabase.from('gbp_review_replies').insert({
      location_id: location.id,
      review_name: review.name,
      reviewer_name: review.reviewer?.displayName ?? null,
      star_rating: rating || null,
      review_comment: review.comment ?? null,
      review_create_time: review.createTime ?? null,
      review_update_time: review.updateTime ?? null,
      classification,
      state: 'pending',
      escalated: escalationSent,
      error: 'draft budget exhausted this run — queued for the next run',
    })
    if (error) summary.errors.push(`pending insert failed for ${review.name}: ${error.message}`)
    else summary.pending++
    return
  }

  await draftAndRoute(ctx, review, classification, null)
}

/**
 * Draft a reply for a review and route it by rating/classification. When
 * `existing` is set (a pending row), the row is updated in place; otherwise a
 * new row is inserted. The live 4-5★ path is crash-safe: the row is written
 * as 'drafted' FIRST, then the PUT, then the flip to 'posted' — a crash
 * between the steps leaves a 'drafted' row the next run posts, never an
 * unrecorded live reply.
 */
async function draftAndRoute(
  ctx: RunCtx,
  review: GbpReview,
  classification: 'live' | 'retro',
  existing: ReplyRow | null
) {
  const { supabase, location, summary } = ctx
  const rating = starValue(review)

  // Open-door path (policy 2026-08-10): old retro negative + client consent.
  // Decided BEFORE drafting because it changes the drafting rules entirely.
  const retroNegative =
    classification === 'retro' &&
    rating > 0 &&
    rating <= 3 &&
    location.retro_negative_enabled &&
    isRetroNegativeAge(review.createTime)

  ctx.budget.used++
  const draft = await draftReply({
    brandVoice: location.brand_voice,
    reviewerName: review.reviewer?.displayName ?? null,
    starRating: rating || 5,
    comment: review.comment ?? null,
    recentReplies: ctx.recentReplies,
    mode: retroNegative ? 'retro_negative' : 'standard',
    publicPhone: location.public_phone,
  })

  const base = {
    location_id: location.id,
    review_name: review.name,
    reviewer_name: review.reviewer?.displayName ?? null,
    star_rating: rating || null,
    review_comment: review.comment ?? null,
    review_create_time: review.createTime ?? null,
    review_update_time: review.updateTime ?? null,
    classification,
    reply_text: draft.text,
    error: null as string | null,
    digested_at: null as string | null,
    updated_at: new Date().toISOString(),
  }

  const writeRow = async (fields: Record<string, unknown>): Promise<string | null> => {
    if (existing) {
      const { error } = await supabase
        .from('gbp_review_replies')
        .update({ ...base, ...fields })
        .eq('id', existing.id)
      return error ? error.message : null
    }
    const { error } = await supabase.from('gbp_review_replies').insert({ ...base, ...fields })
    return error ? error.message : null
  }

  if (!draft.text) {
    // The immediate-escalation guarantee is draft-independent: a live 1-2★
    // whose draft fails (lint twice, or a model refusal — likeliest exactly
    // on abusive reviews) must still alert Joseph NOW.
    const escalateFailed =
      classification === 'live' && rating > 0 && rating <= 2 && !(existing?.escalated ?? false)
    let failedEscalationSent = existing?.escalated ?? false
    if (escalateFailed) {
      failedEscalationSent = await sendEscalation({
        locationName: location.display_name,
        reviewerName: review.reviewer?.displayName ?? null,
        starRating: rating,
        comment: review.comment ?? null,
        draftReply: null,
      })
      if (failedEscalationSent) summary.escalated++
      else summary.errors.push(`escalation email failed for ${review.name}`)
    }
    const err = await writeRow({
      state: 'failed',
      escalated: failedEscalationSent,
      error: `lint: ${draft.violations.join('; ')}`,
    })
    if (err) summary.errors.push(`failed-row write for ${review.name}: ${err}`)
    summary.failed++
    return
  }

  // Every accepted draft joins the anti-template context immediately, so the
  // other drafts produced in this same run vary against it (queued and
  // dry-run drafts are as much "public voice in flight" as posted ones).
  ctx.recentReplies.unshift(draft.text)

  if (rating >= 4) {
    if (classification === 'retro') {
      const err = await writeRow({ state: 'retro_queued' })
      if (err) summary.errors.push(`retro-queue write for ${review.name}: ${err}`)
      else summary.retro_queued++
      return
    }
    // Live 4-5★: record first ('drafted'), then post, then flip to 'posted'.
    const err = await writeRow({ state: 'drafted' })
    if (err) {
      // Do NOT post without a record — an unrecorded live reply would be
      // reclassified as someone else's ('locked') on the next sync.
      summary.errors.push(`draft record write for ${review.name}: ${err} — post skipped`)
      return
    }
    if (ctx.dryRun) {
      summary.posted++ // reported as would-have-posted in the digest
      return
    }
    try {
      await updateReply(review.name, draft.text, ctx.accessToken)
    } catch (postErr: unknown) {
      const msg = postErr instanceof Error ? postErr.message : 'Unknown error'
      await supabase
        .from('gbp_review_replies')
        .update({ error: `post failed (will retry as drafted): ${msg}` })
        .eq('review_name', review.name)
      summary.errors.push(`post failed for ${review.name}: ${msg}`)
      return
    }
    const { error: flipErr } = await supabase
      .from('gbp_review_replies')
      .update({ state: 'posted', posted_at: new Date().toISOString(), error: null })
      .eq('review_name', review.name)
    if (flipErr) summary.errors.push(`posted-flip write for ${review.name}: ${flipErr.message}`)
    summary.posted++
    return
  }

  // Old retro negatives under blanket consent: queue the open-door reply,
  // paced like every other retro item (publishRetroBatch enforces the cap and
  // never mixes negatives with positives in one run). No escalation: retro
  // reviews never page anyone.
  if (retroNegative) {
    const err = await writeRow({ state: 'retro_queued' })
    if (err) summary.errors.push(`retro-negative queue write for ${review.name}: ${err}`)
    else summary.retro_queued++
    return
  }

  // ≤3★ (and star-only unknowns): ALWAYS held — the permanent human gate.
  // Live 1-2★ escalate immediately; escalated=true only when the email SENT
  // (the digest tags escalated rows "you were alerted" — keep that truthful).
  const escalate =
    classification === 'live' && rating > 0 && rating <= 2 && !(existing?.escalated ?? false)
  let escalationSent = existing?.escalated ?? false
  if (escalate) {
    escalationSent = await sendEscalation({
      locationName: location.display_name,
      reviewerName: review.reviewer?.displayName ?? null,
      starRating: rating,
      comment: review.comment ?? null,
      draftReply: draft.text,
    })
    if (escalationSent) summary.escalated++
    else summary.errors.push(`escalation email failed for ${review.name}`)
  }
  const err = await writeRow({ state: 'held', escalated: escalationSent })
  if (err) summary.errors.push(`held write for ${review.name}: ${err}`)
  else summary.held++
}

/** Post a lint-passed draft left over from a dry run (state 'drafted'). */
async function postExistingDraft(ctx: RunCtx, existing: ReplyRow) {
  const { supabase, summary } = ctx
  try {
    await updateReply(existing.review_name, existing.reply_text!, ctx.accessToken)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await supabase
      .from('gbp_review_replies')
      .update({ error: `post failed (will retry as drafted): ${msg}` })
      .eq('id', existing.id)
    summary.errors.push(`post of stored draft failed for ${existing.review_name}: ${msg}`)
    return
  }
  const { error } = await supabase
    .from('gbp_review_replies')
    .update({
      state: 'posted',
      posted_at: new Date().toISOString(),
      digested_at: null, // resurface in the next digest as posted
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
  if (error) summary.errors.push(`posted-flip for ${existing.review_name}: ${error.message}`)
  ctx.recentReplies.unshift(existing.reply_text!)
  summary.posted++
}

/** Paced retro publishing — retro_weekly_cap per trailing 7 days per location.
 *  Only rows still in 'retro_queued' publish; handleKnownReview has already
 *  re-locked any queued row whose review acquired an owner reply this run.
 *  Positives publish only under retro_enabled, negatives (<=3★) only under
 *  retro_negative_enabled, and one run never mixes the two kinds — a
 *  complaint reply sandwiched between same-day thank-yous is a tell. */
async function publishRetroBatch(ctx: RunCtx): Promise<number> {
  const { supabase, location, summary } = ctx
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('gbp_review_replies')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', location.id)
    .eq('classification', 'retro')
    .eq('state', 'posted')
    .gte('posted_at', weekAgo)

  const budget = Math.max(0, location.retro_weekly_cap - (count ?? 0))
  if (budget === 0) return 0

  const { data: queued } = await supabase
    .from('gbp_review_replies')
    .select('id, review_name, reply_text, star_rating, digested_at')
    .eq('location_id', location.id)
    .eq('state', 'retro_queued')
    .order('review_create_time', { ascending: true })
    .limit(budget * 2) // headroom: some rows may be filtered by kind below

  let published = 0
  let runKind: 'positive' | 'negative' | null = null
  for (const row of (queued ?? []) as {
    id: string
    review_name: string
    reply_text: string
    star_rating: number | null
    digested_at: string | null
  }[]) {
    if (!row.reply_text) continue
    if (published >= budget) break
    const kind: 'positive' | 'negative' =
      row.star_rating != null && row.star_rating <= 3 ? 'negative' : 'positive'
    if (kind === 'positive' && !location.retro_enabled) continue
    if (kind === 'negative' && !location.retro_negative_enabled) continue
    // A negative never publishes before it has appeared in at least one
    // digest (digested_at set) — Joseph gets a full cycle to redline it.
    if (kind === 'negative' && !row.digested_at) continue
    if (runKind === null) runKind = kind
    else if (kind !== runKind) continue // other kind waits for its own run
    try {
      await updateReply(row.review_name, row.reply_text, ctx.accessToken)
      const { error } = await supabase
        .from('gbp_review_replies')
        .update({
          state: 'posted',
          posted_at: new Date().toISOString(),
          digested_at: null, // resurface in the next digest as posted
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (error) summary.errors.push(`retro posted-flip for ${row.review_name}: ${error.message}`)
      ctx.recentReplies.unshift(row.reply_text)
      published++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      const { error } = await supabase
        .from('gbp_review_replies')
        .update({ error: `retro post failed (stays queued): ${msg}`, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) summary.errors.push(`retro error write for ${row.review_name}: ${error.message}`)
      summary.errors.push(`retro post failed for ${row.review_name}: ${msg}`)
    }
  }
  return published
}
