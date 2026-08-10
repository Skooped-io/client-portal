-- Per-location early-live switch for the review responder. When the global
-- GBP_DRY_RUN env is on, a location with live_replies = true runs the LIVE
-- posting path anyway (auto-post 4-5 star, held <=3 star unchanged). Added
-- 2026-08-10: Joseph flipped Skooped's own profile live first; client
-- profiles stay dry until the digest proves the voice.
ALTER TABLE public.gbp_managed_locations
  ADD COLUMN IF NOT EXISTS live_replies boolean NOT NULL DEFAULT false;
