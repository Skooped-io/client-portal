-- ============================================================================
-- SEED-CLIENTS.sql — the paying Skooped book (2026-07)
--
-- NOT run automatically. Review, then paste into the Supabase SQL Editor
-- (project btwrcfzphkwrvcqoyhym) AFTER 20260729000000_report_cron.sql.
--
-- Upserts organizations + business_profiles for every PAYING subscription
-- client with reports_enabled = true, which is what the monthly report cron
-- keys off. Non-paying Lovable sites are deliberately absent: reports_enabled
-- defaults false, so they never get report rows or share links.
--
-- Idempotent: safe to re-run. Org matched on slug; profile matched on org_id.
-- Existing profile fields other than plan / reports_enabled /
-- lovable_project_id / business_name are left untouched.
-- ============================================================================

-- ─── Gray Skies Therapy (single) ─────────────────────────────────────────────
WITH org AS (
  INSERT INTO public.organizations (name, slug)
  VALUES ('Gray Skies Therapy', 'gray-skies-therapy')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.business_profiles (org_id, business_name, plan, reports_enabled, lovable_project_id)
SELECT id, 'Gray Skies Therapy', 'single', true, 'b8a89d2a-4abc-4db3-b536-23065d94cf09' FROM org
ON CONFLICT (org_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  reports_enabled = EXCLUDED.reports_enabled,
  lovable_project_id = EXCLUDED.lovable_project_id;

-- ─── Gunn's Fencing (triple — ads sections will light up once ads_metrics has rows) ─
WITH org AS (
  INSERT INTO public.organizations (name, slug)
  VALUES ('Gunn''s Fencing', 'gunns-fencing')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.business_profiles (org_id, business_name, plan, reports_enabled, lovable_project_id)
SELECT id, 'Gunn''s Fencing', 'triple', true, '04933a99-0ce5-4241-be2e-bc0e1f417015' FROM org
ON CONFLICT (org_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  reports_enabled = EXCLUDED.reports_enabled,
  lovable_project_id = EXCLUDED.lovable_project_id;

-- ─── Southern Door Pros (single) ─────────────────────────────────────────────
WITH org AS (
  INSERT INTO public.organizations (name, slug)
  VALUES ('Southern Door Pros', 'southern-door-pros')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.business_profiles (org_id, business_name, plan, reports_enabled, lovable_project_id)
SELECT id, 'Southern Door Pros', 'single', true, 'cd9e1ea2-905d-4433-83ab-d5b46e074b5c' FROM org
ON CONFLICT (org_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  reports_enabled = EXCLUDED.reports_enabled,
  lovable_project_id = EXCLUDED.lovable_project_id;

-- ─── Affordable Elegance (single) ────────────────────────────────────────────
WITH org AS (
  INSERT INTO public.organizations (name, slug)
  VALUES ('Affordable Elegance', 'affordable-elegance')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.business_profiles (org_id, business_name, plan, reports_enabled, lovable_project_id)
SELECT id, 'Affordable Elegance', 'single', true, '31f5d335-471a-464a-a8b0-287fee85bcbc' FROM org
ON CONFLICT (org_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  reports_enabled = EXCLUDED.reports_enabled,
  lovable_project_id = EXCLUDED.lovable_project_id;

-- ─── Squishy Clean (single) ──────────────────────────────────────────────────
WITH org AS (
  INSERT INTO public.organizations (name, slug)
  VALUES ('Squishy Clean', 'squishy-clean')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.business_profiles (org_id, business_name, plan, reports_enabled, lovable_project_id)
SELECT id, 'Squishy Clean', 'single', true, '9a3744ee-28c8-479e-83f7-9dc54dd447af' FROM org
ON CONFLICT (org_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  reports_enabled = EXCLUDED.reports_enabled,
  lovable_project_id = EXCLUDED.lovable_project_id;

-- ─── Revamp Junk (single) ────────────────────────────────────────────────────
WITH org AS (
  INSERT INTO public.organizations (name, slug)
  VALUES ('Revamp Junk', 'revamp-junk')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.business_profiles (org_id, business_name, plan, reports_enabled, lovable_project_id)
SELECT id, 'Revamp Junk', 'single', true, '6b3d801c-fa77-4e92-9dcb-478b52b7f6cd' FROM org
ON CONFLICT (org_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  reports_enabled = EXCLUDED.reports_enabled,
  lovable_project_id = EXCLUDED.lovable_project_id;

-- ─── Rios Landscaping (single) ───────────────────────────────────────────────
-- TODO: lovable_project_id unknown as of 2026-07-29 — fill in once identified
-- (UPDATE public.business_profiles SET lovable_project_id = '<uuid>'
--  WHERE org_id = (SELECT id FROM public.organizations WHERE slug = 'rios-landscaping');)
WITH org AS (
  INSERT INTO public.organizations (name, slug)
  VALUES ('Rios Landscaping', 'rios-landscaping')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.business_profiles (org_id, business_name, plan, reports_enabled, lovable_project_id)
SELECT id, 'Rios Landscaping', 'single', true, NULL FROM org
ON CONFLICT (org_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  reports_enabled = EXCLUDED.reports_enabled,
  lovable_project_id = EXCLUDED.lovable_project_id;

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- SELECT o.name, o.slug, bp.plan, bp.reports_enabled, bp.lovable_project_id
-- FROM public.organizations o
-- JOIN public.business_profiles bp ON bp.org_id = o.id
-- WHERE bp.reports_enabled
-- ORDER BY o.name;
