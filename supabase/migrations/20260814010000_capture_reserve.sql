-- ─── Atomic quota reservation for crew capture ───────────────────────────────
-- Review finding (2026-08-13): the sign route's read-then-insert quota check
-- was a TOCTOU race: N concurrent /api/capture/sign requests could each read
-- the same pre-insert usage and all pass, multiplying the daily caps by the
-- concurrency. This function serializes per org with an advisory xact lock and
-- does check + insert in one transaction. Limits are passed in by the caller
-- so the constants live in one place (src/lib/capture/validate.ts).
--
-- Service-role only: EXECUTE revoked from anon/authenticated.

CREATE OR REPLACE FUNCTION public.capture_reserve(
  p_org_id uuid,
  p_job text,
  p_files jsonb, -- [{ "path": text, "content_type": text, "size_bytes": bigint }]
  p_max_files int,
  p_max_bytes bigint
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

  INSERT INTO capture_uploads (org_id, path, job, content_type, size_bytes)
  SELECT p_org_id, f->>'path', p_job, f->>'content_type', (f->>'size_bytes')::bigint
  FROM jsonb_array_elements(p_files) f;

  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_reserve(uuid, text, jsonb, int, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.capture_reserve(uuid, text, jsonb, int, bigint) FROM anon, authenticated;
