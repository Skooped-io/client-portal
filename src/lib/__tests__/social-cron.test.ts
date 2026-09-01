import { describe, expect, it, vi } from 'vitest'
import { MAX_ATTEMPTS, STALE_PUBLISHING_MS, type PostStatus, type SocialPost } from '../social/queue'
import {
  appendPostRef,
  runSocialPublish,
  STALE_PUBLISHING_MESSAGE,
  type PostPatch,
  type PublishInput,
  type SocialAccount,
  type SocialStore,
} from '../social/service'
import { MetaApiError } from '../social/meta'

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

const NOW = new Date('2026-09-01T14:00:00Z')

function post(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'p1',
    org_id: 'org1',
    platform: 'instagram',
    post_type: 'image',
    caption: 'Fence done',
    media: [{ path: 'org1/captures/job/1.heic', content_type: 'image/heic' }],
    derived_media: [{ path: 'org1/derived/abc.jpg', public_url: 'https://cdn/abc.jpg' }],
    scheduled_at: '2026-09-01T13:55:00Z',
    approved_at: '2026-08-31T22:00:00Z',
    published_at: null,
    platform_post_id: null,
    ig_container_id: null,
    status: 'approved',
    last_error: null,
    attempts: 0,
    group_id: 'g1',
    created_at: '2026-08-31T21:00:00Z',
    updated_at: '2026-08-31T22:00:00Z',
    ...over,
  }
}

const account: SocialAccount = {
  id: 'a1',
  org_id: 'org1',
  platform: 'instagram',
  external_id: 'ig1',
  page_id: 'page1',
  display_name: 'Gunn',
  token: 'tok',
  token_expires_at: null,
}
const fbAccount: SocialAccount = { ...account, platform: 'facebook', external_id: 'page1' }

