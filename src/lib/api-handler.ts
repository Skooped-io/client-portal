import { NextRequest, NextResponse } from 'next/server'
import { portal } from '@/lib/logger'

/**
 * Wraps an API route handler with:
 * - try/catch error handling
 * - Axiom request/response logging
 * - Duration tracking
 * - Consistent error response format
 *
 * Usage:
 *   import { withLogging } from '@/lib/api-handler'
 *   export const GET = withLogging('agents/google/search-console', async (request, context) => {
 *     // your handler logic
 *     return NextResponse.json({ data })
 *   })
 */
export function withLogging(
  routeName: string,
  handler: (request: NextRequest, context?: unknown) => Promise<NextResponse>
) {
  return async (request: NextRequest, context?: unknown): Promise<NextResponse> => {
    const startTime = Date.now()
    const method = request.method

    try {
      const response = await handler(request, context)
      const duration = Date.now() - startTime
      const status = response.status

      // Log successful requests (skip 304s and health checks)
      if (status < 400) {
        portal.api(method, routeName, status, duration)
      } else {
        portal.api(method, routeName, status, duration, {
          error: `HTTP ${status}`,
        })
      }

      return response
    } catch (err: unknown) {
      const duration = Date.now() - startTime
      const message = err instanceof Error ? err.message : 'Internal server error'

      portal.error(`${method} ${routeName}`, message, {
        duration_ms: duration,
        method,
        path: routeName,
        status_code: 500,
      })

      console.error(`[${routeName}] Unhandled error:`, message)

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}
