import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'
import { verifyCronSecret } from '@/lib/cron-secret'
import { debugToken } from '@/lib/social/meta'
import { PUBLISH_PLATFORMS, type Platform } from '@/lib/social/queue'
import { deleteSocialAccount, MIN_TOKEN_LENGTH, upsertSocialAccount } from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /api/admin/social-account — connect or disconnect a client's Facebook Page
 * without pasting Vercel env vars. The token is encrypted with
 * TOKEN_ENCRYPTION_KEY (the same key loadAccount decrypts with) and stored
 * in social_accounts; this route never echoes or logs it.
 *
 * Auth: exactly like the cron tick — Bearer CRON_SECRET or SOCIAL_CRON_SECRET
 * (401 otherwise; open only in development when neither is set).
 *
 * POST   { org_slug, platform: 'facebook', external_id, page_id?, display_name?, access_token }
 *        → 200 { account: { id, org_id, org_slug, platform, external_id, page_id, display_name, token_expires_at } }
 *        404 unknown org · 400 bad body / not facebook / token too short / Meta says invalid
 *        If META_APP_ID + META_APP_SECRET are set the token is inspected with
 *        /debug_token and its expiry stored; otherwise that step is skipped.
 * DELETE { org_slug, platform } → 200 { removed: true | false }
 */

type Body = Record<string, unknown>

const MAX_FIELD = 256

/** null when absent, undefined when present but not a short string. */
function optionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > MAX_FIELD) return undefined
  return value
}

async function readBody(request: NextRequest): Promise<Body | null> {
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object' ? (body as Body) : null
  } catch {
    return null
  }
}

async function findOrg(admin: ReturnType<typeof createAdminClient>, slug: unknown) {
  if (typeof slug !== 'string' || slug.length === 0 || slug.length > MAX_FIELD) return null
  const { data, error } = await admin.from('organizations').select('id, slug').eq('slug', slug).maybeSingle()
  if (error) throw new Error(`organizations: ${error.message}`)
  return (data as { id: string; slug: string } | null) ?? null
}

function parsePlatform(value: unknown): Platform | null {
  return (PUBLISH_PLATFORMS as readonly unknown[]).includes(value) ? (value as Platform) : null
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const platform = parsePlatform(body.platform)
  if (!platform) {
    return NextResponse.json({ error: "platform must be 'facebook' (Instagram is scheduled by hand)" }, { status: 400 })
  }
  const externalId = optionalString(body.external_id)
  if (!externalId) return NextResponse.json({ error: 'external_id (the Page id) is required' }, { status: 400 })
  const pageId = optionalString(body.page_id)
  const displayName = optionalString(body.display_name)
  if (pageId === undefined || displayName === undefined) {
    return NextResponse.json({ error: 'page_id / display_name must be short strings' }, { status: 400 })
  }
  const accessToken = body.access_token
  if (typeof accessToken !== 'string' || accessToken.trim().length < MIN_TOKEN_LENGTH) {
    return NextResponse.json({ error: `access_token must be at least ${MIN_TOKEN_LENGTH} characters` }, { status: 400 })
  }

  const admin = createAdminClient()
  try {
    const org = await findOrg(admin, body.org_slug)
    if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Optional token inspection: only when the app credentials are present.
    let tokenExpiresAt: Date | null = null
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    if (appId && appSecret) {
      try {
        const info = await debugToken({ token: accessToken.trim(), appId, appSecret })
        if (!info.isValid) {
          return NextResponse.json(
            { error: `Meta says this token is not valid${info.error ? `: ${info.error}` : ''}` },
            { status: 400 }
          )
        }
        tokenExpiresAt = info.expiresAt
      } catch (err) {
        // A debug_token blip must not block connecting; the expiry just stays unknown.
        ops.warn('system', 'admin.social_account.debug_token', 'skipped', {
          metadata: { orgSlug: org.slug, reason: err instanceof Error ? err.message : 'unknown' },
        })
      }
    }

    const account = await upsertSocialAccount(admin, {
      orgId: org.id,
      platform,
      externalId,
      pageId,
      displayName,
      accessToken: accessToken.trim(),
      tokenExpiresAt,
    })
    ops.info('system', 'admin.social_account.upsert', 'completed', {
      metadata: { orgSlug: org.slug, platform, externalId },
    })
    await flush()
    return NextResponse.json({ account: { ...account, org_slug: org.slug } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    ops.error('system', 'admin.social_account.upsert', msg, 'unknown')
    await flush()
    return NextResponse.json({ error: 'Could not store the account' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const platform = parsePlatform(body.platform)
  if (!platform) return NextResponse.json({ error: "platform must be 'facebook'" }, { status: 400 })

  const admin = createAdminClient()
  try {
    const org = await findOrg(admin, body.org_slug)
    if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const removed = await deleteSocialAccount(admin, org.id, platform)
    ops.info('system', 'admin.social_account.delete', 'completed', {
      metadata: { orgSlug: org.slug, platform, removed },
    })
    await flush()
    return NextResponse.json({ removed })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    ops.error('system', 'admin.social_account.delete', msg, 'unknown')
    await flush()
    return NextResponse.json({ error: 'Could not remove the account' }, { status: 500 })
  }
}
