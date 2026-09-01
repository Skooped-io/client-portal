import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Minimal chainable Supabase fake: every builder method returns the same
 * proxy, awaiting it resolves the configured result for that table.
 */
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      tables.calls.push(table)
      return chain(tables.current[table] ?? { data: null, error: null })
    },
  }),
}))

const TOKEN = 'material-token-0123456789'

function post(body: unknown) {
  return new NextRequest('http://localhost/api/material/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/material/queue', () => {
  beforeEach(() => {
    tables.current = {}
    tables.calls.length = 0
  })

  it('404s without a token and never touches the database', async () => {
    const { POST } = await import('../queue/route')
    const res = await POST(post({ paths: ['a'], platforms: ['facebook'] }))
    expect(res.status).toBe(404)
    expect(tables.calls).toEqual([])
  })

  it('400s on empty paths or missing platforms before any lookup', async () => {
    const { POST } = await import('../queue/route')
    expect((await POST(post({ token: TOKEN, paths: [], platforms: ['facebook'] }))).status).toBe(400)
    expect((await POST(post({ token: TOKEN, paths: ['a'], platforms: [] }))).status).toBe(400)
    expect((await POST(post({ token: TOKEN, paths: ['a'] }))).status).toBe(400)
    expect(tables.calls).toEqual([])
  })

  it("is Facebook-only: ['instagram'] and ['facebook','instagram'] are 400 with the by-hand hint, before any lookup", async () => {
    const { POST } = await import('../queue/route')
    for (const platforms of [['instagram'], ['facebook', 'instagram'], ['tiktok']]) {
      const res = await POST(post({ token: TOKEN, paths: ['org1/captures/j/1.jpg'], platforms }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/Only Facebook/)
      expect(body.error).toMatch(/Business Suite/)
    }
    expect(tables.calls).toEqual([])
  })

  it('404s on an unknown token', async () => {
    tables.current = { organizations: { data: null } }
    const { POST } = await import('../queue/route')
    const res = await POST(post({ token: TOKEN, paths: ['org1/captures/j/1.jpg'], platforms: ['facebook'] }))
    expect(res.status).toBe(404)
  })

  it('refuses a path that is not an uploaded file of this org', async () => {
    tables.current = {
      organizations: { data: { id: 'org1', name: 'Gunn' } },
      capture_uploads: { data: [], error: null },
    }
    const { POST } = await import('../queue/route')
    const res = await POST(post({ token: TOKEN, paths: ['org2/captures/j/1.jpg'], platforms: ['facebook'] }))
    expect(res.status).toBe(400)
    expect(tables.calls).not.toContain('social_posts')
  })

  it('refuses mixed video + photos with the queue rule message', async () => {
    tables.current = {
      organizations: { data: { id: 'org1', name: 'Gunn' } },
      capture_uploads: {
        data: [
          { path: 'org1/captures/j/1.jpg', content_type: 'image/jpeg' },
          { path: 'org1/captures/j/2.mov', content_type: 'video/quicktime' },
        ],
        error: null,
      },
    }
    const { POST } = await import('../queue/route')
    const res = await POST(post({ token: TOKEN, paths: ['org1/captures/j/1.jpg', 'org1/captures/j/2.mov'], platforms: ['facebook'] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Mixing video and photos/)
  })

  it('creates one Facebook draft and returns the row', async () => {
    const rows = [{ id: 'p1', platform: 'facebook', status: 'draft' }]
    tables.current = {
      organizations: { data: { id: 'org1', name: 'Gunn' } },
      capture_uploads: {
        data: [
          { path: 'org1/captures/j/1.heic', content_type: 'image/heic' },
          { path: 'org1/captures/j/2.jpg', content_type: 'image/jpeg' },
        ],
        error: null,
      },
      social_posts: { data: rows, error: null },
    }
    const { POST } = await import('../queue/route')
    const res = await POST(
      post({ token: TOKEN, paths: ['org1/captures/j/2.jpg', 'org1/captures/j/1.heic'], platforms: ['facebook'] })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.posts).toEqual(rows)
    expect(tables.calls).toEqual(['organizations', 'capture_uploads', 'social_posts'])
  })
})
