-- ─── GBP automation: review responder + scheduled posts ──────────────────────
-- Spec: hq/GBP-AUTOMATION-SPEC-2026-08.md. Service-role only (RLS on, no
-- policies), same posture as the rest of the ops tables. Idempotent.

-- One row per managed Google Business Profile location. brand_voice is the
-- drafter prompt seeded from hq/review-responder/PERSONA-*.md (see
-- scripts/seed-gbp-locations.sql).
CREATE TABLE IF NOT EXISTS public.gbp_managed_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  -- v1 resource names, resolved via the Account Management / Business
  -- Information APIs on first sync and cached here. gbp_location_name is the
  -- account-scoped path ("accounts/{a}/locations/{l}") because the v4 reviews
  -- endpoints require it.
  gbp_account_name text,
  gbp_location_name text,
  brand_voice text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  -- Retro mode: reply to pre-existing unreplied reviews, paced. OFF until a
  -- backlog clear is wanted (per-location switch, Joseph's call).
  retro_enabled boolean NOT NULL DEFAULT false,
  retro_weekly_cap int NOT NULL DEFAULT 4,
  -- Set after the first successful sync; reviews first seen before this are
  -- classified retro/locked, reviews arriving after are live.
  first_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gbp_managed_locations ENABLE ROW LEVEL SECURITY;

-- One row per review we have ever seen on a managed location.
--   classification: locked = had an owner reply when first seen (NEVER touched);
--                   retro  = unreplied + pre-dates first sync;
--                   live   = arrived after first sync.
--   state:          pending      = seen, not yet drafted (draft budget ran out; next run drafts it)
--                   posted       = our reply is live on Google
--                   held         = drafted, awaiting Joseph (all <=3★, star-only unknowns)
--                   retro_queued = 4-5★ retro draft waiting for a paced slot
--                   drafted      = lint-passed draft not yet posted (dry-run result, or
--                                  the pre-post record in the live path; a non-dry run
--                                  posts these — the crash-safe half-posted state)
--                   failed       = draft failed lint twice or the API errored (terminal; digest surfaces it)
--                   locked       = an owner reply exists that the system did not post (NEVER touched)
CREATE TABLE IF NOT EXISTS public.gbp_review_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.gbp_managed_locations(id) ON DELETE CASCADE,
  review_name text NOT NULL UNIQUE,
  reviewer_name text,
  star_rating int CHECK (star_rating BETWEEN 1 AND 5),
  review_comment text,
  review_create_time timestamptz,
  review_update_time timestamptz,
  classification text NOT NULL CHECK (classification IN ('live', 'retro', 'locked')),
  state text NOT NULL CHECK (state IN ('pending', 'posted', 'held', 'retro_queued', 'drafted', 'failed', 'locked')),
  escalated boolean NOT NULL DEFAULT false,
  reply_text text,
  posted_at timestamptz,
  -- Daily digest marks rows it has reported; null = not yet digested.
  digested_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gbp_review_replies ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_gbp_review_replies_location_state
  ON public.gbp_review_replies(location_id, state);
CREATE INDEX IF NOT EXISTS idx_gbp_review_replies_undigested
  ON public.gbp_review_replies(location_id)
  WHERE digested_at IS NULL;
-- Retro pacing query: posted retro replies in the trailing window.
CREATE INDEX IF NOT EXISTS idx_gbp_review_replies_retro_posted
  ON public.gbp_review_replies(location_id, posted_at)
  WHERE classification = 'retro' AND state = 'posted';

-- Approved GBP posts waiting for their publish date. Rows are written by
-- scripts/load-gbp-posts.ts from an APPROVED ops/gbp-posts batch file; the
-- daily cron publishes rows whose date has arrived via the v4 localPosts API.
CREATE TABLE IF NOT EXISTS public.gbp_scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.gbp_managed_locations(id) ON DELETE CASCADE,
  batch text NOT NULL,
  post_seq int NOT NULL,
  post_type text,
  body text NOT NULL,
  cta_type text CHECK (cta_type IN ('CALL', 'LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP')),
  cta_url text,
  -- Publicly fetchable photo URL (Supabase storage bucket); the API pulls
  -- media from sourceUrl, so Drive links do NOT work here.
  media_url text,
  publish_date date NOT NULL,
  state text NOT NULL DEFAULT 'approved' CHECK (state IN ('approved', 'publishing', 'published', 'failed', 'skipped')),
  published_post_name text,
  error text,
  digested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (location_id, batch, post_seq)
);

ALTER TABLE public.gbp_scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_gbp_scheduled_posts_due
  ON public.gbp_scheduled_posts(publish_date)
  WHERE state = 'approved';
