import * as Sentry from '@sentry/nextjs'
import { isSecretBearingRequest, scrubData, scrubUrl } from '@/lib/sentry-scrub'

// Belt and braces against a credential riding into Sentry: the Meta Page
// token normally travels only in an Authorization header, but /debug_token
// carries it in the query string, so (1) that request gets no outgoing span
// at all and (2) every URL-bearing span/breadcrumb field is scrubbed of
// *token*/*secret* query parameters (src/lib/sentry-scrub.ts).

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Only send errors in production
  enabled: process.env.NODE_ENV === 'production',

  integrations: [
    Sentry.httpIntegration({ ignoreOutgoingRequests: (url) => isSecretBearingRequest(url) }),
    Sentry.nativeNodeFetchIntegration({ ignoreOutgoingRequests: (url) => isSecretBearingRequest(url) }),
  ],

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
