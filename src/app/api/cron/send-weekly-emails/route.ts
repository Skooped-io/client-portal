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

const RESEND_API_KEY = process.env.RESEND_API_KEY

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.log(`[weekly-emails] RESEND_API_KEY not set, skipping: ${to}`)
    return false
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Riley at Skooped <riley@skooped.io>',
      to: [to],
      subject,
      html,
    }),
  })
  return res.ok
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  ops.info('system', 'cron.send_weekly_emails.started', 'started')

  // Get reports generated in the last 48 hours that havent been emailed
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: reports } = await supabase
    .from('reports')
    .select('id, org_id, period_start, period_end, summary, metrics, highlights, created_at')
    .eq('report_type', 'weekly')
    .gte('created_at', cutoff)

  if (!reports || reports.length === 0) {
    return NextResponse.json({ message: 'No recent reports to email', sent: 0 })
  }

  let sent = 0

  for (const report of reports) {
    try {
      // Get business profile for email address
      const { data: bp } = await supabase
        .from('business_profiles')
        .select('email, business_name')
        .eq('org_id', report.org_id)
        .single()

      const clientEmail = bp?.email
      if (!clientEmail) {
        console.log(`[weekly-emails] No email for org ${report.org_id}, skipping`)
        continue
      }

      const bizName = bp?.business_name ?? 'your business'
      const metrics = report.metrics as Record<string, number> ?? {}
      const highlights = report.highlights as string[] ?? []
      const periodStart = new Date(report.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const periodEnd = new Date(report.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

      const highlightRows = highlights.map(h =>
        `<li style="padding:4px 0;color:#374151">${h}</li>`
      ).join('')

      const metricRows = [
        metrics.clicks && `<tr><td style="padding:8px 12px;color:#6B7280;border-bottom:1px solid #F3F4F6">Organic Clicks</td><td style="padding:8px 12px;font-weight:600;text-align:right;border-bottom:1px solid #F3F4F6">${metrics.clicks.toLocaleString()}</td></tr>`,
        metrics.impressions && `<tr><td style="padding:8px 12px;color:#6B7280;border-bottom:1px solid #F3F4F6">Search Impressions</td><td style="padding:8px 12px;font-weight:600;text-align:right;border-bottom:1px solid #F3F4F6">${metrics.impressions.toLocaleString()}</td></tr>`,
        metrics.sessions && `<tr><td style="padding:8px 12px;color:#6B7280;border-bottom:1px solid #F3F4F6">Website Sessions</td><td style="padding:8px 12px;font-weight:600;text-align:right;border-bottom:1px solid #F3F4F6">${metrics.sessions.toLocaleString()}</td></tr>`,
        metrics.phone_calls && `<tr><td style="padding:8px 12px;color:#6B7280;border-bottom:1px solid #F3F4F6">Phone Calls</td><td style="padding:8px 12px;font-weight:600;text-align:right;border-bottom:1px solid #F3F4F6">${metrics.phone_calls}</td></tr>`,
        metrics.new_reviews && `<tr><td style="padding:8px 12px;color:#6B7280">New Reviews</td><td style="padding:8px 12px;font-weight:600;text-align:right">${metrics.new_reviews}</td></tr>`,
      ].filter(Boolean).join('')

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#fff">
          <div style="background:linear-gradient(135deg,#D94A7A,#361C24);padding:32px 32px 24px;border-radius:12px 12px 0 0">
            <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0 0 4px">WEEKLY PERFORMANCE REPORT</p>
            <h1 style="color:#fff;font-size:22px;margin:0 0 4px;font-weight:700">${bizName}</h1>
            <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0">${periodStart} – ${periodEnd}</p>
          </div>

          <div style="padding:24px 32px;background:#F9FAFB;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">
            <p style="color:#374151;font-size:15px;margin:0">${report.summary ?? 'Your weekly performance report is ready.'}</p>
          </div>

          ${metricRows ? `
          <div style="padding:0 32px">
            <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
              ${metricRows}
            </table>
          </div>` : ''}

          ${highlights.length > 0 ? `
          <div style="padding:24px 32px">
            <h3 style="font-size:14px;font-weight:600;color:#111827;margin:0 0 12px">🏆 Highlights this week</h3>
            <ul style="margin:0;padding:0 0 0 16px">
              ${highlightRows}
            </ul>
          </div>` : ''}

          <div style="padding:24px 32px;text-align:center;border-top:1px solid #F3F4F6">
            <a href="https://app.skooped.io/reports"
               style="display:inline-block;background:#D94A7A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px">
              View Full Report →
            </a>
            <p style="color:#9CA3AF;font-size:12px;margin:16px 0 0">
              Your AI team at Skooped — always working, so you don't have to.
            </p>
          </div>
        </div>
      `

      const ok = await sendEmail(
        clientEmail,
        `Your weekly performance report — ${periodStart} to ${periodEnd}`,
        html
      )

      if (ok) {
        sent++
        // Log activity
        await supabase.from('agent_activity').insert({
          org_id: report.org_id,
          agent: 'riley',
          action_type: 'report_emailed',
          description: `Weekly report emailed to ${clientEmail} (${periodStart}–${periodEnd})`,
          metadata: { report_id: report.id, email: clientEmail },
        })
        console.log(`[weekly-emails] Sent to ${clientEmail} ✅`)
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[weekly-emails] Failed for org ${report.org_id}:`, msg)
    }
  }

  ops.info('system', 'cron.send_weekly_emails.completed', 'completed', {
    metadata: { reports: reports.length, sent },
  })

  await flush()

  return NextResponse.json({ reports: reports.length, sent })
}
