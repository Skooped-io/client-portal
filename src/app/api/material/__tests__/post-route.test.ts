import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

function chain(result: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxy: any = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(result).then(resolve, reject)
      }
      return () => proxy
    },
    apply() {
      return proxy
    },
  })
  return proxy
}

const tables = vi.hoisted(() => ({ current: {} as Record<string, unknown>, calls: [] as string[] }))
const prepare = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      tables.calls.push(table)
      return chain(tables.current[table] ?? { data: null, error: null })
    },
  }),
}))

// Never load sharp/libheif or reach Meta from a route test.
vi.mock('@/lib/social/media', () => ({ prepareMediaForMeta: prepare }))
vi.mock('@/lib/social/meta', () => ({
  fbDeletePost: vi.fn(),
  MetaApiError: class MetaApiError extends Error {},
}))

const TOKEN = 'material-token-0123456789'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/material/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    org_id: 'org1',
    platform: 'instagram',
    post_type: 'image',
    caption: null,
    media: [{ path: 'org1/captures/j/1.jpg', content_type: 'image/jpeg' }],
    derived_media: null,
    scheduled_at: '2026-09-02T14:00:00.000Z',
    approved_at: null,
    published_at: null,
    platform_post_id: null,
    ig_container_id: null,
    status: 'draft',
    last_error: null,
    attempts: 0,
    group_id: 'g1',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  }
}

describe('POST /api/material/post', () => {
  beforeEach(() => {
    tables.current = {}
    tables.calls.length = 0
    prepare.mockReset()
  })

  it('404s without a token, before any lookup', async () => {
    const { POST } = await import('../post/route')
    const res = await POST(req({ id: 'p1', action: 'approve' }))
    expect(res.status).toBe(404)
    expect(tables.calls).toEqual([])
  })

  it('400s on a bad action or missing id', async () => {
    const { POST } = await import('../post/route')
    expect((await POST(req({ token: TOKEN, id: 'p1', action: 'publish' }))).status).toBe(400)
    expect((await POST(req({ token: TOKEN, action: 'approve' }))).status).toBe(400)
    expect(tables.calls).toEqual([])
  })

  it('404s when the post is not in the token org', async () => {
    tables.current = { organizations: { data: { id: 'org1', name: 'Gunn' } }, social_posts: { data: null, error: null } }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: 'p1', action: 'approve' }))
    expect(res.status).toBe(404)
  })

  it('approve without a caption is refused before media prep or account lookup', async () => {
    tables.current = { organizations: { data: { id: 'org1', name: 'Gunn' } }, social_posts: { data: draft(), error: null } }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: 'p1', action: 'approve' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/caption/i)
    expect(prepare).not.toHaveBeenCalled()
    expect(tables.calls).not.toContain('social_accounts')
  })

  it('approve with an over-limit Instagram caption is refused', async () => {
    tables.current = { organizations: { data: { id: 'org1', name: 'Gunn' } }, social_posts: { data: draft(), error: null } }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: 'p1', action: 'approve', caption: 'x'.repeat(2201) }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/2,200/)
  })

  it('approve with no connected account is a 409 naming the fix, with no media prep', async () => {
    tables.current = {
      organizations: { data: { id: 'org1', name: 'Gunn' } },
      social_posts: { data: draft(), error: null },
      social_accounts: { data: null, error: null },
    }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: 'p1', action: 'approve', caption: 'Ready' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/npm run social-account/)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('refuses state-machine violations with 409', async () => {
    tables.current = {
      organizations: { data: { id: 'org1', name: 'Gunn' } },
      social_posts: { data: draft({ status: 'published' }), error: null },
    }
    const { POST } = await import('../post/route')
    for (const action of ['update', 'approve', 'unapprove', 'delete']) {
      const res = await POST(req({ token: TOKEN, id: 'p1', action, caption: 'x' }))
      expect(res.status).toBe(409)
    }
  })

  it('update saves an empty caption on a draft and rejects a bad schedule time', async () => {
    tables.current = {
      organizations: { data: { id: 'org1', name: 'Gunn' } },
      social_posts: { data: draft(), error: null },
    }
    const { POST } = await import('../post/route')
    expect((await POST(req({ token: TOKEN, id: 'p1', action: 'update', caption: '' }))).status).toBe(200)
    expect((await POST(req({ token: TOKEN, id: 'p1', action: 'update', scheduled_at: 'soon' }))).status).toBe(400)
  })
})
