import type { NextRequest } from 'next/server'

/**
 * Shared-secret auth for machine-only routes (the social cron tick and the
 * social-account admin route). Bearer CRON_SECRET or SOCIAL_CRON_SECRET; the
 * x-vercel-cron header is spoofable and is never consulted. With neither
 * secret set the route is open only in development.
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  // Vercel Hobby cannot run a 5-minute cron, so a GitHub Actions workflow
  // ticks the social route with SOCIAL_CRON_SECRET; Vercel's own daily sweep
  // still sends CRON_SECRET. Either value is accepted.
  const accepted = [process.env.CRON_SECRET, process.env.SOCIAL_CRON_SECRET].filter(
    (v): v is string => typeof v === 'string' && v.length > 0
  )
  if (accepted.length === 0) return process.env.NODE_ENV === 'development'
  return typeof presented === 'string' && presented.length > 0 && accepted.includes(presented)
}
