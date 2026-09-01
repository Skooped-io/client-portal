/**
 * Connect (upsert) a Facebook Page or Instagram account for a client org so
 * the social publisher can post to it.
 *
 *   SUPABASE_DB_URL="postgresql://..." TOKEN_ENCRYPTION_KEY=<64 hex> \
 *   npm run social-account -- <org-slug> <facebook|instagram> \
 *       --external-id <page-id | ig-user-id> [--page-id <page-id>] \
 *       --token-file <path> [--name "<display name>"]
 *
 * The token is read from a FILE, never from argv (argv lands in shell
 * history and process listings). Use a long-lived PAGE access token from a
 * user with the CREATE_CONTENT task on the Page; the Instagram row uses the
 * same Page token (IG publishes through the linked Page). For instagram,
 * --external-id may be omitted when --page-id is given: the IG user id is
 * resolved from the Page (instagram_business_account).
 *
 * If META_APP_ID + META_APP_SECRET are set, the token is inspected with
 * /debug_token and its expiry is stored; the summary is printed either way.
 * Nothing is posted. SUPABASE_DB_URL lives where migrations expect it; see
 * scripts/apply-sql.ts. Idempotent: re-running replaces the stored token.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Client } from 'pg'
import { encrypt } from '../src/lib/crypto'
import { debugToken, igResolveUserId } from '../src/lib/social/meta'

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const value = args[i + 1]
  if (!value || value.startsWith('--')) fail(`${name} needs a value`)
  return value
}

async function main() {
  const args = process.argv.slice(2)
  const positional = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')))
  const [slug, platform] = positional
  const externalIdArg = flag(args, '--external-id')
  const pageId = flag(args, '--page-id')
  const tokenFile = flag(args, '--token-file')
  const name = flag(args, '--name')

  if (!slug || !platform || !tokenFile) {
    fail(
      'Usage: npm run social-account -- <org-slug> <facebook|instagram> --external-id <id> [--page-id <id>] --token-file <path> [--name <display>]'
    )
  }
  if (platform !== 'facebook' && platform !== 'instagram') fail('platform must be facebook or instagram')
  if (!externalIdArg && !(platform === 'instagram' && pageId)) {
    fail('--external-id is required (for instagram you may pass --page-id instead and it will be resolved)')
  }
  if (!process.env.TOKEN_ENCRYPTION_KEY) fail('TOKEN_ENCRYPTION_KEY is not set (same value as the Vercel env)')
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) fail('SUPABASE_DB_URL is not set (see scripts/apply-sql.ts header for where it lives)')

  let token: string
  try {
    token = readFileSync(resolve(tokenFile), 'utf8').trim()
  } catch {
    fail(`Could not read token file ${tokenFile}`)
  }
  if (token.length < 20) fail('Token file looks empty')

  let externalId = externalIdArg
  if (!externalId && platform === 'instagram' && pageId) {
    externalId = (await igResolveUserId({ token, pageId })) ?? undefined
    if (!externalId) fail(`Page ${pageId} has no linked Instagram business account`)
    console.log(`✓ Resolved Instagram user id ${externalId} from Page ${pageId}`)
  }

  let expiresAt: Date | null = null
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (appId && appSecret) {
    const info = await debugToken({ token, appId, appSecret })
    console.log('debug_token:')
    console.log(`  valid:      ${info.isValid}${info.error ? ` (${info.error})` : ''}`)
    console.log(`  type:       ${info.type ?? '?'}`)
    console.log(`  app_id:     ${info.appId ?? '?'}${info.appId && info.appId !== appId ? '  ⚠ not this app' : ''}`)
    console.log(`  expires:    ${info.expiresAt ? info.expiresAt.toISOString() : 'never'}`)
    console.log(`  scopes:     ${info.scopes.join(', ') || '(none)'}`)
    const need = ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list']
    if (platform === 'instagram') need.push('instagram_basic', 'instagram_content_publish')
    const missing = need.filter((s) => !info.scopes.includes(s))
    if (missing.length) console.log(`  ⚠ missing:  ${missing.join(', ')}`)
    if (!info.isValid) fail('Token is not valid; nothing stored')
    expiresAt = info.expiresAt
  } else {
    console.log('(META_APP_ID/META_APP_SECRET not set — skipping debug_token)')
  }

  const client = new Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const { rows } = await client.query('SELECT id, name FROM organizations WHERE slug = $1', [slug])
    if (rows.length === 0) fail(`No organization with slug "${slug}"`)
    const org = rows[0]

    await client.query(
      `INSERT INTO social_accounts
         (org_id, platform, external_id, page_id, display_name, access_token_enc, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (org_id, platform) DO UPDATE SET
         external_id = EXCLUDED.external_id,
         page_id = EXCLUDED.page_id,
         display_name = COALESCE(EXCLUDED.display_name, social_accounts.display_name),
         access_token_enc = EXCLUDED.access_token_enc,
         token_expires_at = EXCLUDED.token_expires_at,
         updated_at = now()`,
      [
        org.id,
        platform,
        externalId,
        platform === 'instagram' ? (pageId ?? null) : null,
        name ?? null,
        encrypt(token),
        expiresAt ? expiresAt.toISOString() : null,
      ]
    )
    console.log(`✓ ${platform} account ${externalId} stored for ${org.name}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
