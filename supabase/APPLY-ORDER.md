# Applying the migrations to Supabase project `btwrcfzphkwrvcqoyhym`

The live DB is empty except a legacy 1-row `public.clients` table (no code
references it). No migration has ever been applied. Apply all four files via
the SQL editor (https://supabase.com/dashboard/project/btwrcfzphkwrvcqoyhym/sql/new),
one file per run, in exactly this order:

| # | File | What it creates | Idempotent? |
|---|------|-----------------|-------------|
| 1 | `migrations/20260314000000_base_schema.sql` | organizations, organization_members, profiles, business_profiles, subscriptions, contact_submissions, clients (guarded), `update_updated_at_column()`, `user_org_ids()`, RLS | **Yes** — every statement guarded (`IF NOT EXISTS` / `DROP ... IF EXISTS`). Never drops or modifies existing rows; the live `clients` table survives untouched apart from `ENABLE ROW LEVEL SECURITY` |
| 2 | `migrations/20260315000000_onboarding_oauth.sql` | onboarding_progress, oauth_connections, triggers, RLS | **No** — bare `CREATE TABLE` / `CREATE INDEX` / `CREATE POLICY` / `CREATE TRIGGER`; a second run fails on the first `CREATE TABLE`. Run once |
| 3 | `migrations/20260323000000_metric_tables.sql` | seo/analytics/gbp/ads/social metrics, agent_activity, site_deployments, content_posts, reports, RLS | **Partial** — tables and indexes are `IF NOT EXISTS`, but the `CREATE POLICY` statements are not guarded; a second run fails at the first policy. Run once |
| 4 | `migrations/20260728000000_report_share_tokens.sql` | `reports.share_token` column + partial unique index | **Yes** — `ADD COLUMN IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` |

Order matters: 2 and 3 both have FKs and policies against
`organizations(id)` / `organization_members`, created only by 1.
4 alters `reports`, created only by 3.

## Notes

- **Concatenation:** you can also paste all four files into a single SQL-editor
  run in the order above; each file is a plain SQL script with no `BEGIN/COMMIT`
  of its own (the editor wraps the run in one transaction, so a failure rolls
  back everything — safe).
- **`clients` lockdown:** step 1 enables RLS on `public.clients` with no
  policies. The portal never touches that table; only the service-role key can
  read it afterward. If some external consumer reads `clients` with the anon
  key, delete that one `ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;`
  line before running.
- **20260315 fix included:** its two `oauth_connections` policies originally
  selected `organization_id` from `organization_members` — a column that never
  existed anywhere (code and 20260323 use `org_id`). Fixed in the same commit
  that adds the base schema; without the fix, step 2 fails at
  `CREATE POLICY "Org members can view oauth connections"`.
- **Service role:** signup, onboarding inserts, the contact endpoint, and all
  cron/agent routes use the service-role client and bypass RLS. RLS policies
  only cover the browser-session (user) client's reads/updates.
- **Known app gap (not fixed here):** `src/app/api/stripe/webhook/route.ts`
  writes `subscriptions` with the cookie-based server client; in a webhook
  context there is no session, so RLS will block the upsert. The route should
  use `createAdminClient()`. Schema matches the route's own DDL comment either
  way.
- **Seeding test data:** after all four migrations, `scripts/seed-test-metrics.sql`
  seeds 30 days of metrics for a hard-coded org id — insert an `organizations`
  row with that id first, or edit `oid` at the top of the script.
