import { describe, expect, it, vi } from 'vitest'
import { STALE_PUBLISHING_MS, type PostStatus, type SocialPost } from '../social/queue'
import {
  appendPostRef,
  RECONCILE_GRACE_MS,
  runSocialReconcile,
  STALE_PUBLISHING_MESSAGE,
  type PostPatch,
  type SocialAccount,
  type SocialStore,
} from '../social/service'
import { MetaApiError } from '../social/meta'
import { GbpApiError } from '../gbp/posts'

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

// The cron is reconciliation only (product rule 2026-09-01): it never creates
// or publishes anything at Meta. These tests prove it only reads held posts
// back and reflects what Meta did, and leaves everything else alone.

const NOW = new Date('2026-09-01T14:00:00Z')

function post(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'p1',
    org_id: 'org1',
    platform: 'facebook',
    post_type: 'image',
    caption: 'Fence done',
    media: [{ path: 'org1/captures/job/1.heic', content_type: 'image/heic' }],
    derived_media: [{ path: 'org1/derived/abc.jpg', public_url: 'https://cdn/abc.jpg' }],
    scheduled_at: '2026-09-01T13:50:00Z',
    approved_at: '2026-08-31T22:00:00Z',
    published_at: null,
    platform_post_id: 'page1_77',
    ig_container_id: null,
    cta_type: null,
    cta_url: null,
    status: 'scheduled',
    last_error: null,
    attempts: 1,
    group_id: 'g1',
    created_at: '2026-08-31T21:00:00Z',
    updated_at: '2026-08-31T22:00:00Z',
    ...over,
  }
}

const fbAccount: SocialAccount = {
  id: 'a1',
  org_id: 'org1',
  platform: 'facebook',
  external_id: 'page1',
  page_id: null,
  display_name: 'Gunn',
  token: 'tok',
  token_expires_at: null,
}

/** In-memory store with a real compare-and-swap on transitionFrom(). */
function memoryStore(rows: SocialPost[], accounts: SocialAccount[] = [fbAccount]) {
  const stamped: Array<{ orgId: string; paths: string[]; ref: string }> = []
  const patches: Array<{ id: string; patch: PostPatch }> = []
  const store: SocialStore = {
    async listScheduledFacebook(before) {
      return rows.filter(
        (r) => r.status === 'scheduled' && r.platform === 'facebook' && r.scheduled_at && Date.parse(r.scheduled_at) <= before.getTime()
      )
    },
    async listScheduledGoogle(before) {
      return rows.filter(
        (r) => r.status === 'scheduled' && r.platform === 'google' && r.scheduled_at && Date.parse(r.scheduled_at) <= before.getTime()
      )
    },
    async update(id, patch) {
      patches.push({ id, patch })
      const row = rows.find((r) => r.id === id)
      if (row) Object.assign(row, patch, { updated_at: new Date().toISOString() })
    },
    async transitionFrom(id, from, patch) {
      const allowed: PostStatus[] = Array.isArray(from) ? from : [from]
      const row = rows.find((r) => r.id === id)
      if (!row || !allowed.includes(row.status)) return false
      patches.push({ id, patch })
      Object.assign(row, patch, { updated_at: new Date().toISOString() })
      return true
    },
    async failStale(before) {
      const out: string[] = []
      for (const row of rows) {
        if (row.status === 'publishing' && Date.parse(row.updated_at) < before.getTime()) {
          row.status = 'failed'
          row.last_error = STALE_PUBLISHING_MESSAGE
          out.push(row.id)
        }
      }
      return out
    },
    async loadAccount(orgId, platform) {
      return accounts.find((a) => a.org_id === orgId && a.platform === platform) ?? null
    },
    async stampPosted(orgId, paths, ref) {
      stamped.push({ orgId, paths, ref })
    },
  }
  return { store, rows, stamped, patches }
}

