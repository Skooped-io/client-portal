# Social publisher (Facebook + Google Business scheduling from /m)

Joseph turns crew-captured material into Facebook and Google Business Profile
posts from the material page (`app.skooped.io/m/<token>`).

**Product rule (Joseph, 2026-09-01; Google added 2026-09-03):** vendor APIs
are only ever used to SCHEDULE posts. Nothing is posted live from Skooped.
Approve creates a vendor-held scheduled post — Facebook via `published=false`
+ `scheduled_publish_time`, Google via `LocalPost.scheduledTime` (read-back
state must be `SCHEDULED`); Joseph does the final review, edits or deletes it
in Business Suite Planner / Business Profile Manager; the vendor publishes it
at the time. Instagram has no scheduling API and is therefore not in the
publisher at all: schedule it by hand in Business Suite, then **Mark posted**
on /m.

## The flow

```
select files on /m  →  Queue N for posting (Facebook / Google / Both)  →  DRAFT row per platform
                                                            │ edit caption, pick a time
                                                            │ (google: pick the CTA button + link)
                                                            ▼
                                                         Approve
                                                            │ time must be 20 min – 29 days out,
                                                            │ else refused (no publish-now, no cron fallback)
                                                            ▼
                                   Facebook: Meta SCHEDULED post created (published=false +
                                   scheduled_publish_time; temporary photos + /feed, or /videos)
                                   Google:   v4 localPost created WITH scheduledTime, read back,
                                             must be state SCHEDULED (else best-effort delete + fail)
                                                            →  row 'scheduled'
                                                            │
                                   Joseph reviews / edits / deletes it in Business Suite Planner
                                   (FB) or Business Profile Manager (Google)
                                                            │
                                   The vendor publishes it; the cron reads it back and marks the
                                   row 'published' + stamps the library (or 'cancelled' if it
                                   was deleted in the vendor UI)
```

Row states (`social_posts.status`): `draft → publishing (claim) → scheduled → published`,
with `failed` (vendor refused; Retry) and `cancelled`. `approved` is a legacy
resting state from the 8/31 design and is never written anymore; such rows
only accept Unapprove/Delete. Unapprove/Delete on a `scheduled` row deletes
the held post at the vendor first and is refused if it already went live.
Every first status write from the page is a compare-and-swap on the status
the row was loaded with (double tap / second tab → 409 "changed elsewhere").

Files in a published post get `capture_uploads.posted_at` + `post_ref`
(`fb:<post id>` / `gbp:<localPost resource name>`, appended), the same columns
"Mark posted" writes.

## The Google platform (2026-09-03)

