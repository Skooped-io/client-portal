import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { encrypt } from '@/lib/crypto'
import { OUT_OF_WINDOW_MESSAGE } from '@/lib/social/queue'

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
  scheduleOnFacebook: meta.scheduleOnFacebook,
}))
vi.mock('@/lib/logger', () => ({
  portal: { event: vi.fn(), error: vi.fn() },
  flush: vi.fn().mockResolvedValue(undefined),
}))

const TOKEN = 'material-token-0123456789'
const ID = '11111111-2222-4333-8444-555555555555'
const inTwoHours = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString()

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
    platform: 'facebook',
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
    platform: 'facebook',
    external_id: 'page1',
    page_id: null,
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
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', scheduled_at: inTwoHours() }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/caption/i)
    expect(prepare).not.toHaveBeenCalled()
    expect(tables.calls).not.toContain('social_accounts')
  })

  it('approve with an over-limit caption is refused', async () => {
    tables.current = { organizations: org, social_posts: { data: draft(), error: null } }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'x'.repeat(63207), scheduled_at: inTwoHours() }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/63,206/)
  })

  it('approve with no connected account is a 409 naming the fix, with no media prep', async () => {
    tables.current = { organizations: org, social_posts: { data: draft(), error: null }, social_accounts: { data: null, error: null } }
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: inTwoHours() }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/social-account/)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('refuses state-machine violations with 409', async () => {
    tables.current = { organizations: org, social_posts: { data: draft({ status: 'published' }), error: null } }
    const { POST } = await import('../post/route')
    for (const action of ['update', 'approve', 'unapprove', 'delete']) {
      const res = await POST(req({ token: TOKEN, id: ID, action, caption: 'x', scheduled_at: inTwoHours() }))
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
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
  })

  // ── the schedule-only rule ────────────────────────────────────────────────

  it('approve with no time is refused: nothing is prepared, claimed, or sent to Meta', async () => {
    seed(draft())
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: null }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(OUT_OF_WINDOW_MESSAGE)
    expect(prepare).not.toHaveBeenCalled()
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
    expect(statusWrites()).toHaveLength(0)
  })

  it('approve with a past time, 5 minutes out, or 40 days out is refused the same way', async () => {
    seed(draft())
    const { POST } = await import('../post/route')
    const times = [
      new Date(Date.now() - 60_000).toISOString(),
      new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString(),
    ]
    for (const when of times) {
      const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: when }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe(OUT_OF_WINDOW_MESSAGE)
    }
    expect(prepare).not.toHaveBeenCalled()
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
    expect(statusWrites()).toHaveLength(0)
  })

  it('FB draft 2 hours out → claimed into publishing, scheduleOnFacebook once, then scheduled with the Meta id', async () => {
    seed(draft({ attempts: 3, status: 'failed' }))
    const { POST } = await import('../post/route')
    const when = inTwoHours()
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: when }))
    expect(res.status).toBe(200)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(meta.scheduleOnFacebook).toHaveBeenCalledTimes(1)
    const input = meta.scheduleOnFacebook.mock.calls[0][0]
    expect(input.post.status).toBe('publishing')
    expect(input.scheduledAt.toISOString()).toBe(when)
    const writes = statusWrites()
    expect(writes).toHaveLength(2)
    expect(writes[0].status).toBe('publishing')
    expect(writes[0].attempts).toBe(1)
    expect(writes[0].derived_media).toEqual([{ path: 'org1/derived/d.jpg', public_url: 'https://x/d.jpg' }])
    expect(writes[1].status).toBe('scheduled')
    expect(writes[1].platform_post_id).toBe('page1_9')
  })

  it('a legacy Instagram row: approve/update/unapprove are refused, delete still works', async () => {
    const { POST } = await import('../post/route')
    seed(draft({ platform: 'instagram' }))
    for (const action of ['approve', 'update', 'unapprove']) {
      const res = await POST(req({ token: TOKEN, id: ID, action, caption: 'x', scheduled_at: inTwoHours() }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/Instagram has no scheduling API/)
    }
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
    expect((await POST(req({ token: TOKEN, id: ID, action: 'delete' }))).status).toBe(200)
    expect(statusWrites().at(-1)?.status).toBe('cancelled')
  })

  it('a losing concurrent approve gets a 409 and never reaches Meta', async () => {
    seed(draft(), {}, 0)
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: inTwoHours() }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/changed elsewhere/)
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
  })

  it('a losing concurrent unapprove/delete gets a 409', async () => {
    seed(draft({ status: 'approved' }), {}, 0)
    const { POST } = await import('../post/route')
    expect((await POST(req({ token: TOKEN, id: ID, action: 'unapprove' }))).status).toBe(409)
    expect((await POST(req({ token: TOKEN, id: ID, action: 'delete' }))).status).toBe(409)
  })

  it('Meta refusing the schedule parks the row in failed with the reason (never published)', async () => {
    seed(draft())
    const { MetaApiError } = await import('@/lib/social/meta')
    meta.scheduleOnFacebook.mockRejectedValue(new MetaApiError(400, { code: 100, message: 'The specified scheduled publish time is invalid' }, 'x'))
    const { POST } = await import('../post/route')
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: inTwoHours() }))
    expect(res.status).toBe(200)
    const writes = statusWrites()
    expect(writes[1].status).toBe('failed')
    expect(writes[1].last_error).toMatch(/scheduled publish time is invalid/)
    expect(writes[1].platform_post_id).toBeNull()
  })

  it('a schedule mismatch whose Meta-side delete failed keeps the orphan id on the failed row', async () => {
    seed(draft())
    const { MetaScheduleMismatchError } = await import('@/lib/social/meta')
    meta.scheduleOnFacebook.mockRejectedValue(new MetaScheduleMismatchError('page1_orphan', 1, 2, false))
    const { POST } = await import('../post/route')
    await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Ready', scheduled_at: inTwoHours() }))
    const writes = statusWrites()
    expect(writes[1].status).toBe('failed')
    expect(writes[1].platform_post_id).toBe('page1_orphan')
  })

  it('update keeps the orphan id on a failed row; approve of the resulting draft removes the orphan at Meta before scheduling', async () => {
    const { POST } = await import('../post/route')

    // 1. Edit the failed row: it becomes a draft, the orphan id is NOT dropped.
    seed(draft({ status: 'failed', platform_post_id: 'page1_orphan', last_error: 'mismatch' }))
    expect((await POST(req({ token: TOKEN, id: ID, action: 'update', caption: 'Edited' }))).status).toBe(200)
    const edit = statusWrites().at(-1)!
    expect(edit.status).toBe('draft')
    expect(edit).not.toHaveProperty('platform_post_id')
    expect(meta.fbGetPost).not.toHaveBeenCalled()

    // 2. Approve that draft: the orphan is checked and deleted first, then one schedule call.
    tables.ops.length = 0
    seed(draft({ status: 'draft', platform_post_id: 'page1_orphan', caption: 'Edited' }))
    meta.fbGetPost.mockResolvedValue({ id: 'page1_orphan', isPublished: false, scheduledPublishTime: 1, permalinkUrl: null })
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Edited', scheduled_at: inTwoHours() }))
    expect(res.status).toBe(200)
    expect(meta.fbDeletePost).toHaveBeenCalledTimes(1)
    expect(meta.fbDeletePost.mock.calls[0][0].postId).toBe('page1_orphan')
    expect(meta.scheduleOnFacebook).toHaveBeenCalledTimes(1)
    const writes = statusWrites()
    expect(writes[0].status).toBe('publishing')
    expect(writes[0].platform_post_id).toBeNull()
    expect(writes[1].status).toBe('scheduled')
    expect(writes[1].platform_post_id).toBe('page1_9')

    // 3. ...and if that orphan already went live, approve is refused rather than scheduling a second copy.
    meta.fbDeletePost.mockClear()
    meta.scheduleOnFacebook.mockClear()
    seed(draft({ status: 'draft', platform_post_id: 'page1_live', caption: 'Edited' }))
    meta.fbGetPost.mockResolvedValue({ id: 'page1_live', isPublished: true, scheduledPublishTime: null, permalinkUrl: null })
    const live = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Edited', scheduled_at: inTwoHours() }))
    expect(live.status).toBe(409)
    expect((await live.json()).error).toMatch(/already live/)
    expect(meta.fbDeletePost).not.toHaveBeenCalled()
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
  })

  it('delete of a draft that still carries an orphan id removes the orphan at Meta', async () => {
    const { POST } = await import('../post/route')
    seed(draft({ status: 'draft', platform_post_id: 'page1_orphan' }))
    meta.fbGetPost.mockResolvedValue({ id: 'page1_orphan', isPublished: false, scheduledPublishTime: 1, permalinkUrl: null })
    expect((await POST(req({ token: TOKEN, id: ID, action: 'delete' }))).status).toBe(200)
    expect(meta.fbDeletePost).toHaveBeenCalledTimes(1)
    expect(meta.fbDeletePost.mock.calls[0][0].postId).toBe('page1_orphan')
    const last = statusWrites().at(-1)!
    expect(last.status).toBe('cancelled')
    expect(last.platform_post_id).toBeNull()
  })

  it('unapprove of a held post deletes it at Meta first; refused once Meta already published it', async () => {
    const { POST } = await import('../post/route')

    seed(draft({ status: 'scheduled', platform_post_id: 'page1_held', caption: 'c' }))
    meta.fbGetPost.mockResolvedValue({ id: 'page1_held', isPublished: false, scheduledPublishTime: 1, permalinkUrl: null })
    expect((await POST(req({ token: TOKEN, id: ID, action: 'unapprove' }))).status).toBe(200)
    expect(meta.fbDeletePost).toHaveBeenCalledTimes(1)
    expect(statusWrites().at(-1)?.status).toBe('draft')

    meta.fbDeletePost.mockClear()
    seed(draft({ status: 'scheduled', platform_post_id: 'page1_live', caption: 'c' }))
    meta.fbGetPost.mockResolvedValue({ id: 'page1_live', isPublished: true, scheduledPublishTime: null, permalinkUrl: null })
    const res = await POST(req({ token: TOKEN, id: ID, action: 'unapprove' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already went live/)
    expect(meta.fbDeletePost).not.toHaveBeenCalled()
  })

  it('delete of a failed FB row with an unpublished orphan removes it at Meta; a live one is left alone', async () => {
    const { POST } = await import('../post/route')

    seed(draft({ status: 'failed', platform_post_id: 'page1_orphan' }))
    meta.fbGetPost.mockResolvedValue({ id: 'page1_orphan', isPublished: false, scheduledPublishTime: 1, permalinkUrl: null })
    expect((await POST(req({ token: TOKEN, id: ID, action: 'delete' }))).status).toBe(200)
    expect(meta.fbDeletePost).toHaveBeenCalledTimes(1)

    meta.fbDeletePost.mockClear()
    seed(draft({ status: 'failed', platform_post_id: 'page1_live' }))
    meta.fbGetPost.mockResolvedValue({ id: 'page1_live', isPublished: true, scheduledPublishTime: null, permalinkUrl: null })
    expect((await POST(req({ token: TOKEN, id: ID, action: 'delete' }))).status).toBe(200)
    expect(meta.fbDeletePost).not.toHaveBeenCalled()
    // ...and Retry on that row is refused rather than scheduling it twice.
    const res = await POST(req({ token: TOKEN, id: ID, action: 'approve', caption: 'Again', scheduled_at: inTwoHours() }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already live/)
    expect(meta.scheduleOnFacebook).not.toHaveBeenCalled()
  })
})
