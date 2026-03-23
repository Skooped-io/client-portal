import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RESEND_API_KEY = process.env.RESEND_API_KEY

function verifyCron(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return process.env.NODE_ENV === 'development'
  return secret === cronSecret
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[report-email] RESEND_API_KEY not set')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Skooped <reports@skooped.io>',
        to: [to],
        subject,
        html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * GET /api/cron/send-report-emails
 *
 * Sends weekly report emails to all clients with recent reports.
 * Runs Monday 8 AM CST (2 hours after report generation).
 */
export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  ops.info('system', 'cron.send_report_emails.started', 'started')

  // Get reports generated in the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: reports } = await supabase
    .from('reports')
    .select('*, organizations(name)')
    .gte('created_at', oneDayAgo)
    .eq('report_type', 'weekly')

  if (!reports || reports.length === 0) {
    return NextResponse.json({ message: 'No reports to send', sent: 0 })
  }

  let sent = 0

  for (const report of reports) {
    // Get the business email
    const { data: bp } = await supabase
      .from('business_profiles')
      .select('email, business_name')
      .eq('org_id', report.org_id)
      .single()

    if (!bp?.email) {
      console.log(`[report-email] No email for org ${report.org_id}, skipping`)
      continue
    }

    const metrics = report.metrics as Record<string, number> ?? {}
    const highlights = (report.highlights as string[]) ?? []
    const bizName = bp.business_name ?? 'your business'

    const highlightHtml = highlights.length > 0
      ? `<ul>${highlights.map(h => `<li style="padding:4px 0">${h}</li>`).join('')}</ul>`
      : '<p>Data collection in progress — more insights coming soon.</p>'

    const emailHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#361C24;padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">📊 Weekly Performance Report</h1>
        <p style="color:#fff;opacity:0.8;margin:4px 0 0;font-size:13px">${bizName} | ${report.period_start} to ${report.period_end}</p>
      </div>
      
      <div style="padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="font-size:16px;color:#361C24;margin:0 0 16px">Key Metrics</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:8px 12px;background:#f9f9f9;border-radius:8px;text-align:center;width:25%">
              <p style="margin:0;font-size:24px;font-weight:bold;color:#361C24">${metrics.clicks ?? 0}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#666">Clicks</p>
            </td>
            <td style="padding:8px 12px;background:#f9f9f9;border-radius:8px;text-align:center;width:25%">
              <p style="margin:0;font-size:24px;font-weight:bold;color:#361C24">${metrics.sessions ?? 0}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#666">Sessions</p>
            </td>
            <td style="padding:8px 12px;background:#f9f9f9;border-radius:8px;text-align:center;width:25%">
              <p style="margin:0;font-size:24px;font-weight:bold;color:#361C24">${metrics.phone_calls ?? 0}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#666">Calls</p>
            </td>
            <td style="padding:8px 12px;background:#f9f9f9;border-radius:8px;text-align:center;width:25%">
              <p style="margin:0;font-size:24px;font-weight:bold;color:#361C24">${(metrics.avg_position ?? 0).toFixed(1)}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#666">Avg Position</p>
            </td>
          </tr>
        </table>

        <h2 style="font-size:16px;color:#361C24;margin:24px 0 12px">Highlights</h2>
        ${highlightHtml}

        <div style="margin-top:24px;text-align:center">
          <a href="https://app.skooped.io/reports" style="display:inline-block;padding:12px 24px;background:#D94A7A;color:white;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px">View Full Report →</a>
        </div>

        <p style="margin-top:24px;color:#999;font-size:11px;text-align:center">
          This report was generated by your Skooped AI team.<br>
          <a href="https://app.skooped.io/settings" style="color:#999">Manage notification preferences</a>
        </p>
      </div>
    </div>`

    const success = await sendEmail(
      bp.email,
      `📊 Weekly Report: ${bizName} (${report.period_start} to ${report.period_end})`,
      emailHtml
    )

    if (success) {
      sent++
      console.log(`[report-email] Sent to ${bp.email} for ${bizName} ✅`)

      // Log activity
      await supabase.from('agent_activity').insert({
        org_id: report.org_id,
        agent: 'riley',
        action_type: 'report_emailed',
        description: `Weekly report emailed to ${bp.email}`,
        metadata: { email: bp.email, period: `${report.period_start} to ${report.period_end}` },
      })
    } else {
      console.error(`[report-email] Failed to send to ${bp.email}`)
    }

    // Small delay between emails
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  ops.info('system', 'cron.send_report_emails.completed', 'completed', {
    metadata: { sent, total: reports.length },
  })

  await flush()

  return NextResponse.json({ sent, total: reports.length })
}
