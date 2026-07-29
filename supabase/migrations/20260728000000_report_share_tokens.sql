-- ─── Report share tokens (public no-login report links) ──────────────────────
-- Adds a nullable share_token to reports. When set, the report is reachable
-- read-only at /r/[token] with no login. Tokens are generated application-side
-- (crypto.randomUUID) via POST /api/reports/[reportId]/share and revoked by
-- setting the column back to NULL (DELETE on the same route).
--
-- No RLS change is needed: anon/user clients never query by share_token.
-- The public page looks the token up with the service-role client (bypasses
-- RLS, server-only), so unshared reports stay invisible to the outside world.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS share_token text;

-- Partial unique index: enforces token uniqueness AND serves as the lookup
-- index for /r/[token]. NULLs (unshared reports) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_share_token
  ON public.reports(share_token)
  WHERE share_token IS NOT NULL;
