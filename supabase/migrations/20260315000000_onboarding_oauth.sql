-- Migration: Onboarding + OAuth Integration
-- Created: 2026-03-15

-- ─────────────────────────────────────────────
-- Table: onboarding_progress
-- Tracks per-user wizard progress so they can leave and come back
-- ─────────────────────────────────────────────
CREATE TABLE onboarding_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  current_step INTEGER DEFAULT 1 NOT NULL,
  completed_steps INTEGER[] DEFAULT '{}' NOT NULL,
  is_complete BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- ─────────────────────────────────────────────
-- Table: oauth_connections
-- Stores encrypted OAuth tokens per organization per provider
-- ─────────────────────────────────────────────
CREATE TABLE oauth_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'meta')),
  provider_account_id TEXT,
  provider_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  scope TEXT,
  expires_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  refresh_error TEXT,
  refresh_error_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  connected_services TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(org_id, provider)
);

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
CREATE INDEX idx_onboarding_progress_user_id ON onboarding_progress(user_id);
CREATE INDEX idx_onboarding_progress_org_id ON onboarding_progress(org_id);
CREATE INDEX idx_oauth_connections_org_id ON oauth_connections(org_id);
CREATE INDEX idx_oauth_connections_status ON oauth_connections(status);
CREATE INDEX idx_oauth_connections_expires_at ON oauth_connections(expires_at);

-- ─────────────────────────────────────────────
-- Updated_at trigger function (reuse if exists)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_onboarding_progress_updated_at
  BEFORE UPDATE ON onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_connections_updated_at
  BEFORE UPDATE ON oauth_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;

-- onboarding_progress: users can only access their own row
CREATE POLICY "Users can view own onboarding" ON onboarding_progress
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own onboarding" ON onboarding_progress
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own onboarding" ON onboarding_progress
  FOR UPDATE USING (user_id = auth.uid());

-- oauth_connections: org members can view their org's connections
CREATE POLICY "Org members can view oauth connections" ON oauth_connections
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- org members can manage (insert/update/delete) their org's connections
CREATE POLICY "Org members can manage oauth connections" ON oauth_connections
  FOR ALL USING (
    org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
