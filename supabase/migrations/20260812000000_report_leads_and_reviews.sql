-- ============================================================================
-- Skooped.io report ingest: lead counts + Google review activity
-- Run: Supabase SQL Editor → paste and execute
-- Date: 2026-08-12
--
-- Closes the two gaps found in the 2026-08-11 report audit:
--
--  1. LEADS. Form leads are captured in each CLIENT SITE's own Supabase
--     (hq/LEAD-CAPTURE-SPEC-2026-07.md decision 3: per-site table, not
--     central), so the portal could never count them and the report page's
--     "Leads" tile had no writer at all. lead_metrics is the push target: the
--     monthly routine reads each client project (leads / contact_submissions)
--     plus the LSA and ads lead ledgers and POSTs one row per org per period.
--
--  2. REVIEW ACTIVITY. The GBP automation (2026-08-09) keys everything by a
--     text client_key with no link to organizations, so the reviews we receive
--     and the owner replies we publish could not be attributed to a client
--     report. org_id gives gbp_managed_locations that link; the monthly cron
--     then aggregates gbp_review_replies per org with no per-client mapping in
--     code. client_key stays the automation's own identity (it is what the
--     seeds, digest and post loader use); org_id is additive and nullable so
--     Skooped's own profile, which has no client org, keeps working.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ─── lead_metrics (pushed per period by the monthly report routine) ──────────
-- Grain matches the other metric tables: one row per (org_id, date). The
-- routine writes the period's last day, exactly like the monthly ads rows.

CREATE TABLE IF NOT EXISTS public.lead_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date date NOT NULL,
  -- Website form submissions (client site's own leads / contact_submissions).
  form_leads integer NOT NULL DEFAULT 0,
  -- Phone/message leads from Google Local Services or a call ledger.
  call_leads integer NOT NULL DEFAULT 0,
  -- Leads attributed to paid campaigns (Meta / Google Ads lead events).
  ad_leads integer NOT NULL DEFAULT 0,
  -- Where the counts came from, for auditing a number a client questions.
  sources jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_lead_metrics_org_date
  ON public.lead_metrics(org_id, date DESC);

ALTER TABLE public.lead_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view lead_metrics" ON public.lead_metrics;
CREATE POLICY "Org members can view lead_metrics" ON public.lead_metrics
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

-- ─── gbp_managed_locations.org_id (the missing join) ─────────────────────────

ALTER TABLE public.gbp_managed_locations
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gbp_managed_locations_org
  ON public.gbp_managed_locations(org_id);

-- Backfill: client_key already equals the org slug for every client location
-- ('gunns-fencing', 'rios-landscaping'). Skooped's own profile has no org and
-- stays NULL, which is what keeps it out of client reports.
UPDATE public.gbp_managed_locations l
   SET org_id = o.id
  FROM public.organizations o
 WHERE o.slug = l.client_key
   AND l.org_id IS DISTINCT FROM o.id;

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- SELECT client_key, display_name, org_id FROM public.gbp_managed_locations ORDER BY client_key;
-- SELECT o.slug, lm.date, lm.form_leads, lm.call_leads, lm.ad_leads
--   FROM public.lead_metrics lm JOIN public.organizations o ON o.id = lm.org_id
--  ORDER BY lm.date DESC;
