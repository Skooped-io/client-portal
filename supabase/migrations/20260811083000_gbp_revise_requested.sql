-- Voice corrections after the fact (Andy asked 2026-08-11 for company voice "we"
-- instead of "I", after 4 replies were already published in his name).
-- Flagging a POSTED row redrafts it in the location's current brand_voice and
-- overwrites our own reply on Google via updateReply. Only ever set on rows the
-- system itself posted: 'locked' rows (hand-written) stay untouchable.
ALTER TABLE public.gbp_review_replies
  ADD COLUMN IF NOT EXISTS revise_requested boolean NOT NULL DEFAULT false;
