import * as Sentry from '@sentry/nextjs'

// Meta Graph calls carry the Page token only in the Authorization header
// (src/lib/social/meta.ts), which Sentry never records. Belt and braces: strip
// any access_token that still shows up in a span's URL / query or a fetch
// breadcrumb, so a credential can never ride into Sentry.
const SECRET_QUERY = /([?&])access_token=[^&#]*/gi

function scrubUrl(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(SECRET_QUERY, '$1access_token=***') : value
}

function scrubData(data: Record<string, unknown> | undefined): void {
  if (!data) return
  for (const key of ['url', 'http.url', 'http.query', 'query']) {
    if (key in data) data[key] = scrubUrl(data[key])
  }
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Only send errors in production
  enabled: process.env.NODE_ENV === 'production',

  beforeSendSpan(span) {
    if (span.description) span.description = scrubUrl(span.description) as string
    scrubData(span.data as Record<string, unknown> | undefined)
    return span
  },
  beforeBreadcrumb(breadcrumb) {
    scrubData(breadcrumb.data as Record<string, unknown> | undefined)
    if (breadcrumb.message) breadcrumb.message = scrubUrl(breadcrumb.message) as string
    return breadcrumb
  },
})
