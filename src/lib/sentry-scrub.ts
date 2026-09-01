/**
 * Scrubbers for Sentry spans and breadcrumbs. Meta Graph calls carry the
 * Page token only in the Authorization header (src/lib/social/meta.ts), which
 * Sentry never records — with one exception: GET /debug_token must pass the
 * inspected Page token as the `input_token` query parameter. OpenTelemetry's
 * fetch instrumentation puts the full href (query included) on the outgoing
 * span as `url.full` / `url.query`, so every key that can hold a URL is
 * scrubbed here and every query parameter that looks like a credential is
 * masked, not just `access_token`.
 */

// Any query parameter named *token* / *secret* (access_token, input_token,
// appsecret_proof, client_secret, ...).
export const SECRET_QUERY = /(^|[?&])([^&#=]*(?:token|secret)[^&#=]*)=[^&#]*/gi

export const URL_KEYS = ['url', 'http.url', 'http.query', 'query', 'url.full', 'url.query', 'http.target'] as const

export function scrubUrl(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(SECRET_QUERY, '$1$2=***') : value
}

export function scrubData(data: Record<string, unknown> | undefined): void {
  if (!data) return
  for (const key of URL_KEYS) {
    if (key in data) data[key] = scrubUrl(data[key])
  }
}

/** Outgoing requests Sentry should not even record a span for. */
export function isSecretBearingRequest(url: string): boolean {
  return url.includes('/debug_token')
}
