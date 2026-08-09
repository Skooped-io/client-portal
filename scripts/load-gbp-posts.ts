/**
 * Load an APPROVED GBP post batch file (hq/ops/gbp-posts/<YYYY-MM>-<A|B>/<client>.md)
 * into gbp_scheduled_posts for the daily cron to publish.
 *
 * Usage:
 *   npm run load-gbp-posts -- <file.md> <client_key>
 *   (tsx --env-file=.env.local scripts/load-gbp-posts.ts <file.md> <client_key>)
 *
 * Run this ONLY after Joseph approves the batch — rows in 'approved' state
 * publish automatically when their date arrives. The batch id comes from the
 * file's parent directory name (e.g. 2026-08-A). Re-running is idempotent per
 * (location, batch, seq): existing rows are skipped, not overwritten.
 *
 * File format (per ops/gbp-posts/README.md):
 *   Link for every post: <url>            ← optional, becomes cta_url
 *   ## Post 1 — OFFER — propose Mon Aug 10, morning
 *   CTA button: Call now
 *   Photo slot: ...                        ← ignored; set media_url later
 *   <body paragraphs>
 *
 * media_url stays null here — photos are attached by updating rows with a
 * PUBLIC bucket URL before publish day (the API fetches from sourceUrl;
 * Drive links do not work).
 */
import { readFileSync } from 'fs'
import { basename, dirname } from 'path'
import { createClient } from '@supabase/supabase-js'

const CTA_MAP: Record<string, string> = {
  'call now': 'CALL',
  call: 'CALL',
  'learn more': 'LEARN_MORE',
  book: 'BOOK',
  'book now': 'BOOK',
  'sign up': 'SIGN_UP',
  order: 'ORDER',
  'order online': 'ORDER',
  shop: 'SHOP',
  'shop now': 'SHOP',
  buy: 'SHOP',
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

interface ParsedPost {
  seq: number
  postType: string | null
  publishDate: string
  ctaType: string | null
  body: string
}

function parseBatchFile(path: string): { batch: string; ctaUrl: string | null; posts: ParsedPost[] } {
  const batch = basename(dirname(path))
  if (!/^\d{4}-\d{2}-[AB]$/.test(batch)) {
    throw new Error(`Parent directory "${batch}" is not a <YYYY-MM>-<A|B> batch directory`)
  }
  const year = Number(batch.slice(0, 4))
  const batchMonth = Number(batch.slice(5, 7))
  const text = readFileSync(path, 'utf8')

  const linkMatch = text.match(/^Link for every post:\s*(\S+)/m)
  const ctaUrl = linkMatch ? linkMatch[1] : null

  const posts: ParsedPost[] = []
  const headerRe = /^## Post (\d+)\s*[—–-]+\s*([^—–\n]*?)\s*[—–-]+\s*propose\s+(.+)$/gim
  const headers: { seq: number; postType: string; dateText: string; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(text)) !== null) {
    headers.push({
      seq: Number(m[1]),
      postType: m[2].trim(),
      dateText: m[3].trim(),
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  if (headers.length === 0) throw new Error('No "## Post N — TYPE — propose <date>" headers found')

  headers.forEach((h, i) => {
    const sectionEnd = i + 1 < headers.length ? headers[i + 1].start : text.length
    const section = text.slice(h.end, sectionEnd)

    const dateMatch = h.dateText.match(/([A-Za-z]{3,9})\s+(\d{1,2})/)
    if (!dateMatch) throw new Error(`Post ${h.seq}: cannot parse date from "${h.dateText}"`)
    const month = MONTHS[dateMatch[1].slice(0, 3).toLowerCase()]
    if (!month) throw new Error(`Post ${h.seq}: unknown month in "${h.dateText}"`)
    // A December batch proposing January dates crosses the year boundary.
    const postYear = month < batchMonth - 6 ? year + 1 : year
    const publishDate = `${postYear}-${String(month).padStart(2, '0')}-${String(Number(dateMatch[2])).padStart(2, '0')}`

    const ctaMatch = section.match(/^CTA button:\s*(.+)$/im)
    const ctaLabel = ctaMatch ? ctaMatch[1].trim().toLowerCase() : null
    const ctaType = ctaLabel ? (CTA_MAP[ctaLabel] ?? null) : null
    if (ctaLabel && !ctaType) {
      console.warn(`Post ${h.seq}: unmapped CTA "${ctaLabel}" — publishing without a button`)
    }
    // A URL-requiring CTA with no link would silently publish button-less
    // (posts.ts drops it) — that diverges from the approved content, so fail
    // loudly here instead.
    if (ctaType && ctaType !== 'CALL' && !ctaUrl) {
      throw new Error(
        `Post ${h.seq}: CTA "${ctaLabel}" needs a URL but the file has no "Link for every post:" line`
      )
    }

    const body = section
      .split('\n')
      .filter((line) => !/^(CTA button|Photo slot):/i.test(line.trim()))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (!body) throw new Error(`Post ${h.seq}: empty body`)
    if (/[—–]|--/.test(body)) {
      throw new Error(`Post ${h.seq}: body contains a dash/double hyphen — fix the file first (standing style rule)`)
    }

    posts.push({ seq: h.seq, postType: h.postType || null, publishDate, ctaType, body })
  })
  return { batch, ctaUrl, posts }
}

async function main() {
  const [file, clientKey] = process.argv.slice(2)
  if (!file || !clientKey) {
    console.error('Usage: tsx scripts/load-gbp-posts.ts <batch-file.md> <client_key>')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: location, error: locError } = await supabase
    .from('gbp_managed_locations')
    .select('id, display_name')
    .eq('client_key', clientKey)
    .single()
  if (locError || !location) {
    console.error(`Location "${clientKey}" not found — seed gbp_managed_locations first`)
    process.exit(1)
  }

  const { batch, ctaUrl, posts } = parseBatchFile(file)
  console.log(`${location.display_name} · batch ${batch} · ${posts.length} posts`)

  for (const post of posts) {
    const { error } = await supabase.from('gbp_scheduled_posts').insert({
      location_id: location.id,
      batch,
      post_seq: post.seq,
      post_type: post.postType,
      body: post.body,
      cta_type: post.ctaType,
      cta_url: post.ctaType && post.ctaType !== 'CALL' ? ctaUrl : null,
      publish_date: post.publishDate,
    })
    if (error) {
      if (error.code === '23505') {
        console.log(`  #${post.seq} ${post.publishDate} — already loaded, skipped`)
      } else {
        console.error(`  #${post.seq} FAILED: ${error.message}`)
        process.exitCode = 1
      }
    } else {
      console.log(
        `  #${post.seq} ${post.publishDate} ${post.ctaType ?? 'no CTA'} — loaded (media_url: none yet)`
      )
    }
  }
  console.log('Done. Attach photos by setting media_url to a PUBLIC bucket URL before publish day.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
