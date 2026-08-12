/**
 * The Local Scoop: post-checkout fulfillment.
 *
 * Stripe Payment Links are the whole checkout for this plan, so nothing on the site knows a sale
 * happened. This endpoint is the only thing standing between a paid customer and silence: it turns
 * `checkout.session.completed` into (a) the welcome email that asks for Google Business Profile
 * manager access, the one thing the product cannot start without, and (b) an internal alert.
 *
 * Deliberately NOT built on ../webhook/route.ts: that handler early-returns on
 * `session.metadata.userId`, which Payment Links never set, and then triggers a legacy website
 * deploy. Wrong shape for this plan, and it has never fired in production.
 *
 * Env (client-portal Vercel project):
 *   STRIPE_WEBHOOK_SECRET_LOCAL_SCOOP  required, this endpoint's own signing secret
 *   RESEND_API_KEY                     required to send, already set for the report digests
 *   LOCAL_SCOOP_PAYMENT_LINKS          optional csv of plink ids, defaults to the two live links
 *   LOCAL_SCOOP_FROM                   optional from header
 *   LOCAL_SCOOP_AUTOSEND               "off" holds the client email and puts the body in the
 *                                      internal alert instead (drafts-first fallback)
 *   SKOOPED_HOSTED_DOMAINS             optional csv, flags a buyer whose site we already host
 *                                      (they belong on the Double, not here)
 *   OWNER_ALERT_EMAIL                  optional, defaults to joseph@skooped.io
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { escapeHtml } from '@/lib/gbp/notify'
import { buildWelcomeEmail, firstName, MANAGER_EMAIL } from '@/lib/local-scoop/welcome-email'
import { portal } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_PAYMENT_LINKS = [
  'plink_1U2uuuAJ2gGgGm7b9QvuM10Y', // The Local Scoop, $100/mo
  'plink_1U2uzLAJ2gGgGm7bLV7HJ9k3', // The Local Scoop, $1,000/yr
]

const OWNER = process.env.OWNER_ALERT_EMAIL ?? 'joseph@skooped.io'
const FROM = process.env.LOCAL_SCOOP_FROM ?? 'Joseph Anderson <joseph@skooped.io>'

/* Signature verification is pure crypto, no API call, so the key here is never used for I/O.
   It stays separate from lib/stripe.ts on purpose: that instance holds a pre-takeover key. */
const stripeClient = new Stripe(
  process.env.STRIPE_SECRET_KEY_LLC ?? process.env.STRIPE_SECRET_KEY ?? 'sk_signature_verification_only',
  { apiVersion: '2026-02-25.clover' }
)

/**
 * The fallback is lowercased too, not just the parsed env value. Callers compare against a
 * `.toLowerCase()`d input, so returning a mixed-case default silently matched nothing: the
 * hardcoded plink ids are mixed case, so with no env var set every real sale was dropped as
 * "another payment link". Caught by a signed live test on 2026-08-12, not by a unit test,
 * because the tests only ever exercised the env-provided branch.
 */
export function csvEnv(value: string | undefined, fallback: string[] = []): string[] {
  const norm = (list: string[]) => list.map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (!value) return norm(fallback)
  const parts = norm(value.split(','))
  return parts.length ? parts : norm(fallback)
}

/** Payment Links expose the buyer's answers as an array; flatten to a plain lookup. */
export function parseCustomFields(fields: Stripe.Checkout.Session.CustomField[] | null | undefined) {
  const out: Record<string, string> = {}
  for (const f of fields ?? []) {
    const value = f.text?.value ?? f.numeric?.value ?? f.dropdown?.value
    if (value) out[f.key] = value
  }
  return out
}

/**
 * The hosting fence: The Local Scoop is for sites we do NOT host. A buyer whose domain we already
 * host bought the wrong thing and should be on the Double, so this needs a human the same day.
 */
export function isHostedByUs(website: string | undefined, hostedDomains: string[]): boolean {
  if (!website || !hostedDomains.length) return false
  let host = website.trim().toLowerCase()
  host = host.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
  if (!host) return false
  return hostedDomains.some((d) => host === d || host.endsWith(`.${d}`))
}

