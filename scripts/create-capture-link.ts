/**
 * Generate (or show) the crew capture upload link for a client org.
 *
 *   SUPABASE_DB_URL="postgresql://..." npm run capture-link -- <org-slug> [--rotate] [--revoke]
 *
 * One token per org (organizations.capture_token). Idempotent: running it
 * again prints the existing link. --rotate replaces the token, --revoke
 * clears it (the page 404s).
 *
 * Revocation caveat (review finding 2026-08-13): signed upload URLs already
 * issued by /api/capture/sign live for ~2h independent of the token. On
 * --rotate/--revoke this script voids them by writing a placeholder object to
 * every un-landed path from the last 3h (signed PUTs are non-upsert, so an
 * existing object makes the leaked URL fail). Needs
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the env for that
 * step; without them it prints the residual-window warning instead.
 * SUPABASE_DB_URL lives where migrations expect it; see scripts/apply-sql.ts.
 */

import { randomBytes } from 'crypto'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://app.skooped.io/u'
const BUCKET = 'client-assets'

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

async function voidOutstandingUrls(client: Client, orgId: string) {
  const { rows } = await client.query(
    `SELECT path FROM capture_uploads
     WHERE org_id = $1 AND uploaded_at IS NULL
       AND created_at > now() - interval '3 hours'`,
    [orgId]
  )
  if (rows.length === 0) return

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log(
      `⚠ ${rows.length} signed upload URL(s) issued in the last ~2h stay usable until they expire.\n` +
        '  Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and re-run to void them.'
    )
    return
  }

  const admin = createClient(url, key)
  let voided = 0
  for (const row of rows) {
    // Non-upsert placeholder: any leaked signed URL for this path now 409s.
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(row.path, Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        contentType: 'image/png',
        upsert: false,
      })
    if (!error || error.message.toLowerCase().includes('already exists')) voided += 1
  }
  console.log(`✓ Voided ${voided}/${rows.length} outstanding signed upload path(s)`)
}

async function main() {
  const args = process.argv.slice(2)
  const rotate = args.includes('--rotate')
  const revoke = args.includes('--revoke')
  const slug = args.find((a) => !a.startsWith('--'))

  if (!slug) fail('Usage: npm run capture-link -- <org-slug> [--rotate] [--revoke]')
  if (rotate && revoke) fail('Pick one of --rotate or --revoke')

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) fail('SUPABASE_DB_URL is not set (see scripts/apply-sql.ts header for where it lives)')

  const client = new Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const { rows } = await client.query(
      'SELECT id, name, capture_token FROM organizations WHERE slug = $1',
      [slug]
    )
    if (rows.length === 0) fail(`No organization with slug "${slug}"`)
    const org = rows[0]

    if (revoke) {
      await client.query('UPDATE organizations SET capture_token = NULL WHERE id = $1', [org.id])
      console.log(`✓ Capture link revoked for ${org.name}`)
      await voidOutstandingUrls(client, org.id)
      return
    }

    if (org.capture_token && !rotate) {
      console.log(`${org.name} already has a capture link (use --rotate to replace):`)
      console.log(`  ${BASE_URL}/${org.capture_token}`)
      return
    }

    const token = randomBytes(24).toString('base64url')
    await client.query('UPDATE organizations SET capture_token = $1 WHERE id = $2', [token, org.id])
    console.log(`✓ Capture link ${org.capture_token ? 'rotated' : 'created'} for ${org.name}:`)
    console.log(`  ${BASE_URL}/${token}`)
    if (org.capture_token) await voidOutstandingUrls(client, org.id)
  } finally {
    await client.end()
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
