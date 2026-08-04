-- ═══════════════════════════════════════════════════════════════════════════
-- Retire the Jake-era persona roster on public.agent_activity
-- ═══════════════════════════════════════════════════════════════════════════
--
-- STATUS: UNAPPLIED as of 2026-08-04.
--
-- Run this by hand in the Supabase SQL editor for project btwrcfzphkwrvcqoyhym:
--   https://supabase.com/dashboard/project/btwrcfzphkwrvcqoyhym/sql/new
--
-- What it does:
--   1. Relabels every existing agent_activity row to 'system'. The 18 rows
--      currently in the table are all 'riley'.
--   2. Replaces the old CHECK constraint, which allowed the seven named
--      personas plus 'red' and 'system' (cooper, scout, bob, sierra, riley,
--      mark, sandra, red, system), with one that allows only
--      ('skooped', 'system').
--
-- Safe to run twice: the UPDATE is a no-op on the second run, and the
-- constraint is always dropped before it is recreated.
--
-- Application code writes the literal 'system' into agent_activity, so the
-- app works both before and after this migration is applied. 'skooped' is
-- accepted by the new constraint but is not written by any route today.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  agent_attnum smallint;
  con_name text;
BEGIN
  IF to_regclass('public.agent_activity') IS NULL THEN
    RAISE NOTICE 'public.agent_activity does not exist, nothing to do';
    RETURN;
  END IF;

  -- 1. Relabel legacy persona rows.
  UPDATE public.agent_activity SET agent = 'system' WHERE agent <> 'system';

  -- 2. Drop any CHECK constraint on the agent column. The original was
  --    declared inline on the column in 20260323000000_metric_tables.sql, so
  --    Postgres auto-named it agent_activity_agent_check; look it up rather
  --    than trusting the name.
  SELECT attnum INTO agent_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.agent_activity'::regclass
    AND attname = 'agent'
    AND NOT attisdropped;

  FOR con_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.agent_activity'::regclass
      AND con.contype = 'c'
      AND con.conkey = ARRAY[agent_attnum]
  LOOP
    EXECUTE format('ALTER TABLE public.agent_activity DROP CONSTRAINT %I', con_name);
  END LOOP;

  -- 3. Recreate it with the single company identity.
  ALTER TABLE public.agent_activity
    ADD CONSTRAINT agent_activity_agent_check
    CHECK (agent IN ('skooped', 'system'));
END
$$;
