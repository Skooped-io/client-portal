import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { encrypt } from '@/lib/crypto'

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

type TableResult = { data: unknown; error: unknown }
/** A table entry is a fixed result or a function of the query builder calls made. */
type TableEntry = TableResult | ((ops: string[]) => TableResult)

function chain(entry: TableEntry, ops: string[]) {
  const resolve = () => (typeof entry === 'function' ? entry(ops) : entry)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxy: any = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (res: (v: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(resolve()).then(res, rej)
      }
      return (...args: unknown[]) => {
        ops.push(typeof prop === 'string' ? `${prop}:${JSON.stringify(args)}` : String(prop))
        return proxy
      }
    },
    apply() {
      return proxy
    },
  })
  return proxy
}

const tables = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  calls: [] as string[],
  ops: [] as Array<{ table: string; ops: string[] }>,
}))
const prepare = vi.hoisted(() => vi.fn())
const meta = vi.hoisted(() => ({
  publishNow: vi.fn(),
  scheduleOnFacebook: vi.fn(),
  fbDeletePost: vi.fn(),
  fbGetPost: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      tables.calls.push(table)
      const ops: string[] = []
      tables.ops.push({ table, ops })
      return chain((tables.current[table] as TableEntry) ?? { data: null, error: null }, ops)
    },
  }),
}))

// Never load sharp/libheif or reach Meta from a route test.
vi.mock('@/lib/social/media', () => ({ prepareMediaForMeta: prepare }))
vi.mock('@/lib/social/meta', async (orig) => ({
  ...(await orig<typeof import('@/lib/social/meta')>()),
  fbDeletePost: meta.fbDeletePost,
  fbGetPost: meta.fbGetPost,
}))
vi.mock('@/lib/social/service', async (orig) => ({
  ...(await orig<typeof import('@/lib/social/service')>()),
  publishNow: meta.publishNow,
  scheduleOnFacebook: meta.scheduleOnFacebook,
}))
vi.mock('@/lib/logger', () => ({
  portal: { event: vi.fn(), error: vi.fn() },
  flush: vi.fn().mockResolvedValue(undefined),
}))