export function buildInternalAlert(params: {
  businessName: string
  email: string
  phone: string
  website: string
  cadence: string
  amount: string
  adSource: string
  hostingFenceHit: boolean
  heldEmailHtml?: string
}) {
  const { businessName, email, phone, website, cadence, amount, adSource, hostingFenceHit, heldEmailHtml } = params
  const subject = `${hostingFenceHit ? 'URGENT hosting fence: ' : ''}New Local Scoop sale: ${businessName}`
  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;max-width:640px">
  ${hostingFenceHit ? `<p style="color:#B3261E;font-weight:700">HOSTING FENCE HIT: we already host ${escapeHtml(website)}. This buyer belongs on the Double Scoop. Refund and re-route today.</p>` : ''}
  <table cellpadding="4" style="border-collapse:collapse">
    <tr><td><strong>Business</strong></td><td>${escapeHtml(businessName)}</td></tr>
    <tr><td><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
    <tr><td><strong>Phone</strong></td><td>${escapeHtml(phone)}</td></tr>
    <tr><td><strong>Website given</strong></td><td>${escapeHtml(website)}</td></tr>
    <tr><td><strong>Plan</strong></td><td>${escapeHtml(cadence)} ${escapeHtml(amount)}</td></tr>
    <tr><td><strong>Ad source</strong></td><td>${escapeHtml(adSource)}</td></tr>
  </table>
  <p style="color:#666;font-size:13px">Phone is CALL ONLY. No text goes to this number without a separate written opt-in.</p>
  <p style="color:#666;font-size:13px">Next: accept the Google manager invite when it lands, then send the "I'm in" reply. No invite by day 2, call them.</p>
  ${heldEmailHtml ? `<hr><p><strong>AUTOSEND IS OFF. The welcome email was NOT sent. Paste this to them:</strong></p>${heldEmailHtml}` : ''}
</div>`.trim()
  return { subject, html }
}

async function send(payload: {
  to: string[]
  subject: string
  html: string
  bcc?: string[]
  replyTo?: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[local-scoop] RESEND_API_KEY not set, cannot send', payload.subject)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: payload.to,
        ...(payload.bcc?.length ? { bcc: payload.bcc } : {}),
        ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
        subject: payload.subject,
        html: payload.html,
      }),
    })
    if (!res.ok) console.error(`[local-scoop] Resend responded ${res.status}`, await res.text())
    return res.ok
  } catch (err) {
    console.error('[local-scoop] Resend request failed:', err)
    return false
  }
}

async function handleSession(session: Stripe.Checkout.Session) {
  const linkId = typeof session.payment_link === 'string' ? session.payment_link : session.payment_link?.id
  const allowed = csvEnv(process.env.LOCAL_SCOOP_PAYMENT_LINKS, DEFAULT_PAYMENT_LINKS)
  if (!linkId || !allowed.includes(linkId.toLowerCase())) {
    console.log('[local-scoop] ignoring session from another payment link', session.id, linkId)
    return
  }
  if (session.payment_status !== 'paid') {
    console.log('[local-scoop] ignoring unpaid session', session.id, session.payment_status)
    return
  }

  const fields = parseCustomFields(session.custom_fields)
  const email = session.customer_details?.email ?? ''
  const businessName = fields.gbp_business_name || session.customer_details?.name || 'your business'
  const website = fields.business_website || ''
  const cadence = (session.amount_total ?? 0) >= 50000 ? 'annual' : 'monthly'
  const amount = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : 'unknown'
  const fenceHit = isHostedByUs(website, csvEnv(process.env.SKOOPED_HOSTED_DOMAINS))
  const autosend = (process.env.LOCAL_SCOOP_AUTOSEND ?? 'on').toLowerCase() !== 'off'

  const welcome = buildWelcomeEmail({
    firstName: firstName(session.customer_details?.name),
    businessName,
  })

  if (!email) {
    console.error('[local-scoop] no customer email on session', session.id)
  } else if (autosend) {
    const ok = await send({
      to: [email],
      bcc: [OWNER],
      replyTo: MANAGER_EMAIL,
      subject: welcome.subject,
      html: welcome.html,
    })
    console.log('[local-scoop] welcome email', ok ? 'sent' : 'FAILED', email, session.id)
  }

  const alert = buildInternalAlert({
    businessName,
    email: email || '(none captured)',
    phone: session.customer_details?.phone ?? '(not collected)',
    website: website || '(none given)',
    cadence,
    amount,
    adSource: session.client_reference_id ?? '(none)',
    hostingFenceHit: fenceHit,
    heldEmailHtml: autosend ? undefined : welcome.html,
  })
  await send({ to: [OWNER], subject: alert.subject, html: alert.html })
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_LOCAL_SCOOP
  if (!webhookSecret) {
    console.error('[local-scoop] STRIPE_WEBHOOK_SECRET_LOCAL_SCOOP is not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripeClient.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[local-scoop] signature verification failed', message)
    portal.error('stripe.localscoop.signature', message)
    return NextResponse.json({ error: `Webhook signature invalid: ${message}` }, { status: 400 })
  }

  const startTime = Date.now()
  try {
    if (event.type === 'checkout.session.completed') {
      await handleSession(event.data.object as Stripe.Checkout.Session)
      portal.event('stripe.localscoop.completed', 'completed')
    } else {
      console.log('[local-scoop] unhandled event type:', event.type)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[local-scoop] handler error', event.type, err)
    portal.error(`stripe.localscoop.${event.type}`, message)
    /* 200 on purpose: a Stripe retry would re-send the welcome email to a paying customer,
       which is worse than losing the retry. Failures surface in the logs and Stripe's UI. */
    return NextResponse.json({ received: true, handled: false, error: message })
  }

  portal.api('POST', '/api/stripe/local-scoop', 200, Date.now() - startTime)
  return NextResponse.json({ received: true })
}