- **Queue** offers Google only when the org has an active `gbp_managed_locations`
  row with a resolved `gbp_location_name` (`client_key` = the org **slug**;
  the queue route refuses with "No Google Business location connected for
  this client" otherwise). One tap on Both creates an FB and a Google draft
  sharing a `group_id`.
- **Media**: Google posts carry ONE photo — a multi-image selection keeps only
  the first image on the google draft; video is refused outright ("Google
  Business posts take one photo — no video"). The same derived JPEG pipeline
  is reused (public URL, JPEG, well above Google's 250 px / 10 KB floor).
- **CTA button** (`social_posts.cta_type` / `cta_url`): None / Call /
  Learn more (the queue-time default) / Book / Order / Shop / Sign up. Call
  uses the location's listed phone number; every other button needs an
  https URL (≤512 chars), enforced at approve.
- **Caption**: no documented Google max, so google keeps Facebook's 63,206 cap.
- **Auth**: the existing fleet OAuth token (`GBP_CLIENT_ID/SECRET/REFRESH_TOKEN`),
  not `social_accounts` — nothing to connect per client beyond the location row.
- **Hold verification**: after create, the post is read back and must be state
  `SCHEDULED`. `LIVE` or missing → best-effort delete + the row fails keeping
  the resource name (so Retry/Delete can clean the orphan, never duplicate).
  The GBP client refuses a publisher-path create without `scheduledTime`
  (`assertGbpScheduleOnly`, gated on `{ scheduleOnly: true }` — the legacy
  gbp-posts route still publishes immediately without the flag).
- Google's own scheduledTime window is undocumented; both vendors share the
  20 min – 29 day window until observed otherwise.

## Retired: the daily GBP batch cron (2026-09-03)

`/api/cron/gbp-posts` has **no schedule anymore** (removed from `vercel.json`);
the monthly markdown-batch pipeline (`ops/gbp-posts` → `scripts/load-gbp-posts.ts`
→ `gbp_scheduled_posts`) is retired in favor of /m. The route file remains for
manual invocation (Bearer `CRON_SECRET`) against any leftover rows; the loader
script and table are untouched.

## The cron: reconciliation only

`/api/cron/social-publish` (every 5 min via `.github/workflows/social-publish.yml`,
plus a once-daily sweep from `vercel.json`) never calls a Meta or Google
create/publish endpoint. Per run:

0. Rows stuck in `publishing` for 15+ min (a killed approve) → `failed` so Retry shows.
1. `scheduled` Facebook rows past their time (+60 s grace): read the post back.
   Published → `published`, `published_at`, library stamped. Gone from Meta
   (deleted in Planner) → `cancelled`. Otherwise left `scheduled`, checked next tick.
2. `scheduled` Google rows, same pass: `LIVE` → `published` + stamp
   (`gbp:<name>`); gone (deleted in Business Profile Manager) → `cancelled`;
   still `SCHEDULED`/`PROCESSING` or a read blip → left `scheduled`.

Legacy Instagram rows and legacy `approved` rows are never touched.

## Setup

Env vars (Vercel):

| var | used for |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM for `social_accounts.access_token_enc` (`src/lib/crypto.ts`) |
| `CRON_SECRET` / `SOCIAL_CRON_SECRET` | Bearer auth on the cron tick only. `SOCIAL_CRON_SECRET` is also the GitHub repository secret the workflow sends, so it can never do more than trigger a read-only reconcile |
| `ADMIN_API_SECRET` | Bearer auth on `/api/admin/social-account` (writes Page tokens). Vercel env only — never a GitHub secret |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | admin client; public bucket URLs Meta fetches from |
| `META_APP_ID`, `META_APP_SECRET` | optional: the admin route runs `/debug_token`, stores the expiry and refuses a token whose `profile_id` is not the given Page |
| `SOCIAL_ACCOUNTS_JSON` | optional fallback when no `social_accounts` row exists (see `loadAccountFromEnv`) |
| `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REFRESH_TOKEN` | the Google platform: the fleet OAuth token (`src/lib/gbp/client.ts`) — same credentials the review responder uses |

Secrets are compared in constant time (`src/lib/cron-secret.ts`).

### Connect a client's Facebook Page

Get a long-lived **Page access token** from a user with the CREATE_CONTENT
task on the Page (`pages_manage_posts`, `pages_read_engagement`,
`pages_show_list`). Put the body in a file so the token never touches the
command line (shell history, `ps`), then:

```
cat > body.json <<'EOF'
{"org_slug":"gunns-fencing","platform":"facebook","external_id":"<page-id>","display_name":"Gunn's Fencing","access_token":"<token>"}
EOF
curl -X POST https://app.skooped.io/api/admin/social-account \
  -H "Authorization: Bearer $ADMIN_API_SECRET" -H "Content-Type: application/json" \
  --data-binary @body.json
rm body.json
```

`external_id` (and `page_id`) must be the numeric Page id; `access_token`
must be 16–1024 chars.
Response: `{ account: { id, org_id, org_slug, platform, external_id, page_id, display_name, token_expires_at } }`
— the token is never echoed or logged. Re-running replaces the stored token.
Disconnect: `DELETE` with `{ "org_slug", "platform": "facebook" }` →
`{ removed, env_fallback_active }`. That removes the stored token only: posts
Meta already holds still publish (delete them in Planner; their rows can no
longer be reconciled or unapproved from /m), and while `SOCIAL_ACCOUNTS_JSON`
still lists the org (`env_fallback_active: true`) the publisher keeps using
that entry — remove it too.
(`npm run social-account` still works from a machine that has
`TOKEN_ENCRYPTION_KEY` + `SUPABASE_DB_URL`; Facebook only.)

### Connect a client's Google Business location

Nothing token-shaped: give the org an active `gbp_managed_locations` row whose
`client_key` equals the org **slug** and whose `gbp_location_name` is resolved
(the review responder's sync resolves it). The /m Queue sheet shows the Google
option as soon as that row exists.

## Media

Images are turned into Meta-ready JPEGs on approve (`src/lib/social/media.ts`):
HEIC/HEIF decoded with `heic-decode`, EXIF orientation baked in, transparency
flattened onto white, padded (not cropped) to a legal ratio — carousels pad
every item to the first item's ratio — width capped at 1440, quality 85,
stored at `client-assets/<org>/derived/<sha1(source path)>.jpg`. Videos pass
through as their original public URL (Meta transcodes).

Rules: 1 image → photo; 2–10 images → carousel; 1 video → video. Mixed
video+images and multiple videos are refused at queue time.

## Meta facts this code relies on (verified 2026-08-31)

- Graph API pinned at `v26.0` (`src/lib/social/meta.ts`). Page tokens travel
  only in the `Authorization: Bearer` header, except `/debug_token`, which
  needs the inspected token as `input_token` in the query — Sentry records no
  span for that request and scrubs `*token*` query params everywhere
  (`src/lib/sentry-scrub.ts`). The transport refuses any content POST that is
  not `published=false` and any Instagram publishing edge.
- Scheduled photo post: unpublished `temporary=true` `/photos` + `/feed` with
  `published=false`, `scheduled_publish_time`, `attached_media[n]` (Meta's
  single-photo scheduled call returns no post_id, seen live 8/31). Video:
  `/videos` with `published=false` + `scheduled_publish_time` (Video node id;
  read back with `published`, not `is_published`).
- Effective scheduling window ~20 min – 29 days (Meta documents 10 min – 30
  days; real `(#100)` errors say otherwise). We read the post back and
  delete + abort on a stored-time mismatch.
- "Object deleted" is `(#100)` with `error_subcode` 33 (or `(#803)` / 404);
  a bare `(#100)` is never read as "deleted".

## Skipped polish

- No OAuth flow; tokens are pasted into the admin route (or the CLI).
- No video transcoding or cover frames.
- Facebook video posts store the Video node id; Planner deep-links are not built.
- A `publishing` row whose approve process was KILLED after Meta accepted
  the post but before the row was written is swept to `failed` without a
  post id; check Planner before Retry (the failed-row message says so). A
  failed DB write on that path (not a kill) is retried once and then parked
  as `failed` with the id, so Retry replaces the held post instead of
  duplicating it.
