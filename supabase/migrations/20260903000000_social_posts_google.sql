-- ─── Social publisher: Google Business Profile as a first-class platform ─────
-- Date: 2026-09-03. Design: hq/ops/social-publisher/GBP-IN-PUBLISHER-DESIGN-2026-09-01.md
--
-- 'google' rows follow the exact held-post rule Facebook rows do: Approve
-- creates a Google-held SCHEDULED local post (LocalPost.scheduledTime); Joseph
-- reviews it in Business Profile Manager; Google publishes it at the time.
-- cta_type/cta_url carry the post's call-to-action button (google rows only;
-- CALL uses the listed phone number, every other type needs cta_url).
--
-- Idempotent.

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_platform_check;
ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_platform_check
  CHECK (platform IN ('facebook', 'instagram', 'google'));

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS cta_type text
  CHECK (cta_type IN ('CALL', 'LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP'));
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS cta_url text;

COMMENT ON COLUMN public.social_posts.cta_type IS
  'Google Business call-to-action button (google rows only). CALL needs no URL; every other type does.';
COMMENT ON COLUMN public.social_posts.cta_url IS
  'https URL behind the call-to-action button (required for every cta_type except CALL).';
