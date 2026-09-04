import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertGbpScheduleOnly,
  createLocalPost,
  deleteLocalPost,
  GbpApiError,
  getLocalPost,
  isGbpObjectMissing,
  isTransientGbpError,
} from '../gbp/posts'
import { GbpScheduleMismatchError, MissingGbpLocationError, scheduleOnGoogle } from '../social/service'
import type { SocialPost } from '../social/queue'

// The real scheduleOnGoogle + the real GBP client against a stubbed fetch:
// proves the publisher path can ONLY create a Google-HELD scheduled post
// (scheduledTime always sent, read-back must say SCHEDULED) and cleans up
// when Google did something else.

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

const LOCATION = 'accounts/1/locations/2'
const NAME = `${LOCATION}/localPosts/9`
const WHEN = new Date('2026-09-05T14:00:00Z')

type Call = { url: URL; method: string; body: unknown; auth: string | null }
const calls: Call[] = []
let responses: Array<{ status: number; body: unknown }> = []

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : (init?.body ?? null),
        auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
      })
      // First call of a run may be the OAuth token refresh.
      if (url.host === 'oauth2.googleapis.com') {
        return { ok: true, status: 200, json: async () => ({ access_token: 'gbp-token', expires_in: 3600 }), text: async () => '' }
      }
      const next = responses.shift()
      if (!next) throw new Error(`unexpected fetch #${calls.length}: ${init?.method} ${url.href}`)
      return {
        ok: next.status >= 200 && next.status < 300,
        status: next.status,
        json: async () => next.body,
        text: async () => JSON.stringify(next.body),
      }
    })
  )
}

/** Minimal chainable Supabase fake keyed by table. */
function chain(result: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxy: any = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(result).then(resolve, reject)
      }
      return () => proxy
    },
    apply() {
      return proxy
    },
  })
  return proxy
}

