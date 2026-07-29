-- ============================================================================
-- Skooped.io — Base Schema (organizations, membership, profiles, business
-- profiles, subscriptions, contact submissions, legacy clients)
-- Date: 2026-03-14 (timestamped BEFORE all other migrations so the chain
--       orders correctly: every later migration references organizations(id))
--
-- Derived strictly from what the app code reads/writes:
--   * signup:   src/app/(auth)/signup/actions.ts        (profiles, organizations,
--               organization_members, onboarding_progress inserts — admin client)
--   * org lookup: src/lib/supabase/helpers.ts getCurrentOrgId()
--               → organization_members(org_id, user_id), .single() per user
--   * business_profiles: onboarding actions, settings action/page, website page,
--               agents custom-prompt (reads primary_color / font_style with fallbacks)
--   * subscriptions: DDL comment at top of src/app/api/stripe/webhook/route.ts
--               (reproduced verbatim below)
--   * contact_submissions: src/app/api/contact/route.ts (insert, admin) +
--               src/app/(portal)/messages/page.tsx (select, user client)
--   * clients: legacy live table (1 row) — NOT referenced anywhere in code;
--               guarded create only, so an existing table survives untouched.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP ... IF EXISTS guards).
-- ============================================================================

-- ─── updated_at trigger function ─────────────────────────────────────────────
-- (20260315 re-creates this with CREATE OR REPLACE; identical body, harmless)

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── organizations ───────────────────────────────────────────────────────────
-- Columns: signup inserts name/slug/owner_id/plan/status; getCurrentOrg selects *.

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── organization_members (the membership mechanism) ─────────────────────────
-- getCurrentOrgId() does .select('org_id').eq('user_id', uid).single()
-- → exactly one membership per user is assumed (also by the Stripe webhook),
--   enforced with a UNIQUE index on user_id.

CREATE TABLE IF NOT EXISTS public.organization_members (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_members_user
  ON public.organization_members(user_id);

-- ─── membership helper (SECURITY DEFINER) ────────────────────────────────────
-- A SELECT policy on organization_members cannot subquery itself (infinite
-- recursion). This definer function bypasses RLS for that one lookup and is
-- also usable by any policy that needs "orgs the current user belongs to".

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT org_id FROM public.organization_members WHERE user_id = auth.uid();
$$;

-- ─── profiles ────────────────────────────────────────────────────────────────
-- Shape from src/lib/types.ts Profile; signup inserts (id, full_name) via admin.
-- Read with the USER client in portal layout, dashboard, settings (own row and
-- co-members' rows for the team list).

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── business_profiles ───────────────────────────────────────────────────────
-- One row per org (all code paths do .eq('org_id', ...).single() / update).
-- Columns = src/lib/types.ts BusinessProfile + template (onboarding step 1)
-- + primary_color / font_style (read by agents custom-prompt with fallbacks).

CREATE TABLE IF NOT EXISTS public.business_profiles (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  industry text,
  template text,
  services text[],
  service_areas text[],
  phone text,
  email text,
  website_url text,
  city text,
  state text,
  description text,
  primary_color text,
  font_style text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_business_profiles_updated_at ON public.business_profiles;
CREATE TRIGGER update_business_profiles_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── subscriptions ───────────────────────────────────────────────────────────
-- Verbatim from the DDL comment in src/app/api/stripe/webhook/route.ts.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  plan text NOT NULL,
  status text NOT NULL,
  trial_end timestamptz,
  billing_cycle_anchor timestamptz,
  cancel_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_org_id_idx ON public.subscriptions(org_id);
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx ON public.subscriptions(stripe_subscription_id);

-- ─── contact_submissions ─────────────────────────────────────────────────────
-- Insert shape from src/app/api/contact/route.ts (admin client);
-- select shape from src/app/(portal)/messages/page.tsx (user client).

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  message text NOT NULL,
  source text DEFAULT 'website',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_org_created
  ON public.contact_submissions(org_id, created_at DESC);

-- ─── clients (legacy, guarded) ───────────────────────────────────────────────
-- The live project already has a 1-row public.clients table; NO app code
-- references it. Guards below create it only if missing and never alter
-- existing data. On the live DB every statement here is a no-op except
-- ENABLE ROW LEVEL SECURITY (closes anon access; service role unaffected).

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Admin (service role) client bypasses RLS: signup inserts, contact-route
-- inserts, cron/agent routes. Policies below cover only what the USER client
-- actually does, mirroring the org-membership subquery pattern used by
-- 20260323_metric_tables (org_id IN (SELECT org_id FROM organization_members
-- WHERE user_id = auth.uid())).

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- organizations: members can view their own org (getCurrentOrg selects *)
DROP POLICY IF EXISTS "Org members can view their organization" ON public.organizations;
CREATE POLICY "Org members can view their organization" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- organization_members: members can view all memberships of their org(s)
-- (settings page team list selects user_id, role by org_id). Uses the
-- SECURITY DEFINER helper to avoid self-referential policy recursion.
DROP POLICY IF EXISTS "Members can view memberships of their orgs" ON public.organization_members;
CREATE POLICY "Members can view memberships of their orgs" ON public.organization_members
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));

-- profiles: own row (layout, dashboard, settings) + co-members' rows
-- (settings team list selects profiles .in('id', memberUserIds))
DROP POLICY IF EXISTS "Users can view own and co-member profiles" ON public.profiles;
CREATE POLICY "Users can view own and co-member profiles" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR id IN (
      SELECT user_id FROM public.organization_members
      WHERE org_id IN (SELECT public.user_org_ids())
    )
  );

-- business_profiles: org members read (settings/website/onboarding pages) and
-- update (settings updateBusinessProfileAction uses the user client).
-- Inserts happen via the admin client only (onboarding actions).
DROP POLICY IF EXISTS "Org members can view business profile" ON public.business_profiles;
CREATE POLICY "Org members can view business profile" ON public.business_profiles
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org members can update business profile" ON public.business_profiles;
CREATE POLICY "Org members can update business profile" ON public.business_profiles
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- subscriptions: verbatim from the webhook route's DDL comment
DROP POLICY IF EXISTS "Users can view their own subscription" ON public.subscriptions;
CREATE POLICY "Users can view their own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- contact_submissions: org members read their org's messages (messages page)
DROP POLICY IF EXISTS "Org members can view contact_submissions" ON public.contact_submissions;
CREATE POLICY "Org members can view contact_submissions" ON public.contact_submissions
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- clients: no policies on purpose — no code path reads it; service role only.
