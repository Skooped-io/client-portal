-- Retro-negative "open door" replies (Joseph approved the policy 2026-08-10):
-- old (>60 day) unanswered <=3 star reviews may get an auto reply that admits
-- nothing, claims no past outreach, offers only a phone conversation. Gated
-- per location by retro_negative_enabled, which stays FALSE until the client
-- gives one-time blanket consent (a decision on behalf of their business).
-- public_phone is the only contact path those replies may name.
ALTER TABLE public.gbp_managed_locations
  ADD COLUMN IF NOT EXISTS retro_negative_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_phone text;

UPDATE public.gbp_managed_locations SET public_phone = '615-315-1541' WHERE client_key = 'skooped'         AND public_phone IS NULL;
UPDATE public.gbp_managed_locations SET public_phone = '615-796-5174' WHERE client_key = 'rios-landscaping' AND public_phone IS NULL;
UPDATE public.gbp_managed_locations SET public_phone = '615-613-3420' WHERE client_key = 'gunns-fencing'    AND public_phone IS NULL;
