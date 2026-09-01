import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { decrypt } from '@/lib/crypto'

process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(64)

type TableResult = { data: unknown; error: unknown }
type TableEntry = TableResult | ((ops: string[]) => TableResult)

/** Chainable Supabase fake that records every builder call with its JSON args. */
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
const logged = vi.hoisted(() => [] as string[])

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
// Capture everything the route logs so the token can be proven absent.
vi.mock('@/lib/logger', () => ({
  ops: {
    info: (...args: unknown[]) => logged.push(JSON.stringify(args)),
    warn: (...args: unknown[]) => logged.push(JSON.stringify(args)),
    error: (...args: unknown[]) => logged.push(JSON.stringify(args)),
  },
  flush: vi.fn().mockResolvedValue(undefined),
}))

const TOKEN = 'EAAlong-lived-page-token-value-0123456789'
const PAGE = '609517762255384'
const ORG = { data: { id: 'org1', slug: 'gunns-fencing' }, error: null }
const AUTH = 'Bearer admin-secret'

function req(method: 'POST' | 'DELETE', body: unknown, auth?: string) {
  return new NextRequest('http://localhost/api/admin/social-account', {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  })
}

/** The upsert payloads issued against social_accounts, in order. */
function upserts(): Array<Record<string, unknown>> {
  return tables.ops
    .filter((t) => t.table === 'social_accounts')
    .flatMap((t) => t.ops.filter((o) => o.startsWith('upsert:')))
    .map((o) => JSON.parse(o.slice('upsert:'.length))[0] as Record<string, unknown>)
}

const accountsTable: TableEntry = (ops) => {
  const upsert = ops.find((o) => o.startsWith('upsert:'))
  if (upsert) {
    const payload = JSON.parse(upsert.slice('upsert:'.length))[0] as Record<string, unknown>
    return {
      data: {
        id: 'acct1',
        org_id: payload.org_id,
        platform: payload.platform,
        external_id: payload.external_id,
        page_id: payload.page_id,
        display_name: payload.display_name,
        token_expires_at: payload.token_expires_at,
      },
      error: null,
    }
  }
  if (ops.some((o) => o.startsWith('delete:'))) return { data: [{ id: 'acct1' }], error: null }
  return { data: null, error: null }
}

const body = {
  org_slug: 'gunns-fencing',
  platform: 'facebook',
  external_id: PAGE,
  display_name: "Gunn's Fencing",
  access_token: TOKEN,
}

