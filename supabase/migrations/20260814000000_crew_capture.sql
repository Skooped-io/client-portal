-- ─── Crew capture: tokenized public upload links ─────────────────────────────
-- One saved link per client (app.skooped.io/u/<token>) that a crew member taps
-- to send job photos and phone clips. Mirrors the report share-token pattern
-- (20260728000000_report_share_tokens.sql): the token is generated
-- application-side (scripts/create-capture-link.ts), looked up server-side with
-- the service-role client, and revoked by setting the column back to NULL.
--
-- capture_uploads is the intent-and-inventory ledger: one row per file the sign
-- endpoint issued a signed upload URL for. It is what the daily per-org quota
-- is enforced against, and uploaded_at (set by /api/capture/complete) marks
-- which files actually landed. Content team reads it to find new material.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS capture_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_capture_token
  ON public.organizations(capture_token)
  WHERE capture_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.capture_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  path text NOT NULL UNIQUE,
  job text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Quota check does .eq('org_id', ...).gte('created_at', <midnight UTC>)
CREATE INDEX IF NOT EXISTS idx_capture_uploads_org_created
  ON public.capture_uploads(org_id, created_at DESC);

-- Service-role only for writes; org members may read their own rows if the
-- portal ever grows a media library view.
ALTER TABLE public.capture_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capture_uploads_member_select" ON public.capture_uploads;
CREATE POLICY "capture_uploads_member_select" ON public.capture_uploads
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));
