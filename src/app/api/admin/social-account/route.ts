import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'
import { verifyAdminSecret } from '@/lib/cron-secret'
import { debugToken } from '@/lib/social/meta'
import { PUBLISH_PLATFORMS, type Platform } from '@/lib/social/queue'
import {
  deleteSocialAccount,
  loadAccountFromEnv,
  MIN_TOKEN_LENGTH,
  upsertSocialAccount,
} from '@/lib/social/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /api/admin/social-account — connect or disconnect a client's Facebook Page
 * without pasting Vercel env vars. The token is encrypted with
 * TOKEN_ENCRYPTION_KEY (the same key loadAccount decrypts with) and stored
 * in social_accounts; this route never echoes or logs it.
 *
 * Auth: Bearer ADMIN_API_SECRET (401 otherwise; open only in development
 * when it is unset). Deliberately NOT the cron secret: SOCIAL_CRON_SECRET is
 * a GitHub Actions secret and must only be able to tick the reconcile.
 *
 * POST   { org_slug, platform: 'facebook', external_id, page_id?, display_name?, access_token }
 *        → 200 { account: { id, org_id, org_slug, platform, external_id, page_id, display_name, token_expires_at } }
 *        404 unknown org · 400 bad body / not facebook / ids not numeric /
 *        token too short or too long / Meta says invalid / token belongs to
 *        a different Page.
 *        If META_APP_ID + META_APP_SECRET are set the token is inspected with
 *        /debug_token, its expiry stored and its profile_id checked against
 *        external_id; otherwise that step is skipped.
 * DELETE { org_slug, platform } → 200 { removed: true | false, env_fallback_active }
 *        Removes the social_accounts row only. It does NOT cancel posts Meta
 *        already holds (delete those in Planner; the rows stay 'scheduled'
 *        and can no longer be reconciled), and if SOCIAL_ACCOUNTS_JSON still
 *        lists this org the publisher keeps working from that entry —
 *        `env_fallback_active: true` says so; remove the env entry too.
 */

type Body = Record<string, unknown>

const MAX_FIELD = 256
// Long-lived Page tokens are ~200–300 chars; anything near Vercel's body limit
// is not a token and would be encrypted + decrypted on every approve/tick.
const MAX_TOKEN_LENGTH = 1024
// Facebook Page ids are numeric. The id is interpolated into Graph paths
// (`${pageId}/feed`), so anything else could re-target the call.
const NUMERIC_ID = /^\d{1,32}$/

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
  if (!verifyAdminSecret(request)) {
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
  if (!NUMERIC_ID.test(externalId) || (pageId !== null && !NUMERIC_ID.test(pageId))) {
    return NextResponse.json({ error: 'external_id / page_id must be a numeric Facebook Page id' }, { status: 400 })
  }
  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : null
  if (!accessToken || accessToken.length < MIN_TOKEN_LENGTH) {
    return NextResponse.json({ error: `access_token must be at least ${MIN_TOKEN_LENGTH} characters` }, { status: 400 })
  }
  if (accessToken.length > MAX_TOKEN_LENGTH) {
    return NextResponse.json({ error: `access_token must be at most ${MAX_TOKEN_LENGTH} characters` }, { status: 400 })
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
        const info = await debugToken({ token: accessToken, appId, appSecret })
        if (!info.isValid) {
          return NextResponse.json(
            { error: `Meta says this token is not valid${info.error ? `: ${info.error}` : ''}` },
            { status: 400 }
          )
        }
        // A Page token's profile_id is the Page it belongs to; storing it
        // under another Page's id would schedule every post on the wrong Page.
        if (info.profileId && info.profileId !== externalId) {
          return NextResponse.json(
            { error: `This token belongs to Page ${info.profileId}, not ${externalId}` },
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
      accessToken,
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
  if (!verifyAdminSecret(request)) {
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
    // The store falls back to SOCIAL_ACCOUNTS_JSON on a DB miss, so a
    // disconnect is only real once that entry is gone too.
    const envFallbackActive = Boolean(await loadAccountFromEnv(admin, org.id, platform))
    ops.info('system', 'admin.social_account.delete', 'completed', {
      metadata: { orgSlug: org.slug, platform, removed, envFallbackActive },
    })
    await flush()
    return NextResponse.json({
      removed,
      env_fallback_active: envFallbackActive,
      ...(envFallbackActive
        ? { warning: 'SOCIAL_ACCOUNTS_JSON still lists this org; the publisher keeps using that token until the entry is removed' }
        : {}),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    ops.error('system', 'admin.social_account.delete', msg, 'unknown')
    await flush()
    return NextResponse.json({ error: 'Could not remove the account' }, { status: 500 })
  }
}
