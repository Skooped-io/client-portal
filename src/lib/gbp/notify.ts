/**
 * Resend email notifications for the GBP automation. Same raw-fetch pattern
 * as the monthly-reports digest. Owner-only — clients are never emailed here.
 */

const OWNER_EMAIL = process.env.REVIEW_NOTIFY_EMAIL ?? 'joseph@skooped.io'
const FROM = process.env.REVIEW_NOTIFY_FROM ?? 'Skooped Reviews <reports@skooped.io>'

export async function sendEmail(subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[gbp-notify] RESEND_API_KEY not set — skipping email')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [OWNER_EMAIL], subject, html }),
    })
    if (!res.ok) console.error(`[gbp-notify] Resend responded ${res.status}`)
    return res.ok
  } catch (err) {
    console.error('[gbp-notify] Resend request failed:', err)
    return false
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 1-2★ reviews escalate the moment they are detected — not batched into the
 * digest (they ride along there too, marked as already alerted).
 */
export async function sendEscalation(params: {
  locationName: string
  reviewerName: string | null
  starRating: number
  comment: string | null
  draftReply: string | null
}): Promise<boolean> {
  const { locationName, reviewerName, starRating, comment, draftReply } = params
  const html = `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
    <h2 style="color:#B3261E">⚠ ${starRating}★ review on ${escapeHtml(locationName)}</h2>
    <p><strong>${escapeHtml(reviewerName ?? 'Anonymous')}</strong> left a ${starRating}-star review:</p>
    <blockquote style="border-left:3px solid #B3261E;margin:0;padding:8px 12px;color:#444">${escapeHtml(
      comment ?? '(no text — star-only review)'
    )}</blockquote>
    ${
      draftReply
        ? `<p style="margin-top:16px">Drafted reply (HELD — nothing posts without you):</p>
    <blockquote style="border-left:3px solid #999;margin:0;padding:8px 12px;color:#444">${escapeHtml(draftReply)}</blockquote>`
        : '<p style="margin-top:16px">No reply drafted yet.</p>'
    }
    <p style="color:#666;font-size:13px">Respond fast before it festers. Approve, edit, or reply directly in Business Profile Manager.</p>
  </div>`
  return sendEmail(`⚠ URGENT: ${starRating}★ review on ${locationName}`, html)
}
