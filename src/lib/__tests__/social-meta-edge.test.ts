import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fbGetPost,
  fbSchedulePhotoPost,
  fbScheduleVideo,
  GRAPH_VERSION,
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
      reply(200, { id: '904' }),
      reply(200, { id: `${PAGE}_904` }),
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
      reply(200, { id: '905' }),
      reply(200, { id: `${PAGE}_905` }),
      reply(200, { id: `${PAGE}_905`, scheduled_publish_time: unix + 3600 }),
      reply(200, { success: true })
    )
    const err = await schedule().catch((e) => e)
    expect(err.deleted).toBe(true)
  })

  it('scheduled /feed post without an id: deletes the temporary photo and throws', async () => {
    queue(reply(200, { id: '906' }), reply(200, {}), reply(200, { success: true }))
    const err = await schedule().catch((e) => e)
    expect(err).toBeInstanceOf(MetaApiError)
    expect(err.message).toMatch(/did not return a post id/)
    expect(calls).toHaveLength(3)
    expect(calls[2].method).toBe('DELETE')
    expect(calls[2].url.pathname).toBe(`/${GRAPH_VERSION}/906`)
  })

  it('transient read-back failure returns the post unverified instead of deleting it', async () => {
    queue(
      reply(200, { id: '907' }),
      reply(200, { id: `${PAGE}_907` }),
      reply(400, { error: { message: 'Application request limit reached', code: 4 } })
    )
    const out = await schedule()
    expect(out).toEqual({ postId: `${PAGE}_907`, photoIds: ['907'], scheduledPublishTime: unix })
    expect(calls).toHaveLength(3)
  })

  it('permanent read-back failure deletes the post and throws a mismatch that still names the post', async () => {
    queue(
      reply(200, { id: '908' }),
      reply(200, { id: `${PAGE}_908` }),
      reply(400, { error: { message: 'Invalid OAuth access token.', code: 190 } }),
      reply(200, { success: true })
    )
    const err = await schedule().catch((e) => e)
    expect(err).toBeInstanceOf(MetaScheduleMismatchError)
    expect(err.postId).toBe(`${PAGE}_908`)
    expect(err.deleted).toBe(true)
    expect(err.message).toMatch(/could not be read back .*Invalid OAuth/)
    expect(err.readBackError).toBeInstanceOf(MetaApiError)
    expect(err.readBackError.code).toBe(190)
    expect(calls[3].method).toBe('DELETE')
  })

  it('permanent read-back failure whose delete also fails keeps the id with deleted=false', async () => {
    queue(
      reply(200, { id: '909' }),
      reply(200, { id: `${PAGE}_909` }),
      reply(400, { error: { message: 'Invalid OAuth access token.', code: 190 } }),
      reply(400, { error: { message: 'Invalid OAuth access token.', code: 190 } })
    )
    const err = await schedule().catch((e) => e)
    expect(err).toBeInstanceOf(MetaScheduleMismatchError)
    expect(err.postId).toBe(`${PAGE}_909`)
    expect(err.deleted).toBe(false)
    expect(err.message).toContain('delete it from Planner')
  })
})

describe('fbScheduleVideo', () => {
  it('always published=false + scheduled_publish_time; reads the VIDEO node back with `published` (not is_published)', async () => {
    queue(reply(200, { id: 'v2' }), reply(200, { id: 'v2', published: false, scheduled_publish_time: unix }))
    const out = await fbScheduleVideo({ token: TOKEN, pageId: PAGE, videoUrl: 'https://x/v.mp4', description: 'clip', scheduledAt: when })
    expect(out.scheduledPublishTime).toBe(unix)
    expect(calls[0].body?.get('published')).toBe('false')
    expect(calls[0].body?.get('scheduled_publish_time')).toBe(String(unix))
    const fields = calls[1].url.searchParams.get('fields') ?? ''
    expect(fields).toContain('published')
    expect(fields).not.toContain('is_published')
  })

  it('scheduled with a stored-time mismatch: deletes the video and throws', async () => {
    queue(reply(200, { id: 'v3' }), reply(200, { id: 'v3', scheduled_publish_time: unix + 7200 }), reply(200, { success: true }))
    const err = await fbScheduleVideo({ token: TOKEN, pageId: PAGE, videoUrl: 'https://x/v.mp4', description: 'clip', scheduledAt: when }).catch(
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

