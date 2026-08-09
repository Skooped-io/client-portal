/**
 * Hard style gate for GBP review replies (Joseph, 2026-08-09 — enforced in
 * code, not just in the drafter prompt). A draft failing any rule is never
 * posted: the drafter gets one retry with the violations fed back, then the
 * row goes to state 'failed' for the digest.
 */

const VALEDICTIONS =
  /^(best|best regards|regards|warm regards|kind regards|sincerely|cheers|thanks|thank you|many thanks|respectfully|warmly|blessings|god bless)[,.!]?$/i

export function lintReply(text: string): string[] {
  const violations: string[] = []
  const trimmed = text.trim()

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
