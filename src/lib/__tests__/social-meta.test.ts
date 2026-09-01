import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  debugToken,
  fbPublishPhotoPost,
  fbPublishVideo,
  fbSchedulePhotoPost,
  fbGetPost,
  GRAPH_VERSION,
  igCreateCarousel,
  igCreateImageContainer,
  igCreateReel,
  igPublish,
  igPublishingLimit,
  igResolveUserId,
  igWaitForContainer,
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

describe('graph transport', () => {
  it('pins the API version and carries the token ONLY in the Authorization header', async () => {
    queue(reply(200, { id: '1', post_id: `${PAGE}_1` }))
    await fbPublishPhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg'], caption: 'hi' })
    const c = calls[0]
    expect(c.url.pathname).toBe(`/${GRAPH_VERSION}/${PAGE}/photos`)
    expect(c.url.toString()).not.toContain(TOKEN)
    expect(c.body?.has('access_token')).toBe(false)
    expect(c.auth).toBe(`Bearer ${TOKEN}`)
    expect(c.body?.get('url')).toBe('https://x/a.jpg')
    expect(c.body?.get('caption')).toBe('hi')
    expect(c.body?.has('published')).toBe(false)
  })

  it('turns a Graph error payload into a typed MetaApiError without the token', async () => {
    queue(
      reply(400, {
        error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190, error_subcode: 463, fbtrace_id: 'abc' },
      })
    )
    const err = await fbPublishPhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg'], caption: 'hi' }).catch(
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
})

describe('fbSchedulePhotoPost', () => {
  const when = new Date('2026-09-01T14:00:00Z')
  const unix = 1788271200

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
})

describe('fbPublishPhotoPost (multi)', () => {
  it('unpublished uploads without temporary, then a published /feed post', async () => {
    queue(reply(200, { id: 'p1' }), reply(200, { id: 'p2' }), reply(200, { id: `${PAGE}_f` }))
    const out = await fbPublishPhotoPost({ token: TOKEN, pageId: PAGE, imageUrls: ['https://x/a.jpg', 'https://x/b.jpg'], caption: 'Now' })
    expect(out.postId).toBe(`${PAGE}_f`)
    expect(calls[0].body?.has('temporary')).toBe(false)
    expect(calls[2].body?.has('published')).toBe(false)
    expect(calls[2].body?.has('scheduled_publish_time')).toBe(false)
  })
})

describe('Instagram', () => {
  it('resolves the IG user id from the page', async () => {
    queue(reply(200, { instagram_business_account: { id: IG }, id: PAGE }))
    expect(await igResolveUserId({ token: TOKEN, pageId: PAGE })).toBe(IG)
    expect(calls[0].url.searchParams.get('fields')).toContain('instagram_business_account')
    queue(reply(200, { id: PAGE }))
    expect(await igResolveUserId({ token: TOKEN, pageId: PAGE })).toBeNull()
  })

  it('single image container carries image_url + caption, no media_type', async () => {
    queue(reply(200, { id: 'c1' }))
    expect(await igCreateImageContainer({ token: TOKEN, igUserId: IG, imageUrl: 'https://x/a.jpg', caption: 'Cap' })).toBe('c1')
    const b = calls[0].body!
    expect(calls[0].url.pathname).toBe(`/${GRAPH_VERSION}/${IG}/media`)
    expect(b.get('image_url')).toBe('https://x/a.jpg')
    expect(b.get('caption')).toBe('Cap')
    expect(b.has('media_type')).toBe(false)
    expect(b.has('is_carousel_item')).toBe(false)
  })

  it('carousel: children flagged is_carousel_item, parent media_type=CAROUSEL with comma ids', async () => {
    queue(reply(200, { id: 'k1' }), reply(200, { id: 'k2' }), reply(200, { id: 'parent' }))
    const k1 = await igCreateImageContainer({ token: TOKEN, igUserId: IG, imageUrl: 'https://x/a.jpg', isCarouselItem: true })
    const k2 = await igCreateImageContainer({ token: TOKEN, igUserId: IG, imageUrl: 'https://x/b.jpg', isCarouselItem: true })
    const parent = await igCreateCarousel({ token: TOKEN, igUserId: IG, children: [k1, k2], caption: 'Carousel' })
    expect(parent).toBe('parent')
    expect(calls[0].body?.get('is_carousel_item')).toBe('true')
    expect(calls[0].body?.has('caption')).toBe(false)
    expect(calls[2].body?.get('media_type')).toBe('CAROUSEL')
    expect(calls[2].body?.get('children')).toBe('k1,k2')
    expect(calls[2].body?.get('caption')).toBe('Carousel')
    await expect(igCreateCarousel({ token: TOKEN, igUserId: IG, children: ['k1'], caption: 'x' })).rejects.toThrow(/2–10/)
  })

  it('reel container uses media_type=REELS + video_url', async () => {
    queue(reply(200, { id: 'r1' }))
    await igCreateReel({ token: TOKEN, igUserId: IG, videoUrl: 'https://x/v.mp4', caption: 'Reel' })
    expect(calls[0].body?.get('media_type')).toBe('REELS')
    expect(calls[0].body?.get('video_url')).toBe('https://x/v.mp4')
    expect(calls[0].body?.get('share_to_feed')).toBe('true')
  })

  it('polls container status until FINISHED, sleeping between polls', async () => {
    queue(
      reply(200, { status_code: 'IN_PROGRESS', id: 'c1' }),
      reply(200, { status_code: 'IN_PROGRESS', id: 'c1' }),
      reply(200, { status_code: 'FINISHED', id: 'c1' })
    )
    const sleep = vi.fn(async () => {})
    const out = await igWaitForContainer({ token: TOKEN, containerId: 'c1', sleep, intervalMs: 5 })
    expect(out.statusCode).toBe('FINISHED')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(calls[0].url.searchParams.get('fields')).toBe('status_code,status')
  })

  it('ERROR status throws a permanent MetaApiError carrying the subcode', async () => {
    queue(reply(200, { status_code: 'ERROR', status: '2207026', id: 'c1' }))
    const err = await igWaitForContainer({ token: TOKEN, containerId: 'c1', sleep: async () => {} }).catch((e) => e)
    expect(err).toBeInstanceOf(MetaApiError)
    expect(err.subcode).toBe(2207026)
    expect(err.transient).toBe(false)
  })

  it('timeout throws the transient not-ready error so the cron retries', async () => {
    queue(reply(200, { status_code: 'IN_PROGRESS' }), reply(200, { status_code: 'IN_PROGRESS' }))
    let clock = 0
    const sleep = vi.fn(async () => {
      clock += 100_000
    })
    const realNow = Date.now
    Date.now = () => 1_000_000 + clock
    try {
      const err = await igWaitForContainer({ token: TOKEN, containerId: 'c1', sleep, maxWaitMs: 60_000 }).catch((e) => e)
      expect(err).toBeInstanceOf(MetaApiError)
      expect(err.code).toBe(9007)
      expect(err.transient).toBe(true)
    } finally {
      Date.now = realNow
    }
  })

  it('publishes with creation_id and reads the publishing limit', async () => {
    queue(reply(200, { id: 'media1' }), reply(200, { data: [{ quota_usage: 3, config: { quota_total: 100 } }] }))
    expect(await igPublish({ token: TOKEN, igUserId: IG, creationId: 'c1' })).toBe('media1')
    expect(calls[0].url.pathname).toBe(`/${GRAPH_VERSION}/${IG}/media_publish`)
    expect(calls[0].body?.get('creation_id')).toBe('c1')
    expect(await igPublishingLimit({ token: TOKEN, igUserId: IG })).toEqual({ quotaUsage: 3, quotaTotal: 100 })
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
