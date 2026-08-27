-- ─── Material page tokens ────────────────────────────────────────────────────
-- Joseph-facing tokenized page (app.skooped.io/m/<token>) listing a client's
-- crew-captured material with posted/available status and one-tap marking.
-- Separate token from capture_token on purpose: the crew's upload link must
-- never expose the library or the marking controls. Same pattern as the
-- report and capture tokens: generated app-side (scripts/create-material-link.ts),
-- looked up with the service-role client, revoked by setting NULL.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS material_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_material_token
  ON public.organizations(material_token)
  WHERE material_token IS NOT NULL;
