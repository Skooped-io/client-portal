import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const run = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/social/service', () => ({
  createSupabaseStore: () => ({}),
  runSocialPublish: run,
}))
// The real logger's flush() reaches for Axiom; never from a test.
vi.mock('@/lib/logger', () => ({
  ops: { info: vi.fn(), error: vi.fn() },
  flush: vi.fn().mockResolvedValue(undefined),
}))

function get(auth?: string) {
  return new NextRequest('http://localhost/api/cron/social-publish', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  })
}

describe('GET /api/cron/social-publish', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
    run.mockReset()
  })
  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('401s without the bearer secret and never runs', async () => {
    const { GET } = await import('../social-publish/route')
    expect((await GET(get())).status).toBe(401)
    expect((await GET(get('Bearer wrong'))).status).toBe(401)
    expect(run).not.toHaveBeenCalled()
  })

  it('runs one pass and reports counts', async () => {
    run.mockResolvedValue({
      published: ['a'],
      retried: [],
      failed: ['b'],
      skipped: [],
      stale: ['s'],
      fbWentLive: ['c'],
      fbMissing: [],
    })
    const { GET } = await import('../social-publish/route')
    const res = await GET(get('Bearer cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.published).toBe(1)
    expect(body.failed).toBe(1)
    expect(body.stale).toBe(1)
    expect(body.fbWentLive).toBe(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('500s (without crashing) when the pass throws', async () => {
    run.mockRejectedValue(new Error('db down'))
    const { GET } = await import('../social-publish/route')
    const res = await GET(get('Bearer cron-secret'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('db down')
  })
})
