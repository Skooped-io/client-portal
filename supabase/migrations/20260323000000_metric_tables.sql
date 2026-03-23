-- ============================================================================
-- Skooped.io — Metric & Activity Tables
-- Run: Supabase SQL Editor → paste and execute
-- Date: 2026-03-23
-- Author: Cooper
-- ============================================================================

-- ─── SEO Metrics (Google Search Console daily snapshots) ─────────────────────

CREATE TABLE IF NOT EXISTS public.seo_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_clicks integer DEFAULT 0,
  total_impressions integer DEFAULT 0,
  avg_ctr numeric(6,4) DEFAULT 0,
  avg_position numeric(6,2) DEFAULT 0,
  top_queries jsonb DEFAULT '[]',
  top_pages jsonb DEFAULT '[]',
  site_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_seo_metrics_org_date
  ON public.seo_metrics(org_id, date DESC);

-- ─── Analytics Metrics (GA4 daily snapshots) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date date NOT NULL,
  sessions integer DEFAULT 0,
  users integer DEFAULT 0,
  pageviews integer DEFAULT 0,
  bounce_rate numeric(5,2) DEFAULT 0,
  avg_session_duration numeric(8,2) DEFAULT 0,
  traffic_sources jsonb DEFAULT '[]',
  top_pages jsonb DEFAULT '[]',
  property_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_metrics_org_date
  ON public.analytics_metrics(org_id, date DESC);

-- ─── GBP Metrics (Google Business Profile snapshots) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.gbp_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_reviews integer DEFAULT 0,
  avg_rating numeric(3,2) DEFAULT 0,
  new_reviews integer DEFAULT 0,
  search_views integer DEFAULT 0,
  map_views integer DEFAULT 0,
  website_clicks integer DEFAULT 0,
  direction_requests integer DEFAULT 0,
  phone_calls integer DEFAULT 0,
  recent_reviews jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_gbp_metrics_org_date
  ON public.gbp_metrics(org_id, date DESC);

-- ─── Ads Metrics (Google Ads daily snapshots) ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ads_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_spend numeric(10,2) DEFAULT 0,
  total_clicks integer DEFAULT 0,
  total_impressions integer DEFAULT 0,
  total_conversions integer DEFAULT 0,
  avg_cpc numeric(8,2) DEFAULT 0,
  avg_ctr numeric(6,4) DEFAULT 0,
  campaigns jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ads_metrics_org_date
  ON public.ads_metrics(org_id, date DESC);

-- ─── Social Metrics (Instagram / Facebook snapshots) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.social_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date date NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  followers integer DEFAULT 0,
  engagement_rate numeric(6,4) DEFAULT 0,
  reach integer DEFAULT 0,
  impressions integer DEFAULT 0,
  posts_published integer DEFAULT 0,
  top_posts jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, date, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_metrics_org_date
  ON public.social_metrics(org_id, date DESC);

-- ─── Agent Activity (logs every agent action per org) ────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent text NOT NULL CHECK (agent IN ('cooper', 'scout', 'bob', 'sierra', 'riley', 'mark', 'sandra', 'red', 'system')),
  action_type text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_org_created
  ON public.agent_activity(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_activity_agent
  ON public.agent_activity(agent, created_at DESC);

-- ─── Site Deployments (deployment history per org) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.site_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  site_url text,
  repo_name text,
  vercel_project_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'live', 'failed')),
  template text,
  error_message text,
  deployed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_deployments_org
  ON public.site_deployments(org_id, created_at DESC);

-- ─── Content Posts (social content scheduling) ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  caption text,
  media_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  scheduled_for timestamptz,
  published_at timestamptz,
  engagement jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_posts_org_scheduled
  ON public.content_posts(org_id, scheduled_for DESC);

-- ─── Reports (generated performance reports) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('weekly', 'monthly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  summary text,
  metrics jsonb DEFAULT '{}',
  highlights jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_org_period
  ON public.reports(org_id, period_end DESC);

-- ─── RLS Policies ────────────────────────────────────────────────────────────
-- Pattern: org members can SELECT their own org's data
-- Service role key (used by cron/agents) bypasses RLS

ALTER TABLE public.seo_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gbp_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Read policies (org members can view their own org's data)
CREATE POLICY "Org members can view seo_metrics" ON public.seo_metrics
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org members can view analytics_metrics" ON public.analytics_metrics
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org members can view gbp_metrics" ON public.gbp_metrics
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org members can view ads_metrics" ON public.ads_metrics
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org members can view social_metrics" ON public.social_metrics
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org members can view agent_activity" ON public.agent_activity
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org members can view site_deployments" ON public.site_deployments
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org members can view content_posts" ON public.content_posts
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org members can view reports" ON public.reports
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

-- Content posts: org members can also INSERT and UPDATE their own org's posts
CREATE POLICY "Org members can create content_posts" ON public.content_posts
  FOR INSERT WITH CHECK (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org members can update content_posts" ON public.content_posts
  FOR UPDATE USING (org_id IN (
    SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  ));
