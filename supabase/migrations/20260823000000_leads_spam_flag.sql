-- ============================================================================
-- Skooped.io: spam flag on the central leads table
-- Date: 2026-08-23
--
-- The lead router (skooped-marketing/api/lead.ts) now scores every inbound lead
-- for solicitation markers and matches it against a sender blocklist. On a hit
-- it stores the row and skips the SMS and email legs, so the client's phone and
-- inbox stay quiet while the ledger stays complete.
--
-- Storing rather than dropping is the whole design: a false positive that
-- silently eats a real lead costs far more than one spam email getting through,
-- so `spam_reason` records WHY every flagged row was flagged and the rows stay
-- queryable.
--
-- The monthly report cron excludes spam rows from the lead count
-- (countCentralLeads in src/app/api/cron/monthly-reports/route.ts): a client's
-- proof-of-value number must not be inflated by junk.
--
-- Additive and idempotent. No existing row is rewritten: the DEFAULT false
-- backfills every historic row as not-spam, and the four known solicitations
-- are flagged separately by the session that applies this.
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS spam boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spam_reason text;

-- The report query is "count the leads for this site in this period that are not
-- spam", so the existing (site_id, created_at) index gets a spam-aware partner.
CREATE INDEX IF NOT EXISTS idx_leads_site_created_notspam
  ON public.leads(site_id, created_at DESC)
  WHERE NOT spam;

-- The flagged pile is the false-positive audit trail; make it cheap to sweep.
CREATE INDEX IF NOT EXISTS idx_leads_spam
  ON public.leads(created_at DESC)
  WHERE spam;

-- Verify:
-- SELECT site_id, count(*) FILTER (WHERE spam) AS spam, count(*) AS total
--   FROM public.leads GROUP BY 1 ORDER BY 1;