const TOKEN = 'material-token-0123456789'
const ID = '11111111-2222-4333-8444-555555555555'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/material/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function draft(over: Record<string, unknown> = {}) {
  return {
    id: ID,
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

const org = { data: { id: 'org1', name: 'Gunn' }, error: null }
const account = {
  data: {
    id: 'a1',
    org_id: 'org1',
    platform: 'instagram',
    external_id: 'ig1',
    page_id: 'page1',
    display_name: 'Gunn',
    access_token_enc: encrypt('page-token'),
    token_expires_at: null,
  },
  error: null,
}

/** social_posts: the load returns `row`; a status-conditioned update matches `casRows` rows. */
function postsTable(row: unknown, casRows = 1): TableEntry {
  return (ops) => (ops.some((o) => o.startsWith('update:')) ? { data: Array.from({ length: casRows }, () => ({ id: ID })), error: null } : { data: row, error: null })
}

/** The status patch of every social_posts update issued, in order. */
function statusWrites(): Array<Record<string, unknown>> {
  return tables.ops
    .filter((t) => t.table === 'social_posts')
    .flatMap((t) => t.ops.filter((o) => o.startsWith('update:')))
    .map((o) => JSON.parse(o.slice('update:'.length))[0] as Record<string, unknown>)
}

function seed(row: unknown, extra: Record<string, TableEntry> = {}, casRows = 1) {
  tables.current = { organizations: org, social_posts: postsTable(row, casRows), social_accounts: account, ...extra }
}

describe('POST /api/material/post', () => {
  beforeEach(() => {
    tables.current = {}
    tables.calls.length = 0
    tables.ops.length = 0
    prepare.mockReset()
    prepare.mockResolvedValue([{ path: 'org1/derived/d.jpg', public_url: 'https://x/d.jpg' }])
    meta.publishNow.mockReset()
    meta.publishNow.mockResolvedValue({ platformPostId: 'ig-media-1', postRef: 'ig:ig-media-1' })
    meta.scheduleOnFacebook.mockReset()
    meta.scheduleOnFacebook.mockResolvedValue({ platformPostId: 'page1_9', postRef: 'fb:page1_9' })
    meta.fbDeletePost.mockReset()
    meta.fbDeletePost.mockResolvedValue(undefined)
    meta.fbGetPost.mockReset()
  })

  it('404s without a token, before any lookup', async () => {
    const { POST } = await import('../post/route')
    const res = await POST(req({ id: ID, action: 'approve' }))
    expect(res.status).toBe(404)
    expect(tables.calls).toEqual([])
  })

  it('400s on a bad action or missing id', async () => {
    const { POST } = await import('../post/route')
    expect((await POST(req({ token: TOKEN, id: ID, action: 'publish' }))).status).toBe(400)
    expect((await POST(req({ token: TOKEN, action: 'approve' }))).status).toBe(400)
    expect(tables.calls).toEqual([])
  })

  it('404s a non-uuid id before touching the database', async () => {
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: 'abc', action: 'approve' }))
    expect(res.status).toBe(404)
    expect(tables.calls).toEqual([])
  })

  it('404s when the post is not in the token org', async () => {
    tables.current = { organizations: org, social_posts: { data: null, error: null } }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve' }))
    expect(res.status).toBe(404)
  })

  it('approve without a caption is refused before media prep or account lookup', async () => {
    tables.current = { organizations: org, social_posts: { data: draft(), error: null } }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/caption/i)
    expect(prepare).not.toHaveBeenCalled()
    expect(tables.calls).not.toContain('social_accounts')
  })

  it('approve with an over-limit Instagram caption is refused', async () => {
    tables.current = { organizations: org, social_posts: { data: draft(), error: null } }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'x'.repeat(2201) }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/2,200/)
  })

  it('approve with no connected account is a 409 naming the fix, with no media prep', async () => {
    tables.current = { organizations: org, social_posts: { data: draft(), error: null }, social_accounts: { data: null, error: null } }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/npm run social-account/)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('refuses state-machine violations with 409', async () => {
    tables.current = { organizations: org, social_posts: { data: draft({ status: 'published' }), error: null } }
    const { POST } = await import('../post/route')
    for (const action of ['update', 'approve', 'unapprove', 'delete']) {
      const res = await POST(req({ token: TOKEN, id: ID, action, caption: 'x' }))
      expect(res.status).toBe(409)
    }
  })

  it('update saves an empty caption on a draft, rejects a bad or offset-less schedule time, never touches Meta', async () => {
    seed(draft())
    const { POST } = await import('../post/route')
    expect((await POST(req({ token: TOKEN, id: ID, action: 'update', caption: '' }))).status).toBe(200)
    expect((await POST(req({ token: TOKEN, id: ID, action: 'update', scheduled_at: 'soon' }))).status).toBe(400)
    expect((await POST(req({ token: TOKEN, id: ID, action: 'update', scheduled_at: '2026-09-02T09:00' }))).status).toBe(400)
    expect(prepare).not.toHaveBeenCalled()
    expect(meta.publishNow).not.toHaveBeenCalled()
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
  })

  // ── the positive side of the gate ─────────────────────────────────────────

  it('IG draft with a far-future time → approved, zero Meta calls, attempts reset', async () => {
    seed(draft({ attempts: 3, status: 'failed' }))
    const { POST } = await import('../post/route')
    const when = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: when }))
    expect(res.status).toBe(200)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(meta.publishNow).not.toHaveBeenCalled()
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
    const writes = statusWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].status).toBe('approved')
    expect(writes[0].attempts).toBe(0)
    expect(writes[0].derived_media).toEqual([{ path: 'org1/derived/d.jpg', public_url: 'https://x/d.jpg' }])
  })

  it('IG draft with a blank time → claimed into publishing, publishNow exactly once, then published', async () => {
    seed(draft())
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: null }))
    expect(res.status).toBe(200)
    expect(meta.publishNow).toHaveBeenCalledTimes(1)
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
    const input = meta.publishNow.mock.calls[0][0]
    expect(input.post.status).toBe('publishing')
    expect(input.deadline).toBeGreaterThan(Date.now())
    const writes = statusWrites()
    expect(writes[0].status).toBe('publishing')
    expect(writes[0].attempts).toBe(1)
    expect(writes[1].status).toBe('published')
    expect(writes[1].platform_post_id).toBe('ig-media-1')
  })

  it('FB draft 2 hours out → claimed into publishing, scheduleOnFacebook once, then scheduled', async () => {
    seed(draft({ platform: 'facebook' }), { social_accounts: { ...account, data: { ...account.data, platform: 'facebook', external_id: 'page1' } } })
    const { POST } = await import('../post/route')
    const when = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: when }))
    expect(res.status).toBe(200)
    expect(meta.scheduleOnFacebook).toHaveBeenCalledTimes(1)
    expect(meta.publishNow).not.toHaveBeenCalled()
    const writes = statusWrites()
    expect(writes[0].status).toBe('publishing')
    expect(writes[1].status).toBe('scheduled')
    expect(writes[1].platform_post_id).toBe('page1_9')
  })

  it('FB draft 5 minutes out → cron (inside the native floor margin), no Meta call', async () => {
    seed(draft({ platform: 'facebook' }))
    const { POST } = await import('../post/route')
    const when = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: when }))
    expect(res.status).toBe(200)
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
    expect(meta.publishNow).not.toHaveBeenCalled()
    expect(statusWrites()[0].status).toBe('approved')
  })

  it('a losing concurrent approve gets a 409 and never reaches Meta', async () => {
    seed(draft(), {}, 0)
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: null }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/changed elsewhere/)
    expect(meta.publishNow).not.toHaveBeenCalled()
  })

  it('a losing concurrent unapprove/delete gets a 409', async () => {
    seed(draft({ status: 'approved' }), {}, 0)
    const { POST } = await import('../post/route')
    expect((await POST(req({ token: TOKEN, id: ID, action: 'unapprove' }))).status).toBe(409)
    expect((await POST(req({ token: TOKEN, id: ID, action: 'delete' }))).status).toBe(409)
  })

  it('a publish-now that times out (transient) goes back to approved for the cron, not failed', async () => {
    seed(draft())
    const { MetaApiError } = await import('@/lib/social/meta')
    meta.publishNow.mockRejectedValue(new MetaApiError(200, { code: 9007, error_subcode: 2207027, message: 'still processing' }, 'x'))
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: null }))
    expect(res.status).toBe(200)
    const writes = statusWrites()
    expect(writes[1].status).toBe('approved')
    expect(writes[1].last_error).toMatch(/still processing/)
  })

  it('a schedule mismatch whose Meta-side delete failed keeps the orphan id on the failed row', async () => {
    seed(draft({ platform: 'facebook' }), { social_accounts: { ...account, data: { ...account.data, platform: 'facebook', external_id: 'page1' } } })
    const { MetaScheduleMismatchError } = await import('@/lib/social/meta')
    meta.scheduleOnFacebook.mockRejectedValue(new MetaScheduleMismatchError('page1_orphan', 1, 2, false))
    const { POST } = await import('../post/route')
    const when = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
    await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: when }))
    const writes = statusWrites()
    expect(writes[1].status).toBe('failed')
    expect(writes[1].platform_post_id).toBe('page1_orphan')
  })

  it('delete of a failed FB row with an unpublished orphan removes it at Meta; a live one is left alone', async () => {
    const fbAccount = { social_accounts: { ...account, data: { ...account.data, platform: 'facebook', external_id: 'page1' } } }
    const { POST } = await import('../post/route')

    seed(draft({ platform: 'facebook', status: 'failed', platform_post_id: 'page1_orphan' }), fbAccount)
    meta.fbGetPost.mockResolvedValue({ id: 'page1_orphan', isPublished: false, scheduledPublishTime: 1, permalinkUrl: null })
    expect((await POST(req({ token: TOKEN, id: ID, action: 'delete' }))).status).toBe(200)
    expect(meta.fbDeletePost).toHaveBeenCalledTimes(1)

    meta.fbDeletePost.mockClear()
    seed(draft({ platform: 'facebook', status: 'failed', platform_post_id: 'page1_live' }), fbAccount)
    meta.fbGetPost.mockResolvedValue({ id: 'page1_live', isPublished: true, scheduledPublishTime: null, permalinkUrl: null })
    expect((await POST(req({ token: TOKEN, id: ID, action: 'delete' }))).status).toBe(200)
    expect(meta.fbDeletePost).not.toHaveBeenCalled()
    // ...and Retry on that row is refused rather than posting it twice.
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Again', scheduled_at: null }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already live/)
    expect(meta.publishNow).not.toHaveBeenCalled()
  })
})
