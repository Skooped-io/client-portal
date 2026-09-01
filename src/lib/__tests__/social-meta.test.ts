import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  debugToken,
  fbSchedulePhotoPost,
  fbGetPost,
  GRAPH_VERSION,
  igResolveUserId,
  isMetaObjectMissing,
  isTransientMetaError,
  MetaApiError,
  MetaScheduleMismatchError,
} from '../social/meta'

const TOKEN = 'EAAsecret-token-value'
const PAGE = '609517762255384'
const IG = '17841405822304914'

type Call = { url: URL; method: string; body: URLSearchParams | null; auth: string | null }

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }
}

let fetchMock: ReturnType<typeof vi.fn>
const calls: Call[] = []

function queue(...responses: Array<ReturnType<typeof reply>>) {
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input)
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? new URLSearchParams(init.body) : null,
      auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
    })
    const next = responses.shift()
    if (!next) throw new Error(`unexpected fetch #${calls.length}: ${init?.method} ${url.pathname}`)
    return next
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  calls.length = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const when = new Date('2026-09-01T14:00:00Z')
const unix = 1788271200

describe('graph transport', () => {
  it('pins the API version and carries the token ONLY in the Authorization header', async () => {
    queue(reply(200, { id: '1' }), reply(200, { id: `${PAGE}_1` }), reply(200, { id: `${PAGE}_1`, scheduled_publish_time: unix }))
    await fbSchedulePhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg'], caption: 'hi', scheduledAt: when })
    for (const c of calls) {
      expect(c.url.toString()).not.toContain(TOKEN)
      expect(c.body?.has('access_token') ?? false).toBe(false)
      expect(c.auth).toBe(`Bearer ${TOKEN}`)
    }
    expect(calls[0].url.pathname).toBe(`/${GRAPH_VERSION}/${PAGE}/photos`)
    expect(calls[0].body?.get('url')).toBe('https://x/a.jpg')
  })

  it('turns a Graph error payload into a typed MetaApiError without the token', async () => {
    queue(
      reply(400, {
        error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190, error_subcode: 463, fbtrace_id: 'abc' },
      })
    )
    const err = await fbSchedulePhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg'], caption: 'hi', scheduledAt: when }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(MetaApiError)
    expect(err.code).toBe(190)
    expect(err.subcode).toBe(463)
    expect(err.httpStatus).toBe(400)
    expect(err.message).toBe('(#190) Invalid OAuth access token.')
    expect(err.message).not.toContain(TOKEN)
    expect(err.transient).toBe(false)
  })

  it('classifies rate limits and 5xx as transient, bad params as permanent', () => {
    expect(isTransientMetaError(new MetaApiError(400, { code: 4, message: 'limit' }, 'x'))).toBe(true)
    expect(isTransientMetaError(new MetaApiError(400, { code: 32, message: 'page limit' }, 'x'))).toBe(true)
    expect(isTransientMetaError(new MetaApiError(503, null, 'x'))).toBe(true)
    expect(isTransientMetaError(new MetaApiError(400, { code: 9007, error_subcode: 2207027, message: 'not ready' }, 'x'))).toBe(true)
    expect(isTransientMetaError(new MetaApiError(400, { code: 100, message: 'bad time' }, 'x'))).toBe(false)
    expect(isTransientMetaError(new MetaApiError(400, { code: 190, message: 'token' }, 'x'))).toBe(false)
    expect(isTransientMetaError(new TypeError('fetch failed'))).toBe(true)
    expect(isTransientMetaError(new MetaScheduleMismatchError('p', 1, 2))).toBe(false)
  })

  it('exposes no publish-now helper: every FB create in this module is a scheduled post', async () => {
    const meta = await import('../social/meta')
    const names = Object.keys(meta)
    expect(names).not.toContain('fbPublishPhotoPost')
    expect(names).not.toContain('fbPublishVideo')
    expect(names).not.toContain('igPublish')
    expect(names).not.toContain('igCreateImageContainer')
    expect(names).not.toContain('igCreateReel')
    expect(names).not.toContain('igCreateCarousel')
    expect(names).toContain('fbSchedulePhotoPost')
    expect(names).toContain('fbScheduleVideo')
  })
})

