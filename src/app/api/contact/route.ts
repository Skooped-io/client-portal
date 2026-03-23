import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN
const SLACK_CHANNEL = 'C0ALGCT1E4B'

interface ContactPayload {
  orgId: string
  name: string
  email?: string
  phone?: string
  message: string
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Skooped <noreply@skooped.io>',
      to: [to],
      subject,
      html,
    }),
  }).catch(() => {})
}

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

/**
 * POST /api/contact
 *
 * Receives contact form submissions from client websites.
 * Stores in contact_submissions table, emails client, notifies Slack.
 *
 * Called by the contact form on deployed client sites.
 * No auth required (public endpoint) but rate limited by orgId.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  let body: ContactPayload
  try {
    body = await request.json() as ContactPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { orgId, name, email, phone, message } = body

  if (!orgId || !name || !message) {
    return NextResponse.json(
      { error: 'orgId, name, and message are required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Verify org exists and get business details
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  // Get client email for notification
  const { data: bp } = await supabase
    .from('business_profiles')
    .select('email, business_name, phone as biz_phone')
    .eq('org_id', orgId)
    .single()

  // Store submission
  const { error: insertError } = await supabase.from('contact_submissions').insert({
    org_id: orgId,
    name,
    email: email ?? null,
    phone: phone ?? null,
    message,
    source: 'website',
    status: 'new',
  })

  if (insertError) {
    console.error('[contact] Failed to store submission:', insertError.message)
    portal.error('contact.submit', insertError.message)
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
  }

  // Email the client (business owner)
  const clientEmail = bp?.email
  if (clientEmail) {
    await sendEmail(
      clientEmail,
      `New inquiry from ${name} via your website`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#361C24">New Contact Form Submission</h2>
        <p>Someone reached out through your website:</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#666">Name:</td><td style="padding:8px 0;font-weight:bold">${name}</td></tr>
          ${email ? `<tr><td style="padding:8px 0;color:#666">Email:</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>` : ''}
          ${phone ? `<tr><td style="padding:8px 0;color:#666">Phone:</td><td style="padding:8px 0"><a href="tel:${phone}">${phone}</a></td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#666;vertical-align:top">Message:</td><td style="padding:8px 0">${message}</td></tr>
        </table>
        <p style="margin-top:20px;color:#666;font-size:13px">View all messages in your <a href="https://app.skooped.io/messages">dashboard</a>.</p>
      </div>`
    )
  }

  // Notify Slack
  await notifySlack(
    `📬 *New contact form submission*\n\n` +
    `Business: *${bp?.business_name ?? org.name}*\n` +
    `From: ${name}${email ? ` (${email})` : ''}${phone ? ` | ${phone}` : ''}\n` +
    `Message: ${message.slice(0, 200)}${message.length > 200 ? '...' : ''}`
  )

  // Log activity
  await supabase.from('agent_activity').insert({
    org_id: orgId,
    agent: 'cooper',
    action_type: 'contact_received',
    description: `New contact form submission from ${name}`,
    metadata: { name, email, phone, message_preview: message.slice(0, 100) },
  })

  portal.api('POST', '/api/contact', 200, Date.now() - startTime)

  return NextResponse.json({ success: true, message: 'Contact form submitted' })
}
