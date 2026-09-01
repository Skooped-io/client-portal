import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const run = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/social/service', () => ({
  createSupabaseStore: () => ({}),
  runSocialReconcile: run,
}))
// The real logger's flush() reaches for Axiom; never from a test.
vi.mock('@/lib/logger', () => ({
  ops: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  flush: vi.fn().mockResolvedValue(undefined),
}))

function get(auth?: string) {
  return new NextRequest('http://localhost/api/cron/social-publish', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  })
}

describe('GET /api/cron/social-publish (reconciliation only)', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
    delete process.env.SOCIAL_CRON_SECRET
    run.mockReset()
  })
  afterEach(() => {
    delete process.env.CRON_SECRET
    delete process.env.SOCIAL_CRON_SECRET
  })

  it('401s without the bearer secret and never runs', async () => {
    const { GET } = await import('../social-publish/route')
    expect((await GET(get())).status).toBe(401)
    expect((await GET(get('Bearer wrong'))).status).toBe(401)
    expect(run).not.toHaveBeenCalled()
  })

  it('accepts SOCIAL_CRON_SECRET (the GitHub tick) as well as CRON_SECRET', async () => {
    process.env.SOCIAL_CRON_SECRET = 'gh-secret'
    run.mockResolvedValue({ stale: [], fbWentLive: [], fbMissing: [], fbHeld: [] })
    const { GET } = await import('../social-publish/route')
    expect((await GET(get('Bearer gh-secret'))).status).toBe(200)
    expect((await GET(get('Bearer cron-secret'))).status).toBe(200)
  })

  it('runs one reconciliation pass and reports counts — nothing is published from here', async () => {
    run.mockResolvedValue({ stale: ['s'], fbWentLive: ['c'], fbMissing: ['m'], fbHeld: ['h1', 'h2'] })
    const { GET } = await import('../social-publish/route')
    const res = await GET(get('Bearer cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stale).toBe(1)
    expect(body.fbWentLive).toBe(1)
    expect(body.fbMissing).toBe(1)
    expect(body.fbHeld).toBe(2)
    expect(body).not.toHaveProperty('published')
    expect(run).toHaveBeenCalledTimes(1)
    // The runner takes no publish hook at all: there is nothing to inject.
    expect(run.mock.calls[0][0]).not.toHaveProperty('publish')
  })

  it('500s (without crashing) when the pass throws', async () => {
    run.mockRejectedValue(new Error('db down'))
    const { GET } = await import('../social-publish/route')
    const res = await GET(get('Bearer cron-secret'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('db down')
  })
})
