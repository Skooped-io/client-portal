import { createHash, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Shared-secret auth for machine-only routes. The presented value is the
 * Bearer token in the Authorization header; the x-vercel-cron header is
 * spoofable and is never consulted. Comparison is constant-time (both sides
 * hashed first, so unequal lengths do not leak either).
 *
 *   verifyCronSecret   the cron ticks — CRON_SECRET (Vercel's daily sweep) or
 *                      SOCIAL_CRON_SECRET (the GitHub Actions 5-minute tick;
 *                      that value lives in a GitHub repository secret)
 *   verifyAdminSecret  /api/admin/* — ADMIN_API_SECRET only. It is a Vercel
 *                      env var and never a GitHub secret, so a workflow (or an
 *                      Actions secret leak) can only tick the reconcile, never
 *                      write a client's Page token.
 *
 * With no accepted secret configured a route is open only in development.
 */
function bearer(request: NextRequest): string | null {
  const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return typeof presented === 'string' && presented.length > 0 ? presented : null
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function secretsFrom(...names: string[]): string[] {
  return names
    .map((n) => process.env[n])
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
}

function matches(request: NextRequest, accepted: string[]): boolean {
  if (accepted.length === 0) return process.env.NODE_ENV === 'development'
  const presented = bearer(request)
  if (!presented) return false
  const p = digest(presented)
  return accepted.some((s) => timingSafeEqual(digest(s), p))
}

export function verifyCronSecret(request: NextRequest): boolean {
  return matches(request, secretsFrom('CRON_SECRET', 'SOCIAL_CRON_SECRET'))
}

export function verifyAdminSecret(request: NextRequest): boolean {
  return matches(request, secretsFrom('ADMIN_API_SECRET'))
}