describe('fbSchedulePhotoPost', () => {
  it('single photo: temporary unpublished upload, scheduled /feed post, then reads the post back', async () => {
    queue(
      reply(200, { id: '900' }),
      reply(200, { id: `${PAGE}_900` }),
      reply(200, { id: `${PAGE}_900`, is_published: false, scheduled_publish_time: unix })
    )
    const out = await fbSchedulePhotoPost({
      token: TOKEN,
      pageId: PAGE,
      imageUrls: ['https://x/a.jpg'],
      caption: 'Fence day',
      scheduledAt: when,
    })
    expect(out).toEqual({ postId: `${PAGE}_900`, photoIds: ['900'], scheduledPublishTime: unix })
    const upload = calls[0]
    expect(upload.body?.get('published')).toBe('false')
    expect(upload.body?.get('temporary')).toBe('true')
    expect(upload.body?.has('scheduled_publish_time')).toBe(false)
    const create = calls[1]
    expect(create.url.pathname).toBe(`/${GRAPH_VERSION}/${PAGE}/feed`)
    expect(create.body?.get('published')).toBe('false')
    expect(create.body?.get('scheduled_publish_time')).toBe(String(unix))
    expect(create.body?.get('message')).toBe('Fence day')
    const readBack = calls[2]
    expect(readBack.method).toBe('GET')
    expect(readBack.url.pathname).toBe(`/${GRAPH_VERSION}/${PAGE}_900`)
    expect(readBack.url.searchParams.get('fields')).toContain('scheduled_publish_time')
  })

  it('accepts an ISO read-back within tolerance', async () => {
    queue(
      reply(200, { id: '901' }),
      reply(200, { id: `${PAGE}_901` }),
      reply(200, { id: `${PAGE}_901`, scheduled_publish_time: '2026-09-01T14:00:30+0000' })
    )
    const out = await fbSchedulePhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg'], caption: 'c', scheduledAt: when })
    expect(out.scheduledPublishTime).toBe(unix + 30)
  })

  it('read-back mismatch: deletes the post and throws MetaScheduleMismatchError', async () => {
    queue(
      reply(200, { id: '902' }),
      reply(200, { id: `${PAGE}_902` }),
      reply(200, { id: `${PAGE}_902`, scheduled_publish_time: unix + 3600 }),
      reply(200, { success: true })
    )
    const err = await fbSchedulePhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg'], caption: 'c', scheduledAt: when }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(MetaScheduleMismatchError)
    expect(err.postId).toBe(`${PAGE}_902`)
    expect(err.expected).toBe(unix)
    expect(err.actual).toBe(unix + 3600)
    expect(calls[3].method).toBe('DELETE')
    expect(calls[3].url.pathname).toBe(`/${GRAPH_VERSION}/${PAGE}_902`)
  })

  it('missing scheduled_publish_time on read-back is a mismatch too', async () => {
    queue(
      reply(200, { id: '903' }),
      reply(200, { id: `${PAGE}_903` }),
      reply(200, { id: `${PAGE}_903`, is_published: true }),
      reply(400, { error: { message: 'cannot delete', code: 100 } })
    )
    await expect(
      fbSchedulePhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg'], caption: 'c', scheduledAt: when })
    ).rejects.toBeInstanceOf(MetaScheduleMismatchError)
  })

  it('multi photo: temporary unpublished uploads then /feed with attached_media', async () => {
    queue(
      reply(200, { id: 'p1' }),
      reply(200, { id: 'p2' }),
      reply(200, { id: `${PAGE}_feed1` }),
      reply(200, { id: `${PAGE}_feed1`, scheduled_publish_time: unix })
    )
    const out = await fbSchedulePhotoPost({
      token: TOKEN,
      pageId: PAGE,
      imageUrls: ['https://x/a.jpg', 'https://x/b.jpg'],
      caption: 'Two',
      scheduledAt: when,
    })
    expect(out.postId).toBe(`${PAGE}_feed1`)
    expect(out.photoIds).toEqual(['p1', 'p2'])
    for (const c of calls.slice(0, 2)) {
      expect(c.url.pathname).toBe(`/${GRAPH_VERSION}/${PAGE}/photos`)
      expect(c.body?.get('published')).toBe('false')
      expect(c.body?.get('temporary')).toBe('true')
      expect(c.body?.has('scheduled_publish_time')).toBe(false)
    }
    const feed = calls[2]
    expect(feed.url.pathname).toBe(`/${GRAPH_VERSION}/${PAGE}/feed`)
    expect(feed.body?.get('message')).toBe('Two')
    expect(feed.body?.get('published')).toBe('false')
    expect(feed.body?.get('scheduled_publish_time')).toBe(String(unix))
    expect(JSON.parse(feed.body?.get('attached_media[0]') ?? '')).toEqual({ media_fbid: 'p1' })
    expect(JSON.parse(feed.body?.get('attached_media[1]') ?? '')).toEqual({ media_fbid: 'p2' })
  })

  it('every POST that creates content carries published=false (never a live post)', async () => {
    queue(reply(200, { id: 'p1' }), reply(200, { id: `${PAGE}_x` }), reply(200, { id: `${PAGE}_x`, scheduled_publish_time: unix }))
    await fbSchedulePhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg'], caption: 'c', scheduledAt: when })
    for (const c of calls.filter((c) => c.method === 'POST')) {
      expect(c.body?.get('published')).toBe('false')
    }
  })
})

describe('fbGetPost', () => {
  it('reads is_published and the scheduled time', async () => {
    queue(reply(200, { id: 'p', is_published: false, scheduled_publish_time: unix, permalink_url: 'https://fb/p' }))
    const state = await fbGetPost({ token: TOKEN, postId: 'p' })
    expect(state).toEqual({ id: 'p', isPublished: false, scheduledPublishTime: unix, permalinkUrl: 'https://fb/p' })
    expect(isMetaObjectMissing(new MetaApiError(404, null, 'x'))).toBe(true)
  })
})

describe('igResolveUserId (lookup only; the publisher never posts to Instagram)', () => {
  it('resolves the IG user id from the page', async () => {
    queue(reply(200, { instagram_business_account: { id: IG }, id: PAGE }))
    expect(await igResolveUserId({ token: TOKEN, pageId: PAGE })).toBe(IG)
    expect(calls[0].url.searchParams.get('fields')).toContain('instagram_business_account')
    queue(reply(200, { id: PAGE }))
    expect(await igResolveUserId({ token: TOKEN, pageId: PAGE })).toBeNull()
  })
})

describe('debugToken', () => {
  it('uses the app token and maps the summary', async () => {
    queue(
      reply(200, {
        data: { is_valid: true, type: 'PAGE', app_id: 'app1', expires_at: 0, scopes: ['pages_manage_posts'], profile_id: PAGE },
      })
    )
    const info = await debugToken({ token: TOKEN, appId: 'app1', appSecret: 'shh' })
    expect(info.isValid).toBe(true)
    expect(info.expiresAt).toBeNull()
    expect(info.scopes).toEqual(['pages_manage_posts'])
    expect(calls[0].url.searchParams.has('access_token')).toBe(false)
    expect(calls[0].auth).toBe('Bearer app1|shh')
    expect(calls[0].url.searchParams.get('input_token')).toBe(TOKEN)
  })
})
