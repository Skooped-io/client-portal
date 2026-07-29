-- ─── Monthly report cron: business_profiles flags ────────────────────────────
-- Adds the fields the monthly report cron keys off:
--   lovable_project_id — Lovable project UUID for the client's site (analytics
--                        for it are pushed in via /api/ingest/analytics; Lovable
--                        has no public REST analytics API as of 2026-07)
--   plan               — Skooped plan ('single' | 'triple'); the report builder
--                        uses it to decide which sections matter (ads for triple)
--   reports_enabled    — ONLY orgs with true get monthly report rows/links.
--                        Defaults false so non-paying orgs are excluded unless
--                        explicitly flipped on (see supabase/SEED-CLIENTS.sql).
-- Idempotent: safe to re-run.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS lovable_project_id text;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS plan text;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS reports_enabled boolean NOT NULL DEFAULT false;

-- Partial index: the cron's single query is "all profiles with reports_enabled".
CREATE INDEX IF NOT EXISTS idx_business_profiles_reports_enabled
  ON public.business_profiles(org_id)
  WHERE reports_enabled;
