import { describe, expect, it, vi } from 'vitest'
import { MAX_ATTEMPTS, type SocialPost } from '../social/queue'
import {
  runSocialPublish,
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

/** In-memory store with a real compare-and-swap on claim(). */
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
      return true
    },
    async update(id, patch) {
      patches.push({ id, patch })
      const row = rows.find((r) => r.id === id)
      if (row) Object.assign(row, patch)
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

  it('missing account: failed with a clear message, no Meta call', async () => {
    const { store, rows } = memoryStore([post()], [])
    const publish = vi.fn()
    const result = await runSocialPublish({ store, now: NOW, publish })
    expect(publish).not.toHaveBeenCalled()
    expect(result.failed).toEqual(['p1'])
    expect(rows[0].last_error).toMatch(/No Instagram account connected/)
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

  it('Facebook posts Meta was holding: flip to published once is_published, stamp the library', async () => {
    const fbAccount: SocialAccount = { ...account, platform: 'facebook', external_id: 'page1' }
    const { store, rows, stamped } = memoryStore(
      [post({ id: 'fb1', platform: 'facebook', status: 'scheduled', platform_post_id: 'page1_77', scheduled_at: '2026-09-01T13:50:00Z' })],
      [fbAccount]
    )
    const fbPostState = vi.fn(async () => ({ isPublished: true }))
    const result = await runSocialPublish({ store, now: NOW, publish: vi.fn(), fbPostState })
    expect(result.fbWentLive).toEqual(['fb1'])
    expect(rows[0].status).toBe('published')
    expect(stamped[0].ref).toBe('fb:page1_77')
  })

  it('Facebook post deleted in Planner → cancelled; a blip leaves it scheduled', async () => {
    const fbAccount: SocialAccount = { ...account, platform: 'facebook', external_id: 'page1' }
    const { store, rows } = memoryStore(
      [
        post({ id: 'gone', platform: 'facebook', status: 'scheduled', platform_post_id: 'page1_1', scheduled_at: '2026-09-01T13:50:00Z' }),
        post({ id: 'blip', platform: 'facebook', status: 'scheduled', platform_post_id: 'page1_2', scheduled_at: '2026-09-01T13:50:00Z' }),
      ],
      [fbAccount]
    )
    const fbPostState = vi.fn(async (_t: string, id: string) => {
      if (id === 'page1_1') throw new MetaApiError(400, { code: 100, error_subcode: 33, message: 'Unsupported get request' }, 'x')
      throw new MetaApiError(500, null, 'boom')
    })
    const result = await runSocialPublish({ store, now: NOW, publish: vi.fn(), fbPostState })
    expect(result.fbMissing).toEqual(['gone'])
    expect(rows[0].status).toBe('cancelled')
    expect(rows[1].status).toBe('scheduled')
  })

  it('skips the went-live check inside the grace minute', async () => {
    const fbAccount: SocialAccount = { ...account, platform: 'facebook', external_id: 'page1' }
    const { store } = memoryStore(
      [post({ id: 'fb1', platform: 'facebook', status: 'scheduled', platform_post_id: 'page1_77', scheduled_at: '2026-09-01T13:59:30Z' })],
      [fbAccount]
    )
    const fbPostState = vi.fn(async () => ({ isPublished: true }))
    await runSocialPublish({ store, now: NOW, publish: vi.fn(), fbPostState })
    expect(fbPostState).not.toHaveBeenCalled()
  })
})
