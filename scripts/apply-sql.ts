/**
 * Apply a .sql file to the portal's Postgres database, in one transaction.
 *
 * Why this exists: migrations in this repo used to be applied by pasting them
 * into the Supabase SQL editor by hand, which means a Claude session cannot do
 * it (browser DDL is blocked in auto mode) and every schema change becomes a
 * task for Joseph. This is the non-browser path.
 *
 *   SUPABASE_DB_URL="postgresql://..." npm run db:apply -- supabase/migrations/<file>.sql
 *
 * Get SUPABASE_DB_URL once from the Supabase dashboard:
 *   Project Settings > Database > Connection string > URI (session pooler),
 *   then keep it in a gitignored env file. It is a database superuser
 *   credential: never commit it, never print it.
 *
 * Destructive statements (DROP TABLE/SCHEMA/DATABASE, TRUNCATE) are refused
 * unless --allow-destructive is passed, so a bad paste cannot quietly delete a
 * client's data.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Client } from 'pg'

const DESTRUCTIVE = /\b(DROP\s+(TABLE|SCHEMA|DATABASE|COLUMN)|TRUNCATE)\b/i

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

async function main() {
  const args = process.argv.slice(2)
  const allowDestructive = args.includes('--allow-destructive')
  const target = args.find((a) => !a.startsWith('--'))

  if (!target) {
    fail('Usage: npm run db:apply -- <path-to.sql> [--allow-destructive]')
  }

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    fail(
      'SUPABASE_DB_URL is not set.\n' +
        '  Supabase dashboard > Project Settings > Database > Connection string > URI\n' +
        '  (session pooler), then run:\n' +
        '    SUPABASE_DB_URL="postgresql://..." npm run db:apply -- <file.sql>\n' +
        '  Store it in a gitignored env file, never in the repo.'
    )
  }

  const path = resolve(process.cwd(), target)
  let sql: string
  try {
    sql = readFileSync(path, 'utf8')
  } catch {
    fail(`Cannot read ${path}`)
  }

  if (sql.trim().length === 0) fail(`${target} is empty`)

  if (DESTRUCTIVE.test(sql) && !allowDestructive) {
    const hit = sql.match(DESTRUCTIVE)?.[0] ?? 'destructive statement'
    fail(
      `Refusing to run: ${target} contains ${hit.toUpperCase()}.\n` +
        '  Re-run with --allow-destructive only if losing that data is intended.'
    )
  }

  const client = new Client({ connectionString: dbUrl })
  client.on('notice', (n) => console.log(`  postgres: ${n.message}`))

  console.log(`Applying ${target} (${sql.split('\n').length} lines)`)
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log('✓ Applied and committed')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    const message = err instanceof Error ? err.message : String(err)
    fail(`Failed, rolled back: ${message}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
