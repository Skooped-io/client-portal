/**
 * Hard style gate for GBP review replies (Joseph, 2026-08-09 — enforced in
 * code, not just in the drafter prompt). A draft failing any rule is never
 * posted: the drafter gets one retry with the violations fed back, then the
 * row goes to state 'failed' for the digest.
 */

const VALEDICTIONS =
  /^(best|best regards|regards|warm regards|kind regards|sincerely|cheers|thanks|thank you|many thanks|respectfully|warmly|blessings|god bless)[,.!]?$/i

/** Claims a retro-negative reply must never make: past outreach that is not
 *  on record, or compensation the business has not committed to (policy
 *  approved 2026-08-10). Enforced in code, not just the prompt. */
const RETRO_NEG_PAST_OUTREACH =
  /\bwe('ve| have)? (already )?(tried|attempted|reached out|called|contacted|emailed|texted|messaged|made (this|it) right)\b/i
const RETRO_NEG_COMPENSATION =
  /\b(refund|discount|compensat\w*|reimburse\w*|free of charge|at no (cost|charge)|redo (the|your)|money back|credit (you|your))\b/i

export function lintReply(text: string, opts?: { retroNegative?: boolean }): string[] {
  const violations: string[] = []
  const trimmed = text.trim()

  if (opts?.retroNegative) {
    if (RETRO_NEG_PAST_OUTREACH.test(trimmed)) {
      violations.push('claims a past outreach or fix attempt that is not on record — present tense only')
    }
    if (RETRO_NEG_COMPENSATION.test(trimmed)) {
      violations.push('offers compensation or work the business has not committed to — a conversation is the only offer allowed')
    }
    if (/!/.test(trimmed)) {
      violations.push('contains an exclamation mark — negative replies stay calm')
    }
    const negWords = trimmed.split(/\s+/).filter(Boolean).length
    if (negWords > 60) {
      violations.push(`too long for a negative reply (${negWords} words — aim for 40 to 55)`)
    }
  }

  if (/[—–]/.test(trimmed)) {
    violations.push('contains an em dash or en dash — use commas, periods, or two sentences')
  }
  if (/--/.test(trimmed)) {
    violations.push('contains a double hyphen — use commas, periods, or two sentences')
  }

  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)
  const lastLine = lines[lines.length - 1] ?? ''
  // Sign-offs: a dash/tilde-led last line ("- Andy", "~ The Team") or a bare
  // valediction. Google already labels every reply "Response from the owner".
  if (lines.length > 1 && /^[-–—~]\s*\S/.test(lastLine)) {
    violations.push('ends with a signature line — no sign-offs of any kind')
  }
  if (VALEDICTIONS.test(lastLine)) {
    violations.push('ends with a valediction — no sign-offs of any kind')
  }

  const words = trimmed.split(/\s+/).filter(Boolean).length
  if (words < 12) violations.push(`too short (${words} words — aim for 40 to 70)`)
  if (words > 95) violations.push(`too long (${words} words — aim for 40 to 70)`)

  if (/<[a-z_/][^>]*>/i.test(trimmed)) {
    violations.push('contains markup or internal tags — plain text only')
  }

  return violations
}