function fakeAdmin(slug: string | null, location: Record<string, unknown> | null) {
  return {
    from: (table: string) =>
      chain(
        table === 'organizations'
          ? { data: slug ? { slug } : null, error: null }
          : { data: location, error: null }
      ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const activeLocation = { gbp_location_name: LOCATION, active: true }

function post(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'p1',
    org_id: 'org1',
    platform: 'google',
    post_type: 'image',
    caption: 'Fence finished in Franklin',
    media: [{ path: 'org1/captures/job/1.heic', content_type: 'image/heic' }],
    derived_media: [{ path: 'org1/derived/abc.jpg', public_url: 'https://cdn/abc.jpg' }],
    scheduled_at: WHEN.toISOString(),
    approved_at: null,
    published_at: null,
    platform_post_id: null,
    ig_container_id: null,
    cta_type: 'LEARN_MORE',
    cta_url: 'https://gunnsfencing.com/',
    status: 'publishing',
    last_error: null,
    attempts: 1,
    group_id: 'g1',
    created_at: '2026-09-03T00:00:00Z',
    updated_at: '2026-09-03T00:00:00Z',
    ...over,
  }
}

const derived = [{ path: 'org1/derived/abc.jpg', public_url: 'https://cdn/abc.jpg' }]

beforeEach(() => {
  calls.length = 0
  responses = []
  process.env.GBP_CLIENT_ID = 'cid'
  process.env.GBP_CLIENT_SECRET = 'shh'
  process.env.GBP_REFRESH_TOKEN = 'refresh'
  stubFetch()
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GBP_CLIENT_ID
  delete process.env.GBP_CLIENT_SECRET
  delete process.env.GBP_REFRESH_TOKEN
})

/** Calls to the GBP content API (the OAuth token refresh filtered out). */
function gbpCalls() {
  return calls.filter((c) => c.url.host === 'mybusiness.googleapis.com')
}

describe('scheduleOnGoogle', () => {
  it('creates the held post (scheduledTime + CTA + first photo), reads back SCHEDULED, returns the resource name', async () => {
    responses = [
      { status: 200, body: { name: NAME, state: 'SCHEDULED' } },
      { status: 200, body: { name: NAME, state: 'SCHEDULED' } },
    ]
    const out = await scheduleOnGoogle({ admin: fakeAdmin('gunns-fencing', activeLocation), post: post(), derived, scheduledAt: WHEN })
    expect(out).toEqual({ platformPostId: NAME, postRef: `gbp:${NAME}` })
    const [create, readBack] = gbpCalls()
    expect(create.method).toBe('POST')
    expect(create.url.pathname).toBe(`/v4/${LOCATION}/localPosts`)
    expect(create.auth).toBe('Bearer gbp-token')
    expect(create.body).toEqual({
      languageCode: 'en-US',
      topicType: 'STANDARD',
      summary: 'Fence finished in Franklin',
      callToAction: { actionType: 'LEARN_MORE', url: 'https://gunnsfencing.com/' },
      media: [{ mediaFormat: 'PHOTO', sourceUrl: 'https://cdn/abc.jpg' }],
      scheduledTime: WHEN.toISOString(),
    })
    expect(readBack.method).toBe('GET')
    expect(readBack.url.pathname).toBe(`/v4/${NAME}`)
    expect(gbpCalls()).toHaveLength(2)
  })

  it('CALL CTA carries no URL; multiple derived photos send only the first', async () => {
    responses = [
      { status: 200, body: { name: NAME } },
      { status: 200, body: { name: NAME, state: 'SCHEDULED' } },
    ]
    await scheduleOnGoogle({
      admin: fakeAdmin('gunns-fencing', activeLocation),
      post: post({ cta_type: 'CALL', cta_url: null }),
      derived: [...derived, { path: 'org1/derived/def.jpg', public_url: 'https://cdn/def.jpg' }],
      scheduledAt: WHEN,
    })
    const body = gbpCalls()[0].body as Record<string, unknown>
    expect(body.callToAction).toEqual({ actionType: 'CALL' })
    expect(body.media).toEqual([{ mediaFormat: 'PHOTO', sourceUrl: 'https://cdn/abc.jpg' }])
  })

  it('read-back PROCESSING (Google validating a scheduled post) is accepted as held', async () => {
    responses = [
      { status: 200, body: { name: NAME } },
      { status: 200, body: { name: NAME, state: 'PROCESSING' } },
    ]
    const out = await scheduleOnGoogle({ admin: fakeAdmin('gunns-fencing', activeLocation), post: post(), derived, scheduledAt: WHEN })
    expect(out).toEqual({ platformPostId: NAME, postRef: `gbp:${NAME}` })
    // no DELETE call — the post is held, not removed
    expect(gbpCalls().every((c) => c.method !== 'DELETE')).toBe(true)
  })

  it('read-back LIVE (published immediately): best-effort delete, mismatch error carrying the name', async () => {
    responses = [
      { status: 200, body: { name: NAME } },
      { status: 200, body: { name: NAME, state: 'LIVE' } },
      { status: 200, body: {} }, // the delete
    ]
    const err = await scheduleOnGoogle({ admin: fakeAdmin('gunns-fencing', activeLocation), post: post(), derived, scheduledAt: WHEN }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(GbpScheduleMismatchError)
    expect(err.postName).toBe(NAME)
    expect(err.state).toBe('LIVE')
    expect(err.deleted).toBe(true)
    expect(err.message).toMatch(/expected SCHEDULED/)
    const [, , del] = gbpCalls()
    expect(del.method).toBe('DELETE')
    expect(del.url.pathname).toBe(`/v4/${NAME}`)
  })

  it('read-back LIVE whose delete fails keeps deleted=false so the caller stores the orphan', async () => {
    responses = [
      { status: 200, body: { name: NAME } },
      { status: 200, body: { name: NAME, state: 'LIVE' } },
      { status: 403, body: { error: { message: 'no', status: 'PERMISSION_DENIED' } } },
    ]
    const err = await scheduleOnGoogle({ admin: fakeAdmin('gunns-fencing', activeLocation), post: post(), derived, scheduledAt: WHEN }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(GbpScheduleMismatchError)
    expect(err.deleted).toBe(false)
    expect(err.message).toMatch(/could not be removed/)
  })

  it('read-back says the post is GONE: mismatch error, nothing to delete', async () => {
    responses = [
      { status: 200, body: { name: NAME } },
      { status: 404, body: { error: { message: 'not found', status: 'NOT_FOUND' } } },
    ]
    const err = await scheduleOnGoogle({ admin: fakeAdmin('gunns-fencing', activeLocation), post: post(), derived, scheduledAt: WHEN }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(GbpScheduleMismatchError)
    expect(err.state).toBe('MISSING')
    expect(gbpCalls()).toHaveLength(2)
  })

  it('a transient read-back blip trusts the create call (scheduledTime was sent) instead of deleting', async () => {
    responses = [
      { status: 200, body: { name: NAME } },
      { status: 500, body: { error: { message: 'backend' } } },
    ]
    const out = await scheduleOnGoogle({ admin: fakeAdmin('gunns-fencing', activeLocation), post: post(), derived, scheduledAt: WHEN })
    expect(out.platformPostId).toBe(NAME)
    expect(gbpCalls()).toHaveLength(2)
  })

  it('no mapped location (missing row, inactive, unresolved, or no slug): refused before any Google call', async () => {
    const cases = [
      fakeAdmin('gunns-fencing', null),
      fakeAdmin('gunns-fencing', { gbp_location_name: LOCATION, active: false }),
      fakeAdmin('gunns-fencing', { gbp_location_name: null, active: true }),
      fakeAdmin(null, activeLocation),
    ]
    for (const admin of cases) {
      await expect(scheduleOnGoogle({ admin, post: post(), derived, scheduledAt: WHEN })).rejects.toBeInstanceOf(MissingGbpLocationError)
    }
    expect(gbpCalls()).toEqual([])
  })
})

describe('gbp posts client (schedule-only guard + CRUD)', () => {
  it('the publisher path cannot create without scheduledTime: the guard throws before any network call', async () => {
    await expect(
      createLocalPost(LOCATION, { body: 'x', ctaType: null, ctaUrl: null, mediaUrl: null }, 'tok', { scheduleOnly: true })
    ).rejects.toThrow(/would publish live/)
    expect(() => assertGbpScheduleOnly(null)).toThrow(/scheduled/)
    expect(() => assertGbpScheduleOnly(undefined)).toThrow(/scheduled/)
    expect(() => assertGbpScheduleOnly('2026-09-05T14:00:00.000Z')).not.toThrow()
    expect(calls).toEqual([])
  })

  it('the legacy batch route path (no options) still creates without scheduledTime', async () => {
    responses = [{ status: 200, body: { name: NAME } }]
    const name = await createLocalPost(LOCATION, { body: 'x', ctaType: null, ctaUrl: null, mediaUrl: null }, 'tok')
    expect(name).toBe(NAME)
    const body = gbpCalls()[0].body as Record<string, unknown>
    expect(body).not.toHaveProperty('scheduledTime')
  })

  it('getLocalPost returns state + searchUrl; missing surfaces as isGbpObjectMissing', async () => {
    responses = [{ status: 200, body: { name: NAME, state: 'SCHEDULED', searchUrl: 'https://g.co/x' } }]
    expect(await getLocalPost('tok', NAME)).toEqual({ state: 'SCHEDULED', searchUrl: 'https://g.co/x' })

    responses = [{ status: 404, body: { error: { message: 'gone', status: 'NOT_FOUND' } } }]
    const err = await getLocalPost('tok', NAME).catch((e) => e)
    expect(err).toBeInstanceOf(GbpApiError)
    expect(isGbpObjectMissing(err)).toBe(true)
    expect(isTransientGbpError(err)).toBe(false)
  })

  it('deleteLocalPost treats 404/NOT_FOUND as already gone, throws on anything else', async () => {
    responses = [{ status: 404, body: { error: { message: 'gone', status: 'NOT_FOUND' } } }]
    await expect(deleteLocalPost('tok', NAME)).resolves.toBeUndefined()

    responses = [{ status: 403, body: { error: { message: 'no', status: 'PERMISSION_DENIED' } } }]
    await expect(deleteLocalPost('tok', NAME)).rejects.toBeInstanceOf(GbpApiError)
  })

  it('classifies 429/5xx/network as transient, 4xx as permanent', () => {
    expect(isTransientGbpError(new GbpApiError('x', 429, null))).toBe(true)
    expect(isTransientGbpError(new GbpApiError('x', 503, null))).toBe(true)
    expect(isTransientGbpError(new TypeError('fetch failed'))).toBe(true)
    expect(isTransientGbpError(new GbpApiError('x', 400, null))).toBe(false)
    expect(isTransientGbpError(new GbpApiError('x', 403, null))).toBe(false)
  })
})
