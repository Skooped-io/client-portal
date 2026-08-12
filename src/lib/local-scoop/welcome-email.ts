/**
 * The Local Scoop welcome email, shared by the two things that can trigger it:
 *   - the Stripe webhook (automatic, every paid checkout, needs a signing secret)
 *   - the intake form (the client asked for it by submitting, needs nothing)
 *
 * One body, one voice, so a client who hits both paths never gets two different versions.
 */

import { escapeHtml } from '@/lib/gbp/notify'

export const MANAGER_EMAIL = 'joseph@skooped.io'
export const PHONE = '615-315-1541'

/** "Mike Ruiz" -> "Mike". Falls back to "there" so the greeting never reads "Hi ,". */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first || 'there'
}

export function buildWelcomeEmail(params: { firstName: string; businessName: string }) {
  const { firstName: first, businessName } = params
  const biz = escapeHtml(businessName)
  const subject = "You're in. One ten minute step and your Google listing is handled."
  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:600px">
  <p>Hi ${escapeHtml(first)},</p>
  <p>Payment came through for The Local Scoop, thank you. One thing from you, and then you stop thinking about your Google listing.</p>
  <p>Add me as a manager on the Google Business Profile for ${biz}. It takes about ten minutes.</p>
  <p><strong>On a computer:</strong></p>
  <ol>
    <li>Go to business.google.com and sign in with the Google account that already manages your listing. If you have more than one Google account, use the one that can already edit your business hours.</li>
    <li>If you see a list of businesses, open the one you want handled.</li>
    <li>Click More, then Business Profile settings, then People and access.</li>
    <li>Click Add, type ${MANAGER_EMAIL}, choose Manager, and send the invite.</li>
  </ol>
  <p><strong>On your phone:</strong> search your own business name on Google while you are signed in, tap Edit profile, then Business Profile settings, then People and access, then Add.</p>
  <p>The invite comes straight to me. I accept it and email you the same day, so you will know the moment I am in.</p>
  <p><strong>Two things that come up:</strong></p>
  <p>If your profile is not verified with Google yet, nobody can be added as a manager. Call or text me at ${PHONE} and we will sort it out.</p>
  <p>If you see two copies of your business on Google, send me both links. Duplicates split your reviews, and I can get them merged.</p>
  <p>Photos help. Reply to this email with real job photos whenever you get a chance. Real photos beat stock every time. These get posted publicly on your profile, so send work you are happy to show. If you never send any, your posts still go up, just with text instead of pictures.</p>
  <p><strong>What happens next:</strong></p>
  <ul>
    <li>Every new review gets a reply that sounds like you. Anything three stars or under I write myself before it posts.</li>
    <li>A fresh post on your profile every week.</li>
    <li>Hours, phone, and services kept accurate, holidays included.</li>
    <li>In your first couple of weeks I work through reviews that never got a reply, a few at a time. If any of the old ones are from unhappy customers, I send those to you before anything posts.</li>
    <li>Once a month you get one link with your numbers: calls, direction requests, and clicks, straight from Google.</li>
  </ul>
  <p>Your website stays exactly where it is. I do not touch it.</p>
  <p>Reply to this email any time. If it is quicker, call or text ${PHONE}.</p>
  <p>Joseph Anderson<br>skooped.io<br>${PHONE}</p>
</div>`.trim()
  return { subject, html }
}

/** Cheap sanity check. Not validation: a typo'd address just bounces, it must never block a client. */
export function looksLikeEmail(value: string | undefined): boolean {
  if (!value) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}
