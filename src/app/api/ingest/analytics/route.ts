import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { ops, flush } from '@/lib/logger'
import { DEVICE_PREFIX } from '@/lib/reports/aggregate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ingest/analytics
 *
 * Push-path for site analytics that can't be pulled server-side (Lovable has
 * no public REST analytics API as of 2026-07). An external writer — e.g. the
 * local monthly routine reading Lovable analytics via MCP — POSTs daily rows
 * here and they land in analytics_metrics, keyed (org_id, date), which the
 * monthly report cron then aggregates.
 *
 * Auth: Authorization: Bearer <SERVICE_API_KEY>. If the env var is not set the
 * endpoint is disabled (503) — it never falls open.
 *
 * Body: a single row or an array of rows:
 *   {
 *     org_slug:  "gunns-fencing",       // organizations.slug
 *     date:      "2026-07-15",          // YYYY-MM-DD
 *     sessions:  12,
 *     pageviews: 34,
 *     users:     10,                    // optional
 *     bounce_rate: 41.2,               // optional, percent
 *     avg_session_duration: 62.5,      // optional, seconds
 *     sources:   [{ source: "google", sessions: 8 }],  // optional, stored as traffic_sources
 *     top_pages: [{ path: "/", pageviews: 20 }],       // optional
 *     leads:     { form: 8, call: 10, ad: 0 }          // optional, see below
 *   }
 *
 * `leads` is the month's lead count for that org, attached to ONE row (the
 * period's last day) the same way sources/top_pages are. Form leads live in
 * each client site's own Supabase, not this one, so they cannot be pulled
 * server-side: the monthly routine counts them per client (leads or
 * contact_submissions) plus the Local Services / ads lead ledgers and pushes
 * the totals here. They land in their own lead_metrics table, upserted on
 * (org_id, date), which the monthly report cron sums into the Leads tile.
 *
 * Upserts on (org_id, date) — re-posting a day overwrites it (idempotent).
 * Unknown slugs are reported back, not treated as a hard failure, so one bad
 * row doesn't sink a batch.
 */

const ingestRowSchema = z.object({
  org_slug: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  sessions: z.number().int().nonnegative().default(0),
  pageviews: z.number().int().nonnegative().default(0),
  users: z.number().int().nonnegative().optional(),
  bounce_rate: z.number().min(0).max(100).optional(),
  avg_session_duration: z.number().nonnegative().optional(),
  sources: z.array(z.unknown()).default([]),
  top_pages: z.array(z.unknown()).default([]),
  // Optional device split, e.g. [{ device: "mobile", sessions: 12 }]. Stored inside
  // the traffic_sources jsonb with a reserved "__device__:" prefix (no schema change);
  // the monthly-reports cron splits them back out into metrics.device_split.
  devices: z
    .array(z.object({ device: z.string().min(1), sessions: z.number().int().nonnegative() }))
    .default([]),
  // Month's lead counts. Written to lead_metrics (org_id, date), which the
  // monthly-reports cron sums into metrics.leads.
  leads: z
    .object({
      form: z.number().int().nonnegative().optional(),
      call: z.number().int().nonnegative().optional(),
      ad: z.number().int().nonnegative().optional(),
    })
    .optional(),
})

const ingestBodySchema = z.union([ingestRowSchema, z.array(ingestRowSchema).min(1).max(500)])

function verifyServiceKey(request: NextRequest): boolean {
  const serviceKey = process.env.SERVICE_API_KEY
  if (!serviceKey) return false
  const provided = request.headers.get('authorization')?.replace('Bearer ', '')
  return provided === serviceKey
}

export async function POST(request: NextRequest) {
  if (!process.env.SERVICE_API_KEY) {
    return NextResponse.json(
      { error: 'Ingest disabled: SERVICE_API_KEY is not configured' },
      { status: 503 }
    )
  }
  if (!verifyServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ingestBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const rows = Array.isArray(parsed.data) ? parsed.data : [parsed.data]
  const supabase = createAdminClient()

  // Resolve org slugs → ids in one query
  const slugs = Array.from(new Set(rows.map((r) => r.org_slug)))
  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, slug')
    .in('slug', slugs)

  if (orgError) {
    ops.error('system', 'ingest.analytics', orgError.message, 'unknown')
    await flush()
    return NextResponse.json({ error: 'Failed to resolve organizations' }, { status: 500 })
  }

  const orgBySlug = new Map((orgs ?? []).map((o) => [o.slug as string, o.id as string]))
  const unknownSlugs = slugs.filter((s) => !orgBySlug.has(s))

  const upsertRows = rows
    .filter((r) => orgBySlug.has(r.org_slug))
    .map((r) => ({
      org_id: orgBySlug.get(r.org_slug)!,
      date: r.date,
      sessions: r.sessions,
      pageviews: r.pageviews,
      ...(r.users !== undefined ? { users: r.users } : {}),
      ...(r.bounce_rate !== undefined ? { bounce_rate: r.bounce_rate } : {}),
      ...(r.avg_session_duration !== undefined
        ? { avg_session_duration: r.avg_session_duration }
        : {}),
      traffic_sources: [
        ...r.sources,
        ...r.devices.map((d) => ({ source: `${DEVICE_PREFIX}${d.device}`, sessions: d.sessions })),
      ],
      top_pages: r.top_pages,
      // Marks the writer; distinguishes pushed rows from GA4-synced ones.
      property_id: 'ingest',
    }))

  let upserted = 0
  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from('analytics_metrics')
      .upsert(upsertRows, { onConflict: 'org_id,date' })

    if (error) {
      ops.error('system', 'ingest.analytics', error.message, 'unknown')
      await flush()
      return NextResponse.json({ error: 'Upsert failed', details: error.message }, { status: 500 })
    }
    upserted = upsertRows.length
  }

  // Lead counts go to their own table, one row per (org_id, date), so a
  // re-post of the same date replaces rather than doubles the count.
  const leadRows = rows
    .filter((r) => r.leads && orgBySlug.has(r.org_slug))
    .map((r) => ({
      org_id: orgBySlug.get(r.org_slug)!,
      date: r.date,
      form_leads: r.leads?.form ?? 0,
      call_leads: r.leads?.call ?? 0,
      ad_leads: r.leads?.ad ?? 0,
    }))

  let leadsUpserted = 0
  if (leadRows.length > 0) {
    const { error } = await supabase
      .from('lead_metrics')
      .upsert(leadRows, { onConflict: 'org_id,date' })

    if (error) {
      ops.error('system', 'ingest.analytics.leads', error.message, 'unknown')
      await flush()
      return NextResponse.json(
        { error: 'Lead upsert failed', details: error.message, upserted },
        { status: 500 }
      )
    }
    leadsUpserted = leadRows.length
  }

  ops.info('system', 'ingest.analytics', 'completed', {
    metadata: { upserted, leads_upserted: leadsUpserted, unknown_slugs: unknownSlugs },
  })
  await flush()

  return NextResponse.json({ upserted, leads_upserted: leadsUpserted, unknown_slugs: unknownSlugs })
}
