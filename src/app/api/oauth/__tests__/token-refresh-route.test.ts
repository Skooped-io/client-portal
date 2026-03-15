import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock environment variables
process.env.SERVICE_API_KEY = 'test-service-key'
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

// Mock supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  })),
}))

// Mock token refresh lib
vi.mock('@/lib/oauth/token-refresh', () => ({
  refreshSingleToken: vi.fn(),
  buildRefreshErrorUpdate: vi.fn(),
  MAX_REFRESH_ERRORS: 5,
}))

describe('POST /api/oauth/token/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when SERVICE_API_KEY header is missing', async () => {
    const { POST } = await import('../token/refresh/route')
    const request = new NextRequest('http://localhost/api/oauth/token/refresh', {
      method: 'POST',
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('returns 401 when SERVICE_API_KEY header is wrong', async () => {
    const { POST } = await import('../token/refresh/route')
    const request = new NextRequest('http://localhost/api/oauth/token/refresh', {
      method: 'POST',
      headers: { 'x-service-api-key': 'wrong-key' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('returns 200 with empty results when no connections need refresh', async () => {
    const { POST } = await import('../token/refresh/route')
    const request = new NextRequest('http://localhost/api/oauth/token/refresh', {
      method: 'POST',
      headers: { 'x-service-api-key': 'test-service-key' },
    })
    const response = await POST(request)
    expect(response.status).toBe(200)

    const body = (await response.json()) as { refreshed: number; failed: number; revoked: number }
    expect(body.refreshed).toBe(0)
    expect(body.failed).toBe(0)
    expect(body.revoked).toBe(0)
  })
})
