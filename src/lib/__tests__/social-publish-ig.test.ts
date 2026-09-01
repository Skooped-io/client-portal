import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SocialPost } from '../social/queue'
import { publishToInstagram, type SocialAccount } from '../social/service'
import { MetaApiError } from '../social/meta'

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

// publishToInstagram against a stubbed Graph API: container resume on retry
// and the deadline cut-off. Never reaches graph.facebook.com.

const TOKEN = 'tok'
const IG = '17841405822304914'

type Call = { path: string; method: string; body: URLSearchParams | null }
const calls: Call[] = []

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }
}

function queue(...responses: Array<ReturnType<typeof reply>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      calls.push({
        path: url.pathname.replace(/^\/v\d+\.\d+\//, ''),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? new URLSearchParams(init.body) : null,
      })
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

const account: SocialAccount = {
  id: 'a1',
  org_id: 'org1',
  platform: 'instagram',
  external_id: IG,
  page_id: 'page1',
  display_name: 'Gunn',
  token: TOKEN,
  token_expires_at: null,
}

function post(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'p1',
    org_id: 'org1',
    platform: 'instagram',
    post_type: 'image',
    caption: 'Fence done',
    media: [{ path: 'org1/captures/job/1.heic', content_type: 'image/heic' }],
    derived_media: [{ path: 'org1/derived/abc.jpg', public_url: 'https://cdn/abc.jpg' }],
    scheduled_at: null,
    approved_at: null,
    published_at: null,
    platform_post_id: null,
    ig_container_id: null,
    status: 'publishing',
    last_error: null,
    attempts: 1,
    group_id: 'g1',
    created_at: '2026-08-31T21:00:00Z',
    updated_at: '2026-08-31T22:00:00Z',
    ...over,
  }
}

const derived = [{ path: 'org1/derived/abc.jpg', public_url: 'https://cdn/abc.jpg' }]
const noSleep = async () => {}

describe('publishToInstagram', () => {
  it('fresh row: create container → poll → media_publish, persisting the container id first', async () => {
    queue(reply(200, { id: 'c1' }), reply(200, { status_code: 'FINISHED' }), reply(200, { id: 'media1' }))
    const onContainer = vi.fn(async () => {})
    const out = await publishToInstagram({ post: post(), account, derived, onContainer, sleep: noSleep })
    expect(out).toEqual({ platformPostId: 'media1', postRef: 'ig:media1' })
    expect(onContainer).toHaveBeenCalledWith('c1')
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`POST ${IG}/media`, 'GET c1', `POST ${IG}/media_publish`])
  })

  it('retry with a FINISHED container publishes it instead of creating a new one', async () => {
    queue(reply(200, { status_code: 'FINISHED' }), reply(200, { id: 'media2' }))
    const out = await publishToInstagram({ post: post({ ig_container_id: 'old1' }), account, derived, sleep: noSleep })
    expect(out.platformPostId).toBe('media2')
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET old1', `POST ${IG}/media_publish`])
    expect(calls[1].body?.get('creation_id')).toBe('old1')
  })

  it('retry with an already PUBLISHED container never calls media_publish again', async () => {
    queue(reply(200, { status_code: 'PUBLISHED' }))
    const out = await publishToInstagram({ post: post({ ig_container_id: 'old2' }), account, derived, sleep: noSleep })
    expect(out.platformPostId).toBe('old2')
    expect(calls).toHaveLength(1)
  })

  it('retry with a container still IN_PROGRESS keeps waiting on it', async () => {
    queue(reply(200, { status_code: 'IN_PROGRESS' }), reply(200, { status_code: 'IN_PROGRESS' }), reply(200, { status_code: 'FINISHED' }), reply(200, { id: 'media3' }))
    const out = await publishToInstagram({ post: post({ ig_container_id: 'old3', post_type: 'video' }), account, derived, sleep: noSleep })
    expect(out.platformPostId).toBe('media3')
    expect(calls.filter((c) => c.path === 'old3')).toHaveLength(3)
    expect(calls.some((c) => c.path === `${IG}/media` && c.method === 'POST')).toBe(false)
  })

  it('retry with an EXPIRED container falls through to a fresh one', async () => {
    queue(reply(200, { status_code: 'EXPIRED' }), reply(200, { id: 'c9' }), reply(200, { status_code: 'FINISHED' }), reply(200, { id: 'media9' }))
    const out = await publishToInstagram({ post: post({ ig_container_id: 'dead' }), account, derived, sleep: noSleep })
    expect(out.platformPostId).toBe('media9')
    expect(calls[1].path).toBe(`${IG}/media`)
  })

  it('a deadline already passed throws the transient 9007 error without polling forever', async () => {
    queue(reply(200, { id: 'c5' }), reply(200, { status_code: 'IN_PROGRESS' }))
    const err = await publishToInstagram({
      post: post({ post_type: 'video' }),
      account,
      derived,
      sleep: noSleep,
      deadline: Date.now() - 1,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(MetaApiError)
    expect(err.code).toBe(9007)
    expect(err.transient).toBe(true)
    // Container was created (so it can be resumed) but at most one poll ran.
    expect(calls.filter((c) => c.path === 'c5')).toHaveLength(0)
  })
})
