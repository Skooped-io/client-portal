-- ─── Social publisher v1: review-gated Facebook / Instagram posting ──────────
-- Date: 2026-08-31
--
-- Joseph queues crew-captured material from the /m/<token> page into DRAFT
-- posts, edits the caption, picks a platform and a time, and APPROVES. Nothing
-- reaches Meta before that approval (product rule 2026-08-31: posts are never
-- published without his review). After approval:
--
--   facebook  → a Meta SCHEDULED post is created immediately
--               (published=false + scheduled_publish_time) so it shows up in
--               Business Suite Planner and goes live on its own (20 min – 29 days
--               out). Row status
--               'scheduled'. Inside 2 minutes it publishes now; 2–20 min out the
--               cron posts it.
--   instagram → IG has no scheduling API. Row status 'approved'; the
--               /api/cron/social-publish route (hit every 5 min by the GitHub
--               Actions workflow .github/workflows/social-publish.yml; Vercel
--               Hobby only runs daily crons) publishes it at
--               scheduled_at. Unapprove/cancel is possible until then.
--
-- Two tables:
--   social_accounts  one row per (org, platform): the page id / IG user id and
--                    the page access token, AES-256-GCM encrypted with
--                    TOKEN_ENCRYPTION_KEY (src/lib/crypto.ts). Loaded by
--                    scripts/social-account.ts; never by the UI.
--   social_posts     the queue. media = the capture_uploads paths in the post;
--                    derived_media = the JPEGs prepared for IG (HEIC decoded,
--                    padded to a legal ratio). group_id links the FB and IG
--                    copies of one "Queue for posting" action.
--
-- Service-role only (RLS on, zero policies), same posture as the leads table:
-- every reader/writer is a token-scoped route or a cron using the admin client.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  -- Facebook: the Page id. Instagram: the IG user id (instagram_business_account).
  external_id text NOT NULL,
  -- Instagram rows: the Facebook Page the IG account is linked through (its
  -- Page token is what publishes). NULL for facebook rows.
  page_id text,
  display_name text,
  -- src/lib/crypto.ts encrypt() output: iv:authTag:ciphertext (hex).
  access_token_enc text NOT NULL,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, platform)
);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  post_type text NOT NULL CHECK (post_type IN ('image', 'carousel', 'video')),
  caption text,
  -- [{ path, content_type }] — capture_uploads.path values, in post order.
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ path, public_url }] — JPEGs prepared for Meta (client-assets/<org>/derived/).
  derived_media jsonb,
  scheduled_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  -- Facebook: post_id from /photos or /feed. Instagram: the published media id.
  platform_post_id text,
  -- Instagram container id while a publish is in flight (debuggable if the
  -- cron dies between container creation and media_publish).
  ig_container_id text,
  -- draft      → editable, nothing sent
  -- approved   → (IG) waiting for the cron; unapprove returns it to draft
  -- scheduled  → (FB) Meta holds the scheduled post; cancel deletes it there
  -- publishing → claimed by a cron run or the approve route (compare-and-swap,
  --               never re-claimed; swept to failed after 15 min if the run died)
  -- published  → live; capture_uploads.posted_at stamped
  -- failed     → last_error set; Approve again to retry (resumes ig_container_id)
  -- cancelled  → terminal
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  last_error text,
  -- Publish attempts since the last approve (reset to 0 on approve/retry;
  -- transient errors retry up to 3).
  attempts integer NOT NULL DEFAULT 0,
  group_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cron pick: WHERE status IN ('approved') AND scheduled_at <= now().
CREATE INDEX IF NOT EXISTS idx_social_posts_status_scheduled
  ON public.social_posts(status, scheduled_at);

-- /m page queue listing: newest first for one org.
CREATE INDEX IF NOT EXISTS idx_social_posts_org_created
  ON public.social_posts(org_id, created_at DESC);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

-- Verify:
-- SELECT platform, status, count(*) FROM public.social_posts GROUP BY 1, 2;