describe('runSocialReconcile', () => {
  it('a held Facebook post Meta published → published, published_at, library stamped', async () => {
    const { store, rows, stamped } = memoryStore([post()])
    const fbPostState = vi.fn(async () => ({ isPublished: true }))
    const result = await runSocialReconcile({ store, now: NOW, fbPostState })
    expect(result.fbWentLive).toEqual(['p1'])
    expect(rows[0].status).toBe('published')
    expect(rows[0].published_at).toBe(NOW.toISOString())
    expect(rows[0].platform_post_id).toBe('page1_77')
    expect(stamped).toEqual([{ orgId: 'org1', paths: ['org1/captures/job/1.heic'], ref: 'fb:page1_77' }])
    expect(fbPostState).toHaveBeenCalledWith('tok', 'page1_77', 'post')
  })

  it('only ever READS Meta: no fetch, no create/publish call, whatever the rows look like', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('the cron must not reach Meta on its own')
    })
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const { store, rows } = memoryStore([
        post({ id: 'draft', status: 'draft' }),
        post({ id: 'legacy-approved', status: 'approved', platform_post_id: null }),
        post({ id: 'ig-approved', status: 'approved', platform: 'instagram', platform_post_id: null }),
        post({ id: 'ig-draft', status: 'draft', platform: 'instagram', platform_post_id: null }),
        post({ id: 'failed', status: 'failed' }),
      ])
      const fbPostState = vi.fn(async () => ({ isPublished: true }))
      const gbpPostState = vi.fn(async () => ({ state: 'LIVE' }))
      const result = await runSocialReconcile({ store, now: NOW, fbPostState, gbpPostState })
      expect(fbPostState).not.toHaveBeenCalled()
      expect(gbpPostState).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(result).toEqual({
        stale: [],
        fbWentLive: [],
        fbMissing: [],
        fbHeld: [],
        googleWentLive: [],
        googleMissing: [],
        googleHeld: [],
      })
      expect(rows.map((r) => r.status)).toEqual(['draft', 'approved', 'approved', 'draft', 'failed'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('with the REAL vendor transports (no injected readers): every Meta/GBP call is a GET — zero POST/DELETE, even when held posts went live', async () => {
    const calls: Array<{ method: string; host: string; path: string }> = []
    const fetchSpy = vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      calls.push({ method: init?.method ?? 'GET', host: url.host, path: url.pathname })
      const body =
        url.host === 'oauth2.googleapis.com'
          ? { access_token: 'gbp-token', expires_in: 3600 }
          : url.host === 'mybusiness.googleapis.com'
            ? { name: 'accounts/1/locations/2/localPosts/9', state: 'LIVE' }
            : { id: 'page1_77', is_published: true, scheduled_publish_time: 1 }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      }
    })
    vi.stubGlobal('fetch', fetchSpy)
    process.env.GBP_CLIENT_ID = 'cid'
    process.env.GBP_CLIENT_SECRET = 'shh'
    process.env.GBP_REFRESH_TOKEN = 'refresh'
    try {
      const { store, rows, stamped } = memoryStore([
        post(),
        post({ id: 'draft', status: 'draft', platform_post_id: null }),
        post({ id: 'legacy-approved', status: 'approved', platform_post_id: null }),
        post({ id: 'ig-approved', status: 'approved', platform: 'instagram', platform_post_id: null }),
        post({ id: 'failed', status: 'failed' }),
        post({ id: 'fresh-claim', status: 'publishing', platform_post_id: null, updated_at: new Date(NOW.getTime() - 60_000).toISOString() }),
        post({ id: 'goog', platform: 'google', platform_post_id: 'accounts/1/locations/2/localPosts/9' }),
      ])
      const result = await runSocialReconcile({ store, now: NOW })
      expect(result.fbWentLive).toEqual(['p1'])
      expect(result.googleWentLive).toEqual(['goog'])
      expect(rows[0].status).toBe('published')
      expect(rows[6].status).toBe('published')
      expect(stamped).toHaveLength(2)
      expect(stamped[1].ref).toBe('gbp:accounts/1/locations/2/localPosts/9')
      // Reads of the held posts' own nodes, plus (at most) one Google token
      // refresh POST — never a content POST or a DELETE on either vendor.
      const contentCalls = calls.filter((c) => c.host !== 'oauth2.googleapis.com')
      expect(contentCalls).toEqual([
        { method: 'GET', host: 'graph.facebook.com', path: '/v26.0/page1_77' },
        { method: 'GET', host: 'mybusiness.googleapis.com', path: '/v4/accounts/1/locations/2/localPosts/9' },
      ])
      expect(rows.slice(1, 6).map((r) => r.status)).toEqual(['draft', 'approved', 'approved', 'failed', 'publishing'])
    } finally {
      vi.unstubAllGlobals()
      delete process.env.GBP_CLIENT_ID
      delete process.env.GBP_CLIENT_SECRET
      delete process.env.GBP_REFRESH_TOKEN
    }
  })

  it('a read-back blip never writes its reason onto a row a user moved meanwhile (compare-and-swap)', async () => {
    const { store, rows } = memoryStore([post()])
    const fbPostState = vi.fn(async () => {
      // Joseph unapproves while the Meta read is in flight.
      rows[0].status = 'draft'
      rows[0].platform_post_id = null
      throw new MetaApiError(500, null, 'boom')
    })
    const result = await runSocialReconcile({ store, now: NOW, fbPostState })
    expect(result.fbHeld).toEqual(['p1'])
    expect(rows[0].status).toBe('draft')
    expect(rows[0].last_error).toBeNull()
  })

  it('a scheduled Facebook VIDEO is read back as a video node', async () => {
    const { store, rows } = memoryStore([
      post({
        id: 'vid',
        post_type: 'video',
        media: [{ path: 'org1/captures/job/1.mov', content_type: 'video/quicktime' }],
        platform_post_id: '9001',
      }),
    ])
    const fbPostState = vi.fn(async (_t: string, _id: string, kind: string) => ({ isPublished: kind === 'video' }))
    const result = await runSocialReconcile({ store, now: NOW, fbPostState })
    expect(fbPostState).toHaveBeenCalledWith('tok', '9001', 'video')
    expect(result.fbWentLive).toEqual(['vid'])
    expect(rows[0].status).toBe('published')
  })

  it('deleted in Planner → cancelled; a blip or a bare (#100) leaves it scheduled with the reason', async () => {
    const { store, rows } = memoryStore([
      post({ id: 'gone', platform_post_id: 'page1_1' }),
      post({ id: 'blip', platform_post_id: 'page1_2' }),
      post({ id: 'field', platform_post_id: 'page1_3' }),
    ])
    const fbPostState = vi.fn(async (_t: string, id: string) => {
      if (id === 'page1_1') throw new MetaApiError(400, { code: 100, error_subcode: 33, message: 'Unsupported get request' }, 'x')
      if (id === 'page1_3') {
        throw new MetaApiError(400, { code: 100, message: 'Tried accessing nonexisting field (is_published) on node type (Video)' }, 'x')
      }
      throw new MetaApiError(500, null, 'boom')
    })
    const result = await runSocialReconcile({ store, now: NOW, fbPostState })
    expect(result.fbMissing).toEqual(['gone'])
    expect(result.fbHeld.sort()).toEqual(['blip', 'field'])
    expect(rows[0].status).toBe('cancelled')
    expect(rows[1].status).toBe('scheduled')
    expect(rows[2].status).toBe('scheduled')
    expect(rows[2].last_error).toMatch(/nonexisting field/)
  })

  it('still unpublished at Meta (late) → left scheduled, reported as held', async () => {
    const { store, rows } = memoryStore([post()])
    const fbPostState = vi.fn(async () => ({ isPublished: false }))
    const result = await runSocialReconcile({ store, now: NOW, fbPostState })
    expect(result.fbHeld).toEqual(['p1'])
    expect(rows[0].status).toBe('scheduled')
  })

  it('skips the went-live check inside the grace minute', async () => {
    const { store } = memoryStore([post({ scheduled_at: new Date(NOW.getTime() - RECONCILE_GRACE_MS + 30_000).toISOString() })])
    const fbPostState = vi.fn(async () => ({ isPublished: true }))
    await runSocialReconcile({ store, now: NOW, fbPostState })
    expect(fbPostState).not.toHaveBeenCalled()
  })

  it('a missing account or a decrypt failure leaves the row scheduled and the run continues', async () => {
    const { store, rows } = memoryStore([post({ id: 'bad' }), post({ id: 'good', platform_post_id: 'page1_78' })])
    const original = store.loadAccount
    let calls = 0
    store.loadAccount = async (orgId, platform) => {
      calls += 1
      if (calls === 1) throw new Error('decrypt: bad key')
      return original(orgId, platform)
    }
    const fbPostState = vi.fn(async () => ({ isPublished: true }))
    const errors: string[] = []
    const result = await runSocialReconcile({ store, now: NOW, fbPostState, onError: (m) => errors.push(m) })
    expect(rows[0].status).toBe('scheduled')
    expect(result.fbHeld).toEqual(['bad'])
    expect(result.fbWentLive).toEqual(['good'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/decrypt/)
  })

  it('a DB failure AFTER Meta published never marks the live post failed', async () => {
    const { store, rows } = memoryStore([post()])
    const original = store.update
    let updates = 0
    store.update = async (id, patch) => {
      updates += 1
      // The first 'published' write fails; the retry with the reason succeeds.
      if (patch.status === 'published' && updates === 1) throw new Error('supabase: connection reset')
      return original(id, patch)
    }
    const errors: string[] = []
    const result = await runSocialReconcile({ store, now: NOW, fbPostState: async () => ({ isPublished: true }), onError: (m) => errors.push(m) })
    expect(result.fbWentLive).toEqual(['p1'])
    expect(rows[0].status).toBe('published')
    expect(errors[0]).toMatch(/Published on Meta as page1_77/)
  })

  it('a stamp failure after publish keeps the row published and reports it', async () => {
    const { store, rows } = memoryStore([post()])
    store.stampPosted = async () => {
      throw new Error('capture_uploads: timeout')
    }
    const errors: string[] = []
    await runSocialReconcile({ store, now: NOW, fbPostState: async () => ({ isPublished: true }), onError: (m) => errors.push(m) })
    expect(rows[0].status).toBe('published')
    expect(errors[0]).toMatch(/library could not be stamped/)
  })

  it('a held Google post that went LIVE → published, library stamped with gbp:<name>', async () => {
    const name = 'accounts/1/locations/2/localPosts/9'
    const { store, rows, stamped } = memoryStore([post({ id: 'g1', platform: 'google', platform_post_id: name })])
    const gbpPostState = vi.fn(async () => ({ state: 'LIVE' }))
    const result = await runSocialReconcile({ store, now: NOW, fbPostState: vi.fn(), gbpPostState })
    expect(gbpPostState).toHaveBeenCalledWith(name)
    expect(result.googleWentLive).toEqual(['g1'])
    expect(rows[0].status).toBe('published')
    expect(rows[0].published_at).toBe(NOW.toISOString())
    expect(stamped).toEqual([{ orgId: 'org1', paths: ['org1/captures/job/1.heic'], ref: `gbp:${name}` }])
  })

  it('a held Google post deleted in Business Profile Manager → cancelled; a blip leaves it scheduled with the reason', async () => {
    const { store, rows } = memoryStore([
      post({ id: 'gone', platform: 'google', platform_post_id: 'accounts/1/locations/2/localPosts/1' }),
      post({ id: 'blip', platform: 'google', platform_post_id: 'accounts/1/locations/2/localPosts/2' }),
    ])
    const gbpPostState = vi.fn(async (name: string) => {
      if (name.endsWith('/1')) throw new GbpApiError('gone', 404, 'NOT_FOUND')
      throw new GbpApiError('boom', 500, null)
    })
    const result = await runSocialReconcile({ store, now: NOW, fbPostState: vi.fn(), gbpPostState })
    expect(result.googleMissing).toEqual(['gone'])
    expect(result.googleHeld).toEqual(['blip'])
    expect(rows[0].status).toBe('cancelled')
    expect(rows[0].last_error).toMatch(/Business Profile Manager/)
    expect(rows[1].status).toBe('scheduled')
    expect(rows[1].last_error).toBe('boom')
  })

  it('a held Google post still SCHEDULED (or PROCESSING) is left alone and reported as held', async () => {
    const { store, rows } = memoryStore([
      post({ id: 'late', platform: 'google', platform_post_id: 'accounts/1/locations/2/localPosts/3' }),
      post({ id: 'proc', platform: 'google', platform_post_id: 'accounts/1/locations/2/localPosts/4' }),
    ])
    const gbpPostState = vi.fn(async (name: string) => ({ state: name.endsWith('/3') ? 'SCHEDULED' : 'PROCESSING' }))
    const result = await runSocialReconcile({ store, now: NOW, fbPostState: vi.fn(), gbpPostState })
    expect(result.googleHeld.sort()).toEqual(['late', 'proc'])
    expect(rows.map((r) => r.status)).toEqual(['scheduled', 'scheduled'])
  })

  it('a Google read-back blip never writes its reason onto a row a user moved meanwhile (compare-and-swap)', async () => {
    const { store, rows } = memoryStore([post({ id: 'g1', platform: 'google', platform_post_id: 'accounts/1/locations/2/localPosts/5' })])
    const gbpPostState = vi.fn(async () => {
      rows[0].status = 'draft'
      rows[0].platform_post_id = null
      throw new GbpApiError('boom', 500, null)
    })
    const result = await runSocialReconcile({ store, now: NOW, fbPostState: vi.fn(), gbpPostState })
    expect(result.googleHeld).toEqual(['g1'])
    expect(rows[0].status).toBe('draft')
    expect(rows[0].last_error).toBeNull()
  })

  it('sweeps rows stuck in publishing for 15+ minutes to failed', async () => {
    const stale = new Date(NOW.getTime() - STALE_PUBLISHING_MS - 1000).toISOString()
    const fresh = new Date(NOW.getTime() - 60_000).toISOString()
    const { store, rows } = memoryStore([
      post({ id: 'old', status: 'publishing', platform_post_id: null, updated_at: stale }),
      post({ id: 'new', status: 'publishing', platform_post_id: null, updated_at: fresh }),
    ])
    const result = await runSocialReconcile({ store, now: NOW, fbPostState: vi.fn() })
    expect(result.stale).toEqual(['old'])
    expect(rows[0].status).toBe('failed')
    expect(rows[0].last_error).toBe(STALE_PUBLISHING_MESSAGE)
    expect(rows[1].status).toBe('publishing')
  })
})

describe('appendPostRef', () => {
  it('keeps every reference for one file and never duplicates', () => {
    expect(appendPostRef(null, 'fb:1')).toBe('fb:1')
    expect(appendPostRef('fb:1', 'ig:2')).toBe('fb:1 ig:2')
    expect(appendPostRef('fb:1 ig:2', 'ig:2')).toBe('fb:1 ig:2')
    expect(appendPostRef('gbp', 'fb:1')).toBe('gbp fb:1')
    expect(appendPostRef('x'.repeat(200), 'fb:1')).toHaveLength(120)
  })
})
