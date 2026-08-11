import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'
import { sendEmail, escapeHtml } from '@/lib/gbp/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/gbp-digest — daily (vercel.json)
 *
 * Joseph's glance-and-intervene loop (spec §2): one email covering everything
 * the automation did since the last digest — replies posted (autonomous
 * 4-5★), drafts held for him (≤3★, star-only, lint failures), dry-run
 * results, and GBP posts published. Rows are marked digested_at so each item
 * is reported exactly once. ALWAYS sends (Joseph's 2026-08-11 rule): an empty
 * day gets a one-line "all quiet" heartbeat, so a missing email always means
 * something is broken, never that nothing happened.
 */

function verifyCron(request: NextRequest): boolean {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return process.env.NODE_ENV === 'development'
  return secret === cronSecret
}

interface DigestReplyRow {
  id: string
  state: string
  escalated: boolean
  reviewer_name: string | null
  star_rating: number | null
  review_comment: string | null
  reply_text: string | null
  error: string | null
  gbp_managed_locations: { display_name: string } | null
}

interface DigestPostRow {
  id: string
  state: string
  batch: string
  post_seq: number
  body: string
  error: string | null
  gbp_managed_locations: { display_name: string } | null
}

function replyRowHtml(r: DigestReplyRow): string {
  const loc = r.gbp_managed_locations?.display_name ?? 'Unknown location'
  const stars = r.star_rating ? `${r.star_rating}★` : 'star-only'
  const review = r.review_comment
    ? escapeHtml(r.review_comment.slice(0, 300))
    : '<em>(no text)</em>'
  const reply = r.reply_text ? escapeHtml(r.reply_text) : '<em>(no draft)</em>'
  const tag =
    r.state === 'posted'
      ? '<span style="color:#1a7f37">POSTED</span>'
      : r.state === 'drafted'
        ? '<span style="color:#9a6700">DRAFTED — posts on the next live run</span>'
        : r.state === 'retro_queued'
          ? '<span style="color:#0550ae">QUEUED (retro, paced)</span>'
        : r.state === 'failed'
          ? `<span style="color:#B3261E">FAILED (${escapeHtml(r.error ?? '')})</span>`
          : r.escalated
            ? '<span style="color:#B3261E">HELD — urgent, you were alerted</span>'
            : r.star_rating != null && r.star_rating <= 2
              ? '<span style="color:#B3261E">HELD — URGENT, the alert email FAILED; this is your first notice</span>'
              : '<span style="color:#9a6700">HELD for you</span>'
  return `
  <tr><td style="padding:10px 12px;border-bottom:1px solid #eee">
    <strong>${escapeHtml(loc)}</strong> · ${escapeHtml(r.reviewer_name ?? 'Anonymous')} · ${stars} · ${tag}
    <br><span style="color:#666;font-size:13px">${review}</span>
    <br><span style="color:#333;font-size:13px">↳ ${reply}</span>
  </td></tr>`
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  ops.info('system', 'cron.gbp_digest.started', 'started')

  const { data: replies, error: repliesError } = await supabase
    .from('gbp_review_replies')
    .select(
      'id, state, escalated, reviewer_name, star_rating, review_comment, reply_text, error, gbp_managed_locations(display_name)'
    )
    .is('digested_at', null)
    .in('state', ['posted', 'held', 'drafted', 'retro_queued', 'failed'])
    .order('created_at', { ascending: true })

  const { data: posts, error: postsError } = await supabase
    .from('gbp_scheduled_posts')
    .select('id, state, batch, post_seq, body, error, gbp_managed_locations(display_name)')
    .is('digested_at', null)
    .in('state', ['published', 'failed', 'publishing'])
    .order('published_at', { ascending: true })

  if (repliesError || postsError) {
    // A DB error must not read as "quiet day" — fail loudly and let the next
    // run retry (nothing was stamped).
    const msg = repliesError?.message ?? postsError?.message ?? 'unknown'
    ops.error('system', 'cron.gbp_digest.query', msg, 'unknown')
    await flush()
    return NextResponse.json({ error: `digest query failed: ${msg}` }, { status: 500 })
  }

  // Standing-condition check (reported daily, never stamped): approved posts
  // past their date that the posts cron keeps skipping — an unresolved
  // location or a deactivated one stalls silently otherwise.
  const chicagoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(
    new Date()
  )
  const { data: overdue } = await supabase
    .from('gbp_scheduled_posts')
    .select('id, state, batch, post_seq, body, error, gbp_managed_locations(display_name)')
    .eq('state', 'approved')
    .lt('publish_date', chicagoToday)
    .order('publish_date', { ascending: true })

  const replyRows = (replies ?? []) as unknown as DigestReplyRow[]
  const postRows = (posts ?? []) as unknown as DigestPostRow[]
  const overdueRows = (overdue ?? []) as unknown as DigestPostRow[]

  if (replyRows.length === 0 && postRows.length === 0 && overdueRows.length === 0) {
    // Empty day: send the heartbeat anyway (Joseph, 2026-08-11) — the email's
    // absence must always be a breakage signal, never ambiguity.
    const quietHtml = `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
    <h2 style="color:#361C24">GBP daily digest</h2>
    <p style="color:#333">All quiet. No new reviews, nothing held, no posts published in the last 24 hours. The automation ran normally across all managed profiles.</p>
  </div>`
    const quietSent = await sendEmail('GBP digest — all quiet, system healthy', quietHtml)
    if (!quietSent) {
      ops.warn('system', 'cron.gbp_digest.email_failed', 'failed', {
        metadata: { replies: 0, posts: 0 },
      })
    }
    ops.info('system', 'cron.gbp_digest.completed', quietSent ? 'completed' : 'failed', {
      metadata: { replies: 0, posts: 0, email_sent: quietSent },
    })
    await flush()
    return NextResponse.json({ replies: 0, posts: 0, overdue: 0, email_sent: quietSent })
  }

  const posted = replyRows.filter((r) => r.state === 'posted' || r.state === 'drafted')
  const retroQueued = replyRows.filter((r) => r.state === 'retro_queued')
  const held = replyRows.filter((r) => r.state === 'held')
  const failed = replyRows.filter((r) => r.state === 'failed')

  const sections: string[] = []
  if (posted.length > 0) {
    sections.push(
      `<h3 style="color:#361C24">Replies posted (${posted.length})</h3>
      <table style="width:100%;border-collapse:collapse">${posted.map(replyRowHtml).join('')}</table>`
    )
  }
  if (held.length > 0) {
    sections.push(
      `<h3 style="color:#9a6700">Held for you (${held.length})</h3>
      <p style="color:#666;font-size:13px">Post via Business Profile Manager, edit the draft, or tell a session what to change.</p>
      <table style="width:100%;border-collapse:collapse">${held.map(replyRowHtml).join('')}</table>`
    )
  }
  if (retroQueued.length > 0) {
    sections.push(
      `<h3 style="color:#0550ae">Retro queue (${retroQueued.length})</h3>
      <p style="color:#666;font-size:13px">Drafted replies to old unreplied reviews, publishing paced (~cap/week) once retro is live. Redline now if any read wrong.</p>
      <table style="width:100%;border-collapse:collapse">${retroQueued.map(replyRowHtml).join('')}</table>`
    )
  }
  if (failed.length > 0) {
    sections.push(
      `<h3 style="color:#B3261E">Failed drafts (${failed.length})</h3>
      <table style="width:100%;border-collapse:collapse">${failed.map(replyRowHtml).join('')}</table>`
    )
  }
  if (overdueRows.length > 0) {
    const overdueHtml = overdueRows
      .map((p) => {
        const loc = p.gbp_managed_locations?.display_name ?? 'Unknown location'
        return `<tr><td style="padding:10px 12px;border-bottom:1px solid #eee">
          <strong>${escapeHtml(loc)}</strong> · ${escapeHtml(p.batch)} #${p.post_seq}
          <br><span style="color:#666;font-size:13px">${escapeHtml(p.body.slice(0, 160))}…</span>
        </td></tr>`
      })
      .join('')
    sections.push(
      `<h3 style="color:#B3261E">Overdue posts still waiting (${overdueRows.length})</h3>
      <p style="color:#666;font-size:13px">Past their publish date but the posts cron keeps skipping them — usually the location is unresolved (run the review responder once) or deactivated. Repeats daily until fixed.</p>
      <table style="width:100%;border-collapse:collapse">${overdueHtml}</table>`
    )
  }
  if (postRows.length > 0) {
    const postHtml = postRows
      .map((p) => {
        const loc = p.gbp_managed_locations?.display_name ?? 'Unknown location'
        const tag =
          p.state === 'published'
            ? '<span style="color:#1a7f37">PUBLISHED</span>'
            : p.state === 'publishing'
              ? '<span style="color:#B3261E">STUCK mid-publish since a prior run — check Business Profile Manager before re-approving</span>'
              : `<span style="color:#B3261E">FAILED (${escapeHtml(p.error ?? '')})</span>`
        return `<tr><td style="padding:10px 12px;border-bottom:1px solid #eee">
          <strong>${escapeHtml(loc)}</strong> · ${escapeHtml(p.batch)} #${p.post_seq} · ${tag}
          <br><span style="color:#666;font-size:13px">${escapeHtml(p.body.slice(0, 200))}…</span>
        </td></tr>`
      })
      .join('')
    sections.push(
      `<h3 style="color:#361C24">GBP posts (${postRows.length})</h3>
      <table style="width:100%;border-collapse:collapse">${postHtml}</table>`
    )
  }

  const html = `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
    <h2 style="color:#361C24">GBP daily digest</h2>
    <p style="color:#666;font-size:13px">Everything the review/post automation did since the last digest. Corrections: tell a session, or edit directly in Business Profile Manager. Pattern-level fixes go in the persona files.</p>
    ${sections.join('')}
  </div>`

  const subjectBits: string[] = []
  if (posted.length > 0) subjectBits.push(`${posted.length} posted`)
  if (held.length > 0) subjectBits.push(`${held.length} held`)
  if (retroQueued.length > 0) subjectBits.push(`${retroQueued.length} retro queued`)
  if (failed.length > 0) subjectBits.push(`${failed.length} failed`)
  if (postRows.length > 0) subjectBits.push(`${postRows.length} GBP posts`)
  if (overdueRows.length > 0) subjectBits.push(`${overdueRows.length} OVERDUE`)

  const emailSent = await sendEmail(`GBP digest — ${subjectBits.join(', ')}`, html)

  // Only mark rows reported when the email actually went out — a Resend
  // failure must NOT permanently drop items from the oversight loop; they
  // simply ride the next digest.
  if (emailSent) {
    const now = new Date().toISOString()
    const { error: replyErr } = await supabase
      .from('gbp_review_replies')
      .update({ digested_at: now })
      .in('id', replyRows.map((r) => r.id))
    if (replyErr) ops.error('system', 'cron.gbp_digest.mark_replies', replyErr.message, 'unknown')
    const { error: postErr } = await supabase
      .from('gbp_scheduled_posts')
      .update({ digested_at: now })
      .in('id', postRows.map((p) => p.id))
    if (postErr) ops.error('system', 'cron.gbp_digest.mark_posts', postErr.message, 'unknown')
  } else {
    ops.warn('system', 'cron.gbp_digest.email_failed', 'failed', {
      metadata: { replies: replyRows.length, posts: postRows.length },
    })
  }

  ops.info('system', 'cron.gbp_digest.completed', 'completed', {
    metadata: { replies: replyRows.length, posts: postRows.length, email_sent: emailSent },
  })
  await flush()

  return NextResponse.json({
    replies: replyRows.length,
    posts: postRows.length,
    overdue: overdueRows.length,
    email_sent: emailSent,
  })
}
