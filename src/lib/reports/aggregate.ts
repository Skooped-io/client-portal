/**
 * Pure aggregation helpers for the monthly client report.
 *
 * Kept out of the cron route so they can be unit tested without a Supabase
 * client: everything here is (rows in) → (numbers out).
 */

/** Device rows ride inside analytics_metrics.traffic_sources with this prefix. */
export const DEVICE_PREFIX = '__device__:'

/** Lead kinds the routine may push. `form` = website form, `call` = Local
 *  Services / call ledger, `ad` = paid-campaign lead events. */
export const LEAD_KINDS = ['form', 'call', 'ad'] as const
export type LeadKind = (typeof LEAD_KINDS)[number]

export interface TrafficEntry {
  source: string
  sessions: number
}

export interface SplitTraffic {
  /** Real referrer rows, reserved prefixes removed. */
  sources: TrafficEntry[]
  /** device → sessions. */
  devices: Map<string, number>
}

/** True for any reserved (non-referrer) entry. */
export function isReservedSource(source: string): boolean {
  return source.startsWith(DEVICE_PREFIX)
}

/**
 * Split one day's traffic_sources jsonb into real sources and device counts.
 * Malformed entries are dropped rather than throwing: this runs unattended on
 * the 3rd and a bad row must not sink a client's report.
 */
export function splitTrafficEntries(entries: unknown): SplitTraffic {
  const sources: TrafficEntry[] = []
  const devices = new Map<string, number>()

  if (!Array.isArray(entries)) return { sources, devices }

  for (const raw of entries) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Partial<TrafficEntry>
    if (typeof entry.source !== 'string' || typeof entry.sessions !== 'number') continue
    if (!Number.isFinite(entry.sessions)) continue

    if (entry.source.startsWith(DEVICE_PREFIX)) {
      const device = entry.source.slice(DEVICE_PREFIX.length)
      if (device) devices.set(device, (devices.get(device) ?? 0) + entry.sessions)
    } else {
      sources.push({ source: entry.source, sessions: entry.sessions })
    }
  }

  return { sources, devices }
}

// ─── Google review activity ──────────────────────────────────────────────────

/** The subset of gbp_review_replies the report needs. */
export interface ReviewRow {
  star_rating?: number | null
  review_create_time?: string | null
  posted_at?: string | null
  state?: string | null
}

export interface ReviewAggregate {
  /** Merged into reports.metrics. Empty when the location produced nothing. */
  metrics: Record<string, number>
  highlights: string[]
  summaryLines: string[]
}

/** ISO timestamp → YYYY-MM-DD, or null when unusable. */
function dayOf(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length < 10) return null
  const day = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

function inPeriod(value: string | null | undefined, start: string, end: string): boolean {
  const day = dayOf(value)
  return day !== null && day >= start && day <= end
}

function plural(n: number): string {
  return n === 1 ? '' : 's'
}

/**
 * Review activity for one managed Google Business Profile over the period.
 *
 * `rows` is every review row we hold for that location (the lifetime record),
 * so totals and the average come from all of them while "new" and "replied"
 * are period-scoped. Reviews that predate our first sync still count toward the
 * total, which is what the client sees on their own profile.
 */
export function aggregateReviewActivity(
  rows: ReviewRow[],
  periodStart: string,
  periodEnd: string
): ReviewAggregate {
  if (rows.length === 0) return { metrics: {}, highlights: [], summaryLines: [] }

  const ratings = rows
    .map((r) => r.star_rating)
    .filter((r): r is number => typeof r === 'number' && r >= 1 && r <= 5)

  const reviewsTotal = rows.length
  const avgRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : 0

  const newReviews = rows.filter((r) => inPeriod(r.review_create_time, periodStart, periodEnd)).length
  const repliesPosted = rows.filter(
    (r) => r.state === 'posted' && inPeriod(r.posted_at, periodStart, periodEnd)
  ).length

  const metrics: Record<string, number> = { reviews_total: reviewsTotal }
  if (avgRating > 0) metrics.reviews_avg_rating = avgRating
  if (newReviews > 0) metrics.new_reviews = newReviews
  if (repliesPosted > 0) metrics.review_replies = repliesPosted

  const highlights: string[] = []
  if (newReviews > 0) highlights.push(`${newReviews} new Google review${plural(newReviews)}`)
  if (repliesPosted > 0) {
    highlights.push(`Replied to ${repliesPosted} Google review${plural(repliesPosted)} on your profile`)
  }

  const summaryParts: string[] = []
  if (newReviews > 0) summaryParts.push(`${newReviews} new Google review${plural(newReviews)}`)
  if (repliesPosted > 0) {
    summaryParts.push(`${repliesPosted} review${plural(repliesPosted)} answered by us`)
  }
  if (avgRating > 0) {
    summaryParts.push(`${avgRating} stars across ${reviewsTotal} review${plural(reviewsTotal)}`)
  }

  return {
    metrics,
    highlights,
    summaryLines: summaryParts.length > 0 ? [summaryParts.join(', ')] : [],
  }
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export interface LeadAggregate {
  metrics: Record<string, number>
  highlights: string[]
  summaryLines: string[]
}

/** The subset of lead_metrics the report needs. */
export interface LeadRow {
  form_leads?: number | null
  call_leads?: number | null
  ad_leads?: number | null
}

function sumColumn(rows: LeadRow[], key: keyof LeadRow): number {
  return rows.reduce((acc, r) => acc + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0)
}

/**
 * Roll the period's lead_metrics rows into the single `leads` number the report
 * page renders, plus plain-English lines. Breakdown keys are kept so a client
 * question ("where did that number come from?") is answerable from the row.
 */
export function aggregateLeads(rows: LeadRow[]): LeadAggregate {
  const form = sumColumn(rows, 'form_leads')
  const call = sumColumn(rows, 'call_leads')
  const ad = sumColumn(rows, 'ad_leads')
  const total = form + call + ad

  if (total === 0) return { metrics: {}, highlights: [], summaryLines: [] }

  const metrics: Record<string, number> = { leads: total }
  if (form > 0) metrics.leads_form = form
  if (call > 0) metrics.leads_call = call
  if (ad > 0) metrics.leads_ad = ad

  const parts: string[] = []
  if (form > 0) parts.push(`${form} through your website form`)
  if (call > 0) parts.push(`${call} by phone or message from Google`)
  if (ad > 0) parts.push(`${ad} from ads`)

  return {
    metrics,
    highlights: [`${total} new lead${plural(total)} this month`],
    summaryLines: [`${total} new lead${plural(total)} (${parts.join(', ')})`],
  }
}
