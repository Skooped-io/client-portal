import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fbGetPost,
  fbPublishVideo,
  fbSchedulePhotoPost,
  GRAPH_VERSION,
  igWaitForContainer,
  isMetaObjectMissing,
  MetaApiError,
  MetaScheduleMismatchError,
} from '../social/meta'

// Edge cases of the Meta client added by the 2026-08-31 review: read-back
// failure handling, video nodes, the "object missing" classifier, poll backoff.

const TOKEN = 'EAAsecret-token-value'
const PAGE = '609517762255384'

type Call = { url: URL; method: string; body: URLSearchParams | null }

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }
}

const calls: Call[] = []

function queue(...responses: Array<ReturnType<typeof reply>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? new URLSearchParams(init.body) : null })
      const next = responses.shift()
      if (!next) throw new Error(`unexpected fetch #${calls.length}: ${init?.method} ${url.pathname}`)
      return next
    })
  )
}

beforeEach(() => {
  calls.length = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const when = new Date('2026-09-01T14:00:00Z')
const unix = 1788271200
const schedule = () =>
  fbSchedulePhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg'], caption: 'c', scheduledAt: when })

describe('schedule read-back edge cases', () => {
  it('mismatch whose cleanup delete fails carries deleted=false and the post id', async () => {
    queue(
      reply(200, { id: '904', post_id: `${PAGE}_904` }),
      reply(200, { id: `${PAGE}_904`, scheduled_publish_time: unix + 3600 }),
      reply(400, { error: { message: 'cannot delete', code: 10 } })
    )
    const err = await schedule().catch((e) => e)
    expect(err).toBeInstanceOf(MetaScheduleMismatchError)
    expect(err.deleted).toBe(false)
    expect(err.postId).toBe(`${PAGE}_904`)
    expect(err.message).toMatch(/could not be removed/)
  })

  it('mismatch whose delete succeeds reports deleted=true', async () => {
    queue(
      reply(200, { id: '905', post_id: `${PAGE}_905` }),
      reply(200, { id: `${PAGE}_905`, scheduled_publish_time: unix + 3600 }),
      reply(200, { success: true })
    )
    const err = await schedule().catch((e) => e)
    expect(err.deleted).toBe(true)
  })

  it('single photo without post_id: deletes the photo and throws (never reads a Photo node back)', async () => {
    queue(reply(200, { id: '906' }), reply(200, { success: true }))
    const err = await schedule().catch((e) => e)
    expect(err).toBeInstanceOf(MetaApiError)
    expect(err.message).toMatch(/did not return a post id/)
    expect(calls).toHaveLength(2)
    expect(calls[1].method).toBe('DELETE')
    expect(calls[1].url.pathname).toBe(`/${GRAPH_VERSION}/906`)
  })

  it('transient read-back failure returns the post unverified instead of deleting it', async () => {
    queue(
      reply(200, { id: '907', post_id: `${PAGE}_907` }),
      reply(400, { error: { message: 'Application request limit reached', code: 4 } })
    )
    const out = await schedule()
    expect(out).toEqual({ postId: `${PAGE}_907`, photoIds: ['907'], scheduledPublishTime: unix })
    expect(calls).toHaveLength(2)
  })

  it('permanent read-back failure deletes the post and rethrows', async () => {
    queue(
      reply(200, { id: '908', post_id: `${PAGE}_908` }),
      reply(400, { error: { message: 'Invalid OAuth access token.', code: 190 } }),
      reply(200, { success: true })
    )
    const err = await schedule().catch((e) => e)
    expect(err.code).toBe(190)
    expect(calls[2].method).toBe('DELETE')
  })
})

describe('fbPublishVideo', () => {
  it('publish now: one POST, no read-back', async () => {
    queue(reply(200, { id: 'v1' }))
    const out = await fbPublishVideo({ token: TOKEN, pageId: PAGE, videoUrl: 'https://x/v.mp4', description: 'clip' })
    expect(out).toEqual({ videoId: 'v1', scheduledPublishTime: null })
    expect(calls).toHaveLength(1)
    expect(calls[0].body?.get('file_url')).toBe('https://x/v.mp4')
    expect(calls[0].body?.has('published')).toBe(false)
  })

  it('scheduled: reads the VIDEO node back with `published` (not is_published) and checks the time', async () => {
    queue(reply(200, { id: 'v2' }), reply(200, { id: 'v2', published: false, scheduled_publish_time: unix }))
    const out = await fbPublishVideo({ token: TOKEN, pageId: PAGE, videoUrl: 'https://x/v.mp4', description: 'clip', scheduledAt: when })
    expect(out.scheduledPublishTime).toBe(unix)
    expect(calls[0].body?.get('published')).toBe('false')
    expect(calls[0].body?.get('scheduled_publish_time')).toBe(String(unix))
    const fields = calls[1].url.searchParams.get('fields') ?? ''
    expect(fields).toContain('published')
    expect(fields).not.toContain('is_published')
  })

  it('scheduled with a stored-time mismatch: deletes the video and throws', async () => {
    queue(reply(200, { id: 'v3' }), reply(200, { id: 'v3', scheduled_publish_time: unix + 7200 }), reply(200, { success: true }))
    const err = await fbPublishVideo({ token: TOKEN, pageId: PAGE, videoUrl: 'https://x/v.mp4', description: 'clip', scheduledAt: when }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(MetaScheduleMismatchError)
    expect(calls[2].method).toBe('DELETE')
    expect(calls[2].url.pathname).toBe(`/${GRAPH_VERSION}/v3`)
  })
})

describe('fbGetPost', () => {
  it('maps is_published for posts and published for videos', async () => {
    queue(reply(200, { id: 'p', is_published: true }), reply(200, { id: 'v', published: true }))
    expect((await fbGetPost({ token: TOKEN, postId: 'p' })).isPublished).toBe(true)
    expect(calls[0].url.searchParams.get('fields')).toBe('id,is_published,scheduled_publish_time,permalink_url')
    expect((await fbGetPost({ token: TOKEN, postId: 'v', kind: 'video' })).isPublished).toBe(true)
    expect(calls[1].url.searchParams.get('fields')).toBe('id,published,scheduled_publish_time,permalink_url')
  })
})

describe('isMetaObjectMissing', () => {
  it('only a deleted-object error counts, never a bare (#100)', () => {
    expect(isMetaObjectMissing(new MetaApiError(400, { code: 100, error_subcode: 33, message: 'Unsupported get request' }, 'x'))).toBe(true)
    expect(isMetaObjectMissing(new MetaApiError(400, { code: 100, message: 'Object with ID x does not exist' }, 'x'))).toBe(true)
    expect(isMetaObjectMissing(new MetaApiError(400, { code: 803, message: 'alias' }, 'x'))).toBe(true)
    expect(isMetaObjectMissing(new MetaApiError(404, null, 'x'))).toBe(true)
    expect(
      isMetaObjectMissing(
        new MetaApiError(400, { code: 100, message: 'Tried accessing nonexisting field (is_published) on node type (Video)' }, 'x')
      )
    ).toBe(false)
    expect(isMetaObjectMissing(new MetaApiError(400, { code: 100, message: 'The specified scheduled publish time is invalid' }, 'x'))).toBe(false)
    expect(isMetaObjectMissing(new MetaApiError(400, { code: 190, message: 'token' }, 'x'))).toBe(false)
    expect(isMetaObjectMissing(new Error('nope'))).toBe(false)
  })
})

describe('igWaitForContainer backoff', () => {
  it('doubles the poll interval toward one minute and never sleeps past the deadline', async () => {
    queue(
      reply(200, { status_code: 'IN_PROGRESS' }),
      reply(200, { status_code: 'IN_PROGRESS' }),
      reply(200, { status_code: 'IN_PROGRESS' }),
      reply(200, { status_code: 'IN_PROGRESS' }),
      reply(200, { status_code: 'FINISHED' })
    )
    const slept: number[] = []
    let clock = 0
    const sleep = vi.fn(async (ms: number) => {
      slept.push(ms)
      clock += ms
    })
    const realNow = Date.now
    Date.now = () => 1_000_000 + clock
    try {
      await igWaitForContainer({ token: TOKEN, containerId: 'c1', sleep, intervalMs: 5_000, maxWaitMs: 50_000 })
    } finally {
      Date.now = realNow
    }
    // 5 → 10 → 20 → then cut to the 50 s deadline (35 s elapsed → 15 s left).
    expect(slept).toEqual([5_000, 10_000, 20_000, 15_000])
  })
})
