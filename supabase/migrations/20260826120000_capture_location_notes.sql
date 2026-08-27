-- ─── Crew capture: location + notes intake fields ────────────────────────────
-- The crew page's one "Job" field slugs into the storage path and loses the
-- free text. Location and notes ride each capture_uploads row verbatim so the
-- content team knows the city/neighborhood and what the job actually was
-- without texting the client.

ALTER TABLE public.capture_uploads
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Recreate capture_reserve with the two new defaulted params. The old 5-arg
-- signature is dropped first: leaving it would make named-arg RPC calls
-- ambiguous. The defaults keep the already-deployed 5-arg caller working in
-- the window between this migration landing and the code deploy.
DROP FUNCTION IF EXISTS public.capture_reserve(uuid, text, jsonb, int, bigint);

CREATE FUNCTION public.capture_reserve(
  p_org_id uuid,
  p_job text,
  p_files jsonb, -- [{ "path": text, "content_type": text, "size_bytes": bigint }]
  p_max_files int,
  p_max_bytes bigint,
  p_location text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
  v_bytes bigint;
  v_new_count bigint;
  v_new_bytes bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

  SELECT count(*), coalesce(sum(size_bytes), 0)
    INTO v_count, v_bytes
    FROM capture_uploads
    WHERE org_id = p_org_id
      AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc');

  SELECT count(*), coalesce(sum((f->>'size_bytes')::bigint), 0)
    INTO v_new_count, v_new_bytes
    FROM jsonb_array_elements(p_files) f;

  IF v_count + v_new_count > p_max_files THEN
    RETURN 'quota_files';
  END IF;
  IF v_bytes + v_new_bytes > p_max_bytes THEN
    RETURN 'quota_bytes';
  END IF;

  INSERT INTO capture_uploads (org_id, path, job, content_type, size_bytes, location, notes)
  SELECT p_org_id, f->>'path', p_job, f->>'content_type', (f->>'size_bytes')::bigint,
         p_location, p_notes
  FROM jsonb_array_elements(p_files) f;

  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_reserve(uuid, text, jsonb, int, bigint, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.capture_reserve(uuid, text, jsonb, int, bigint, text, text) FROM anon, authenticated;
