-- ─── Crew capture: posted-status tracking ────────────────────────────────────
-- The Google Drive era failure (TJ's manual sorting): no per-file record of
-- what had been posted to socials, so leftover photos from partially-posted
-- jobs became unusable through pure ambiguity. capture_uploads already holds
-- one row per file; these two columns make posted-vs-available a query
-- instead of archaeology.
--
--   posted_at  NULL = available material; set when the file is used in a post
--   post_ref   where it went, free text ("fb 2026-09-02", GBP post id, URL)
--
-- Available material for a client:
--   SELECT path, job, location, notes FROM capture_uploads
--   WHERE org_id = $1 AND uploaded_at IS NOT NULL AND posted_at IS NULL
--   ORDER BY job, created_at;

ALTER TABLE public.capture_uploads
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_ref text;
