/**
 * Generate (or show) the crew capture upload link for a client org.
 *
 *   SUPABASE_DB_URL="postgresql://..." npm run capture-link -- <org-slug> [--rotate] [--revoke]
 *
 * One token per org (organizations.capture_token). Idempotent: running it
 * again prints the existing link. --rotate replaces the token (the old link
 * dies immediately), --revoke clears it (the page 404s).
 * SUPABASE_DB_URL lives where migrations expect it; see scripts/apply-sql.ts.
 */

import { randomBytes } from 'crypto'
import { Client } from 'pg'

const BASE_URL = 'https://app.skooped.io/u'

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
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
  } finally {
    await client.end()
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