/** A fetch stub answering /debug_token with the given `data` payloads in order. */
function debugTokenReplies(...datas: unknown[]) {
  const replies = datas.map((data) => ({ data }))
  const spy = vi.fn(async () => {
    const next = replies.shift()
    return { ok: true, status: 200, text: async () => JSON.stringify(next) }
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('/api/admin/social-account', () => {
  beforeEach(() => {
    process.env.ADMIN_API_SECRET = 'admin-secret'
    process.env.CRON_SECRET = 'cron-secret'
    process.env.SOCIAL_CRON_SECRET = 'gh-secret'
    delete process.env.META_APP_ID
    delete process.env.META_APP_SECRET
    delete process.env.SOCIAL_ACCOUNTS_JSON
    tables.current = { organizations: ORG, social_accounts: accountsTable }
    tables.calls.length = 0
    tables.ops.length = 0
    logged.length = 0
  })
  afterEach(() => {
    delete process.env.ADMIN_API_SECRET
    delete process.env.CRON_SECRET
    delete process.env.SOCIAL_CRON_SECRET
    delete process.env.SOCIAL_ACCOUNTS_JSON
    vi.unstubAllGlobals()
  })

  it('401s without the secret (POST and DELETE) and never touches the database', async () => {
    const { POST, DELETE } = await import('../social-account/route')
    expect((await POST(req('POST', body))).status).toBe(401)
    expect((await POST(req('POST', body, 'Bearer wrong'))).status).toBe(401)
    expect((await DELETE(req('DELETE', { org_slug: 'gunns-fencing', platform: 'facebook' }))).status).toBe(401)
    expect(tables.calls).toEqual([])
  })

  it('refuses the cron secrets: the GitHub Actions tick secret must not be able to write Page tokens', async () => {
    const { POST, DELETE } = await import('../social-account/route')
    expect((await POST(req('POST', body, 'Bearer cron-secret'))).status).toBe(401)
    expect((await POST(req('POST', body, 'Bearer gh-secret'))).status).toBe(401)
    expect((await DELETE(req('DELETE', { org_slug: 'gunns-fencing', platform: 'facebook' }, 'Bearer gh-secret'))).status).toBe(401)
    expect(tables.calls).toEqual([])
    expect((await POST(req('POST', body, AUTH))).status).toBe(200)
  })

  it('404s an unknown org, storing nothing', async () => {
    tables.current = { organizations: { data: null, error: null }, social_accounts: accountsTable }
    const { POST } = await import('../social-account/route')
    const res = await POST(req('POST', { ...body, org_slug: 'nobody' }, AUTH))
    expect(res.status).toBe(404)
    expect(tables.calls).not.toContain('social_accounts')
  })

  it('400s a non-facebook platform, a missing page id, or a short token — before any lookup', async () => {
    const { POST } = await import('../social-account/route')
    expect((await POST(req('POST', { ...body, platform: 'instagram' }, AUTH))).status).toBe(400)
    expect((await POST(req('POST', { ...body, external_id: '' }, AUTH))).status).toBe(400)
    expect((await POST(req('POST', { ...body, access_token: 'short' }, AUTH))).status).toBe(400)
    expect((await POST(req('POST', { ...body, access_token: 42 }, AUTH))).status).toBe(400)
    expect(tables.calls).toEqual([])
  })

  it('400s a non-numeric Page id (it is interpolated into Graph paths) and an oversized token', async () => {
    const { POST } = await import('../social-account/route')
    for (const external_id of ['../../v1.0/me', '123?x=', 'me', `${PAGE}/feed`, '1'.repeat(33)]) {
      const res = await POST(req('POST', { ...body, external_id }, AUTH))
      expect(res.status, external_id).toBe(400)
      expect((await res.json()).error).toMatch(/numeric/)
    }
    expect((await POST(req('POST', { ...body, page_id: 'abc' }, AUTH))).status).toBe(400)
    const huge = await POST(req('POST', { ...body, access_token: 'E'.repeat(1025) }, AUTH))
    expect(huge.status).toBe(400)
    expect((await huge.json()).error).toMatch(/at most 1024/)
    expect(tables.calls).toEqual([])
    // Boundary: 1024 is still accepted.
    expect((await POST(req('POST', { ...body, access_token: 'E'.repeat(1024) }, AUTH))).status).toBe(200)
  })

  it('stores the encrypted token; the response and the logs never carry the token', async () => {
    const { POST } = await import('../social-account/route')
    const res = await POST(req('POST', body, AUTH))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      account: {
        id: 'acct1',
        org_id: 'org1',
        org_slug: 'gunns-fencing',
        platform: 'facebook',
        external_id: PAGE,
        page_id: null,
        display_name: "Gunn's Fencing",
        token_expires_at: null,
      },
    })
    expect(JSON.stringify(json)).not.toContain(TOKEN)
    expect(logged.join('\n')).not.toContain(TOKEN)

    const [payload] = upserts()
    expect(payload.access_token_enc).not.toContain(TOKEN)
    expect(decrypt(payload.access_token_enc as string)).toBe(TOKEN)
    expect(payload).not.toHaveProperty('access_token')
    // Upsert keyed on the (org, platform) unique constraint.
    const op = tables.ops.find((t) => t.table === 'social_accounts')!.ops.find((o) => o.startsWith('upsert:'))!
    expect(JSON.parse(op.slice('upsert:'.length))[1]).toEqual({ onConflict: 'org_id,platform' })
  })

  it('upserting twice replaces the ciphertext (fresh IV) and still decrypts to the new token', async () => {
    const { POST } = await import('../social-account/route')
    await POST(req('POST', body, AUTH))
    await POST(req('POST', { ...body, access_token: `${TOKEN}-rotated` }, AUTH))
    const [first, second] = upserts()
    expect(first.access_token_enc).not.toBe(second.access_token_enc)
    expect(decrypt(first.access_token_enc as string)).toBe(TOKEN)
    expect(decrypt(second.access_token_enc as string)).toBe(`${TOKEN}-rotated`)
    expect(second.org_id).toBe('org1')
    expect(second.platform).toBe('facebook')
  })

  it('skips debug_token when META_APP_ID/SECRET are unset: no fetch at all', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { POST } = await import('../social-account/route')
    expect((await POST(req('POST', body, AUTH))).status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('with META_APP_ID/SECRET set: stores the expiry from debug_token, refuses an invalid token', async () => {
    process.env.META_APP_ID = 'app1'
    process.env.META_APP_SECRET = 'shh'
    const fetchSpy = debugTokenReplies(
      { is_valid: true, type: 'PAGE', app_id: 'app1', expires_at: 1900000000, scopes: ['pages_manage_posts'], profile_id: PAGE },
      { is_valid: false, error: { message: 'Session has expired' } }
    )
    const { POST } = await import('../social-account/route')
    const ok = await POST(req('POST', body, AUTH))
    expect(ok.status).toBe(200)
    expect((await ok.json()).account.token_expires_at).toBe(new Date(1900000000 * 1000).toISOString())
    const bad = await POST(req('POST', body, AUTH))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toMatch(/not valid/)
    expect(upserts()).toHaveLength(1)
    // The app secret never rides in the URL; the inspected token is the
    // unavoidable input_token param (Sentry drops that span, see
    // src/lib/sentry-scrub.ts) and is the only place it appears.
    for (const call of fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>) {
      const url = new URL(call[0])
      expect(url.pathname).toMatch(/\/debug_token$/)
      expect(url.searchParams.get('input_token')).toBe(TOKEN)
      expect(url.searchParams.has('access_token')).toBe(false)
      expect(url.toString()).not.toContain('shh')
      expect((call[1].headers as Record<string, string>).Authorization).toBe('Bearer app1|shh')
    }
    expect(logged.join('\n')).not.toContain(TOKEN)
  })

  it('refuses a token whose profile_id is a different Page (would schedule on the wrong Page)', async () => {
    process.env.META_APP_ID = 'app1'
    process.env.META_APP_SECRET = 'shh'
    debugTokenReplies(
      { is_valid: true, type: 'PAGE', app_id: 'app1', profile_id: '111222333' },
      { is_valid: true, type: 'PAGE', app_id: 'app1' } // no profile_id → cannot check, accepted
    )
    const { POST } = await import('../social-account/route')
    const wrong = await POST(req('POST', body, AUTH))
    expect(wrong.status).toBe(400)
    expect((await wrong.json()).error).toMatch(/belongs to Page 111222333, not 609517762255384/)
    expect(upserts()).toHaveLength(0)
    expect((await POST(req('POST', body, AUTH))).status).toBe(200)
    expect(upserts()).toHaveLength(1)
  })

  it('DELETE disconnects and reports whether a row existed', async () => {
    const { DELETE } = await import('../social-account/route')
    const res = await DELETE(req('DELETE', { org_slug: 'gunns-fencing', platform: 'facebook' }, AUTH))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ removed: true, env_fallback_active: false })
    const ops = tables.ops.find((t) => t.table === 'social_accounts')!.ops
    expect(ops.some((o) => o.startsWith('delete:'))).toBe(true)
    expect(ops).toContain('eq:["org_id","org1"]')
    expect(ops).toContain('eq:["platform","facebook"]')

    tables.current = { organizations: ORG, social_accounts: { data: [], error: null } }
    const none = await DELETE(req('DELETE', { org_slug: 'gunns-fencing', platform: 'facebook' }, AUTH))
    expect(await none.json()).toEqual({ removed: false, env_fallback_active: false })

    tables.current = { organizations: { data: null, error: null } }
    expect((await DELETE(req('DELETE', { org_slug: 'nobody', platform: 'facebook' }, AUTH))).status).toBe(404)
  })

  it('DELETE flags a still-active SOCIAL_ACCOUNTS_JSON entry, which would keep the publisher working', async () => {
    process.env.SOCIAL_ACCOUNTS_JSON = JSON.stringify([
      { org_slug: 'gunns-fencing', platform: 'facebook', external_id: PAGE, access_token: TOKEN },
    ])
    const { DELETE } = await import('../social-account/route')
    const res = await DELETE(req('DELETE', { org_slug: 'gunns-fencing', platform: 'facebook' }, AUTH))
    const json = await res.json()
    expect(json.removed).toBe(true)
    expect(json.env_fallback_active).toBe(true)
    expect(json.warning).toMatch(/SOCIAL_ACCOUNTS_JSON/)
    expect(JSON.stringify(json)).not.toContain(TOKEN)
    expect(logged.join('\n')).not.toContain(TOKEN)

    process.env.SOCIAL_ACCOUNTS_JSON = JSON.stringify([
      { org_slug: 'someone-else', platform: 'facebook', external_id: '1', access_token: TOKEN },
    ])
    const other = await DELETE(req('DELETE', { org_slug: 'gunns-fencing', platform: 'facebook' }, AUTH))
    expect((await other.json()).env_fallback_active).toBe(false)
  })
})
