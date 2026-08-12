-- ============================================================================
-- Skooped.io: central leads table for the lead router (skooped.io/api/lead)
-- Date: 2026-08-12
--
-- The router already writes here on every inbound lead
-- (skooped-marketing/api/lead.ts storeLead, POST /rest/v1/leads), but the table
-- did not exist: the insert 404s, storeLead returns false, and the endpoint
-- still answers 200 with stored:false. So the central ledger was silently empty
-- while each client site kept its own copy. Created ahead of the Twilio work so
-- SMS delivery has somewhere to be recorded from the first text.
--
-- Columns mirror the router's insert exactly. Nothing here is nullable-strict:
-- a lead is worth keeping even when a form only collected a phone number.
--
-- Service-role only (RLS on, zero policies), same posture as the GBP tables and
-- per LEAD-CAPTURE-SPEC-2026-07.md decision 2: lead PII stays locked down.
--
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Which client site sent it. Matches the LEAD_ROUTES key, e.g.
  -- 'affordable-elegance'. Deliberately text, not an org FK: a demo or
  -- prospect site can post before it is ever a paying org.
  site_id text NOT NULL,
  name text,
  phone text,
  email text,
  message text,
  service text,
  source_url text,
  -- What the router managed to deliver for this lead, so a client asking "did
  -- you tell me about this one?" is answerable.
  sms_sent boolean NOT NULL DEFAULT false,
  email_sent boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_leads_site_created
  ON public.leads(site_id, created_at DESC);

-- Undelivered-lead sweep: the rows worth chasing.
CREATE INDEX IF NOT EXISTS idx_leads_undelivered
  ON public.leads(created_at DESC)
  WHERE NOT sms_sent AND NOT email_sent;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Verify:
-- SELECT site_id, count(*), max(created_at) FROM public.leads GROUP BY 1;
