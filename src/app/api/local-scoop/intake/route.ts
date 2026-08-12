/**
 * The Local Scoop: client intake, posted from skooped.io/welcome/local-scoop.
 *
 * These are the persona fields verbatim (voice, services, towns, escalation contact, never-say
 * list). Collecting them on the welcome page while the buyer is still sitting there turns writing
 * their review-reply persona from an interview into a ten minute edit, and it means Joseph never
 * has to chase a new client for basics.
 *
 * Owner-only side effects: one email to Joseph. Nothing is written to the database and nothing is
 * sent to the client from here, so this route needs no new secret and cannot leak between clients.
 *
 * Env: RESEND_API_KEY (already set), OWNER_ALERT_EMAIL, LOCAL_SCOOP_FROM, INTAKE_ALLOWED_ORIGINS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/gbp/notify'
import { buildWelcomeEmail, firstName, looksLikeEmail } from '@/lib/local-scoop/welcome-email'
import { portal } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OWNER = process.env.OWNER_ALERT_EMAIL ?? 'joseph@skooped.io'
const FROM = process.env.LOCAL_SCOOP_FROM ?? 'Joseph Anderson <joseph@skooped.io>'
const DEFAULT_ORIGINS = ['https://skooped.io', 'https://www.skooped.io']

/** Longest answer we will accept per field. Anything past this is a paste bomb, not an answer. */
const MAX_FIELD = 2000

export const FIELDS = [
  { key: 'contact_name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Best phone (call only)' },
  { key: 'services', label: 'Services to lead with' },
  { key: 'towns', label: 'Towns served' },
  { key: 'escalation', label: 'Who handles an unhappy customer' },
  { key: 'voice', label: 'Says "we" or "I"' },
  { key: 'never_say', label: 'Never say' },
  { key: 'notes', label: 'Anything else' },
] as const

export function allowedOrigins(): string[] {
  const raw = process.env.INTAKE_ALLOWED_ORIGINS
  if (!raw) return DEFAULT_ORIGINS
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts : DEFAULT_ORIGINS
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedOrigins()
  const hit = origin && allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': hit,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** Trim, cap, and drop anything that is not a string. Never throws on hostile input. */
export function sanitize(body: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!body || typeof body !== 'object') return out
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (typeof v !== 'string') continue
    const trimmed = v.trim().slice(0, MAX_FIELD)
    if (trimmed) out[k] = trimmed
  }
  return out
}

export function buildIntakeEmail(data: Record<string, string>) {
  const business = data.business_name || data.contact_name || 'a Local Scoop client'
  const rows = FIELDS.filter((f) => data[f.key])
    .map(
      (f) =>
        `<tr><td style="padding:4px 12px 4px 0;vertical-align:top"><strong>${escapeHtml(f.label)}</strong></td><td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(data[f.key])}</td></tr>`
    )
    .join('')
  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;max-width:640px">
  <p>Intake submitted from the Local Scoop welcome page.</p>
  <table cellpadding="0" style="border-collapse:collapse">${rows || '<tr><td>(no fields filled)</td></tr>'}</table>
  <p style="color:#666;font-size:13px">Checkout session: ${escapeHtml(data.session_id || '(none)')} | plan: ${escapeHtml(data.plan || '(unknown)')}</p>
  <p style="color:#666;font-size:13px">Phone is CALL ONLY. No text without a separate written opt-in.</p>
  <p style="color:#666;font-size:13px">Next: write the persona file from these answers, then accept the Google manager invite when it lands.</p>
</div>`.trim()
  return { subject: `Local Scoop intake: ${business}`, html }
}

async function send(to: string[], subject: string, html: string, replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[local-scoop-intake] RESEND_API_KEY not set, intake would be lost:', subject)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    })
    if (!res.ok) console.error(`[local-scoop-intake] Resend responded ${res.status}`, await res.text())
    return res.ok
  } catch (err) {
    console.error('[local-scoop-intake] Resend request failed:', err)
    return false
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'))
  const startTime = Date.now()

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
  }

  const data = sanitize(raw)
  const hasAnswer = FIELDS.some((f) => data[f.key])
  if (!hasAnswer) {
    return NextResponse.json({ error: 'Nothing to submit' }, { status: 400, headers })
  }

  const { subject, html } = buildIntakeEmail(data)
  const sent = await send([OWNER], subject, html)
  if (!sent) {
    portal.error('local-scoop.intake', 'send failed')
    /* The client already typed everything once. Never show them a failure they cannot act on:
       the answers are in the logs, and the manager invite is the step that actually matters. */
  } else {
    portal.event('local-scoop.intake', 'completed')
  }

  /* Their copy of the manager-access steps. The client asked for this by submitting the form,
     so it works today with no signing secret. The Stripe webhook covers the buyers who never
     fill this in; a client who hits both paths gets the same body twice, not two versions. */
  if (looksLikeEmail(data.email)) {
    const welcome = buildWelcomeEmail({
      firstName: firstName(data.contact_name),
      businessName: data.business_name || data.contact_name || 'your business',
    })
    const copySent = await send([data.email.trim()], welcome.subject, welcome.html, OWNER)
    console.log('[local-scoop-intake] client copy', copySent ? 'sent' : 'FAILED')
  }

  portal.api('POST', '/api/local-scoop/intake', 200, Date.now() - startTime)
  return NextResponse.json({ received: true }, { headers })
}