/** In-memory store with a real compare-and-swap on claim() and transitionFrom(). */
function memoryStore(rows: SocialPost[], accounts: SocialAccount[] = [account]) {
  const stamped: Array<{ orgId: string; paths: string[]; ref: string }> = []
  const patches: Array<{ id: string; patch: PostPatch }> = []
  const store: SocialStore = {
    async listDue(now) {
      return rows.filter((r) => r.status === 'approved' && (!r.scheduled_at || Date.parse(r.scheduled_at) <= now.getTime()))
    },
    async listScheduledFacebook(before) {
      return rows.filter(
        (r) => r.status === 'scheduled' && r.platform === 'facebook' && r.scheduled_at && Date.parse(r.scheduled_at) <= before.getTime()
      )
    },
    async claim(p) {
      const row = rows.find((r) => r.id === p.id)
      if (!row || row.status !== 'approved') return false
      row.status = 'publishing'
      row.attempts = p.attempts + 1
      row.updated_at = new Date().toISOString()
      return true
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

describe('runSocialPublish', () => {
  it('publishes a due IG post, stores the media id, stamps the library', async () => {
    const { store, rows, stamped } = memoryStore([post()])
    const seen: SocialPost[] = []
    const publish = vi.fn(async (input: PublishInput) => {
      seen.push(input.post)
      return { platformPostId: 'media9', postRef: 'ig:media9' }
    })
    const result = await runSocialPublish({ store, now: NOW, publish })
    expect(result.published).toEqual(['p1'])
    expect(publish).toHaveBeenCalledTimes(1)
    expect(seen[0].status).toBe('publishing')
    expect(rows[0].status).toBe('published')
    expect(rows[0].platform_post_id).toBe('media9')
    expect(rows[0].published_at).toBe(NOW.toISOString())
    expect(stamped).toEqual([{ orgId: 'org1', paths: ['org1/captures/job/1.heic'], ref: 'ig:media9' }])
  })

  it('hands every publish a deadline inside the run budget', async () => {
    const { store } = memoryStore([post()])
    const before = Date.now()
    const publish = vi.fn(async (input: PublishInput) => {
      expect(input.deadline).toBeGreaterThan(before)
      expect(input.deadline).toBeLessThanOrEqual(Date.now() + 240_000)
      return { platformPostId: 'x', postRef: 'ig:x' }
    })
    await runSocialPublish({ store, now: NOW, publish })
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('never publishes a row another run already claimed (double-publish guard)', async () => {
    const { store } = memoryStore([post()])
    // Simulate an overlapping run winning the compare-and-swap between our
    // listDue() and claim().
    const original = store.listDue
    store.listDue = async (now, limit) => {
      const due = await original(now, limit)
      for (const d of due) await store.claim(d)
      return due
    }
    const publish = vi.fn(async () => ({ platformPostId: 'x', postRef: 'ig:x' }))
    const result = await runSocialPublish({ store, now: NOW, publish })
    expect(result.skipped).toEqual(['p1'])
    expect(result.published).toEqual([])
    expect(publish).not.toHaveBeenCalled()
  })

  it('two concurrent runs over the same rows publish each post exactly once', async () => {
    const { store } = memoryStore([post({ id: 'a' }), post({ id: 'b' }), post({ id: 'c' })])
    const publish = vi.fn(async () => ({ platformPostId: 'x', postRef: 'ig:x' }))
    const [r1, r2] = await Promise.all([
      runSocialPublish({ store, now: NOW, publish }),
      runSocialPublish({ store, now: NOW, publish }),
    ])
    const published = [...r1.published, ...r2.published].sort()
    expect(published).toEqual(['a', 'b', 'c'])
    expect(publish).toHaveBeenCalledTimes(3)
  })

  it('does not touch drafts or posts whose time has not come', async () => {
    const { store } = memoryStore([
      post({ id: 'draft', status: 'draft', scheduled_at: '2026-09-01T00:00:00Z' }),
      post({ id: 'later', scheduled_at: '2026-09-01T14:05:00Z' }),
    ])
    const publish = vi.fn()
    const result = await runSocialPublish({ store, now: NOW, publish })
    expect(publish).not.toHaveBeenCalled()
    expect(result.published).toEqual([])
  })

  it('stops claiming once the run budget is spent, leaving the rest approved', async () => {
    const { store, rows } = memoryStore([post({ id: 'a' }), post({ id: 'b' })])
    const publish = vi.fn(async () => ({ platformPostId: 'x', postRef: 'ig:x' }))
    // Budget smaller than the claim reserve: nothing may be claimed.
    const result = await runSocialPublish({ store, now: NOW, publish, budgetMs: 1_000 })
    expect(publish).not.toHaveBeenCalled()
    expect(result.skipped.sort()).toEqual(['a', 'b'])
    expect(rows.every((r) => r.status === 'approved')).toBe(true)
  })

  it('transient Meta failure returns the row to approved with attempts counted', async () => {
    const { store, rows } = memoryStore([post()])
    const publish = vi.fn(async () => {
      throw new MetaApiError(400, { code: 4, message: 'Application request limit reached' }, 'x')
    })
    const result = await runSocialPublish({ store, now: NOW, publish })
    expect(result.retried).toEqual(['p1'])
    expect(rows[0].status).toBe('approved')
    expect(rows[0].attempts).toBe(1)
    expect(rows[0].last_error).toContain('(#4)')
  })

  it('parks a row in failed after MAX_ATTEMPTS transient failures', async () => {
    const { store, rows } = memoryStore([post({ attempts: MAX_ATTEMPTS - 1 })])
    const publish = vi.fn(async () => {
      throw new MetaApiError(503, null, 'Meta POST failed (503)')
    })
    const result = await runSocialPublish({ store, now: NOW, publish })
    expect(result.failed).toEqual(['p1'])
    expect(rows[0].status).toBe('failed')
    expect(rows[0].attempts).toBe(MAX_ATTEMPTS)
  })

  it('permanent Meta failure fails immediately with the error surfaced', async () => {
    const { store, rows } = memoryStore([post()])
    const publish = vi.fn(async () => {
      throw new MetaApiError(400, { code: 190, message: 'Invalid OAuth access token.', error_user_msg: 'Reconnect' }, 'x')
    })
    const result = await runSocialPublish({ store, now: NOW, publish })
    expect(result.failed).toEqual(['p1'])
    expect(rows[0].status).toBe('failed')
    expect(rows[0].last_error).toBe('(#190) Invalid OAuth access token. — Reconnect')
  })

  it('missing account: failed with a clear message, no Meta call, never claimed', async () => {
    const { store, rows } = memoryStore([post()], [])
    const publish = vi.fn()
    const result = await runSocialPublish({ store, now: NOW, publish })
    expect(publish).not.toHaveBeenCalled()
    expect(result.failed).toEqual(['p1'])
    expect(rows[0].status).toBe('failed')
    expect(rows[0].attempts).toBe(0)
    expect(rows[0].last_error).toMatch(/No Instagram account connected/)
  })

  it('account load / decrypt failure lands in failed (not stuck in publishing) and the run continues', async () => {
    const { store, rows } = memoryStore([post({ id: 'bad' }), post({ id: 'good' })])
    const original = store.loadAccount
    let calls = 0
    store.loadAccount = async (orgId, platform) => {
      calls += 1
      if (calls === 1) throw new Error('decrypt: bad key')
      return original(orgId, platform)
    }
    const publish = vi.fn(async () => ({ platformPostId: 'x', postRef: 'ig:x' }))
    const errors: string[] = []
    const result = await runSocialPublish({ store, now: NOW, publish, onError: (m) => errors.push(m) })
    expect(rows[0].status).toBe('failed')
    expect(rows[0].last_error).toMatch(/decrypt/)
    expect(result.published).toEqual(['good'])
    expect(errors).toHaveLength(1)
  })

  it('persists the IG container id as soon as it exists', async () => {
    const { store, rows } = memoryStore([post()])
    const publish = vi.fn(async (input: { onContainer?: (id: string) => Promise<void> }) => {
      await input.onContainer?.('container7')
      return { platformPostId: 'm', postRef: 'ig:m' }
    })
    await runSocialPublish({ store, now: NOW, publish })
    expect(rows[0].ig_container_id).toBe('container7')
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
    const publish = vi.fn(async () => ({ platformPostId: 'live1', postRef: 'ig:live1' }))
    const errors: string[] = []
    const result = await runSocialPublish({ store, now: NOW, publish, onError: (m) => errors.push(m) })
    expect(result.published).toEqual(['p1'])
    expect(rows[0].status).toBe('published')
    expect(rows[0].platform_post_id).toBe('live1')
    expect(errors[0]).toMatch(/Published on Meta as live1/)
  })

  it('a stamp failure after publish keeps the row published and reports it', async () => {
    const { store, rows } = memoryStore([post()])
    store.stampPosted = async () => {
      throw new Error('capture_uploads: timeout')
    }
    const publish = vi.fn(async () => ({ platformPostId: 'live2', postRef: 'ig:live2' }))
    const errors: string[] = []
    await runSocialPublish({ store, now: NOW, publish, onError: (m) => errors.push(m) })
    expect(rows[0].status).toBe('published')
    expect(errors[0]).toMatch(/library could not be stamped/)
  })

  it('sweeps rows stuck in publishing for 15+ minutes to failed, keeping the container id', async () => {
    const stale = new Date(NOW.getTime() - STALE_PUBLISHING_MS - 1000).toISOString()
    const fresh = new Date(NOW.getTime() - 60_000).toISOString()
    const { store, rows } = memoryStore([
      post({ id: 'old', status: 'publishing', ig_container_id: 'c1', updated_at: stale }),
      post({ id: 'new', status: 'publishing', updated_at: fresh }),
    ])
    const result = await runSocialPublish({ store, now: NOW, publish: vi.fn() })
    expect(result.stale).toEqual(['old'])
    expect(rows[0].status).toBe('failed')
    expect(rows[0].ig_container_id).toBe('c1')
    expect(rows[0].last_error).toBe(STALE_PUBLISHING_MESSAGE)
    expect(rows[1].status).toBe('publishing')
  })

  it('Facebook posts Meta was holding: flip to published once is_published, stamp the library', async () => {
    const { store, rows, stamped } = memoryStore(
      [post({ id: 'fb1', platform: 'facebook', status: 'scheduled', platform_post_id: 'page1_77', scheduled_at: '2026-09-01T13:50:00Z' })],
      [fbAccount]
    )
    const fbPostState = vi.fn(async () => ({ isPublished: true }))
    const result = await runSocialPublish({ store, now: NOW, publish: vi.fn(), fbPostState })
    expect(result.fbWentLive).toEqual(['fb1'])
    expect(rows[0].status).toBe('published')
    expect(stamped[0].ref).toBe('fb:page1_77')
    expect(fbPostState).toHaveBeenCalledWith('tok', 'page1_77', 'post')
  })

  it('a scheduled Facebook VIDEO is read back as a video node', async () => {
    const { store, rows } = memoryStore(
      [
        post({
          id: 'vid',
          platform: 'facebook',
          post_type: 'video',
          media: [{ path: 'org1/captures/job/1.mov', content_type: 'video/quicktime' }],
          status: 'scheduled',
          platform_post_id: '9001',
          scheduled_at: '2026-09-01T13:50:00Z',
        }),
      ],
      [fbAccount]
    )
    const fbPostState = vi.fn(async (_t: string, _id: string, kind: string) => ({ isPublished: kind === 'video' }))
    const result = await runSocialPublish({ store, now: NOW, publish: vi.fn(), fbPostState })
    expect(fbPostState).toHaveBeenCalledWith('tok', '9001', 'video')
    expect(result.fbWentLive).toEqual(['vid'])
    expect(rows[0].status).toBe('published')
  })

  it('Facebook post deleted in Planner → cancelled; a blip or a bare (#100) leaves it scheduled', async () => {
    const { store, rows } = memoryStore(
      [
        post({ id: 'gone', platform: 'facebook', status: 'scheduled', platform_post_id: 'page1_1', scheduled_at: '2026-09-01T13:50:00Z' }),
        post({ id: 'blip', platform: 'facebook', status: 'scheduled', platform_post_id: 'page1_2', scheduled_at: '2026-09-01T13:50:00Z' }),
        post({ id: 'field', platform: 'facebook', status: 'scheduled', platform_post_id: 'page1_3', scheduled_at: '2026-09-01T13:50:00Z' }),
      ],
      [fbAccount]
    )
    const fbPostState = vi.fn(async (_t: string, id: string) => {
      if (id === 'page1_1') throw new MetaApiError(400, { code: 100, error_subcode: 33, message: 'Unsupported get request' }, 'x')
      if (id === 'page1_3') {
        throw new MetaApiError(400, { code: 100, message: 'Tried accessing nonexisting field (is_published) on node type (Video)' }, 'x')
      }
      throw new MetaApiError(500, null, 'boom')
    })
    const result = await runSocialPublish({ store, now: NOW, publish: vi.fn(), fbPostState })
    expect(result.fbMissing).toEqual(['gone'])
    expect(rows[0].status).toBe('cancelled')
    expect(rows[1].status).toBe('scheduled')
    expect(rows[2].status).toBe('scheduled')
    expect(rows[2].last_error).toMatch(/nonexisting field/)
  })

  it('skips the went-live check inside the grace minute', async () => {
    const { store } = memoryStore(
      [post({ id: 'fb1', platform: 'facebook', status: 'scheduled', platform_post_id: 'page1_77', scheduled_at: '2026-09-01T13:59:30Z' })],
      [fbAccount]
    )
    const fbPostState = vi.fn(async () => ({ isPublished: true }))
    await runSocialPublish({ store, now: NOW, publish: vi.fn(), fbPostState })
    expect(fbPostState).not.toHaveBeenCalled()
  })
})

describe('appendPostRef', () => {
  it('keeps both platform references for one file and never duplicates', () => {
    expect(appendPostRef(null, 'fb:1')).toBe('fb:1')
    expect(appendPostRef('fb:1', 'ig:2')).toBe('fb:1 ig:2')
    expect(appendPostRef('fb:1 ig:2', 'ig:2')).toBe('fb:1 ig:2')
    expect(appendPostRef('gbp', 'fb:1')).toBe('gbp fb:1')
    expect(appendPostRef('x'.repeat(200), 'fb:1')).toHaveLength(120)
  })
})
