# Social publisher (Facebook scheduling from /m)

Joseph turns crew-captured material into Facebook posts from the material
page (`app.skooped.io/m/<token>`).

**Product rule (Joseph, 2026-09-01, overrides the 8/31 design):** the Meta API
is only ever used to SCHEDULE posts. Nothing is posted live from Skooped.
Approve creates a Meta-held scheduled post; Joseph does the final review,
edits or deletes it in Business Suite Planner; Meta publishes it at the time.
Instagram has no scheduling API and is therefore not in the publisher at all:
schedule it by hand in Business Suite, then **Mark posted** on /m.

## The flow

```
select files on /m  →  Queue N for posting (Facebook)  →  DRAFT row
                                                            │ edit caption, pick a time
                                                            ▼
                                                         Approve
                                                            │ time must be 20 min – 29 days out,
                                                            │ else refused (no publish-now, no cron fallback)
                                                            ▼
                                   Meta SCHEDULED post created (published=false +
                                   scheduled_publish_time; temporary photos + /feed,
                                   or /videos)  →  row 'scheduled'
                                                            │
                                   Joseph reviews / edits / deletes it in Business Suite Planner
                                                            │
                                   Meta publishes it; the cron reads it back and marks the
                                   row 'published' + stamps the library (or 'cancelled' if it
                                   was deleted in Planner)
```

Row states (`social_posts.status`): `draft → publishing (claim) → scheduled → published`,
with `failed` (Meta refused; Retry) and `cancelled`. `approved` is a legacy
resting state from the 8/31 design and is never written anymore; such rows
only accept Unapprove/Delete. Unapprove/Delete on a `scheduled` row deletes
the held post at Meta first and is refused if Meta already published it.
Every first status write from the page is a compare-and-swap on the status
the row was loaded with (double tap / second tab → 409 "changed elsewhere").

Files in a published post get `capture_uploads.posted_at` + `post_ref`
(`fb:<post id>`, appended), the same columns "Mark posted" writes.

## The cron: reconciliation only

`/api/cron/social-publish` (every 5 min via `.github/workflows/social-publish.yml`,
plus a once-daily sweep from `vercel.json`) never calls a Meta create or
publish endpoint. Per run:

0. Rows stuck in `publishing` for 15+ min (a killed approve) → `failed` so Retry shows.
1. `scheduled` Facebook rows past their time (+60 s grace): read the post back.
   Published → `published`, `published_at`, library stamped. Gone from Meta
   (deleted in Planner) → `cancelled`. Otherwise left `scheduled`, checked next tick.

Legacy Instagram rows and legacy `approved` rows are never touched.

## Setup

Env vars (Vercel):

| var | used for |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM for `social_accounts.access_token_enc` (`src/lib/crypto.ts`) |
| `CRON_SECRET` / `SOCIAL_CRON_SECRET` | Bearer auth on the cron tick AND on `/api/admin/social-account`. `SOCIAL_CRON_SECRET` is also the GitHub repository secret the workflow sends |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | admin client; public bucket URLs Meta fetches from |
| `META_APP_ID`, `META_APP_SECRET` | optional: the admin route runs `/debug_token` and stores the expiry |
| `SOCIAL_ACCOUNTS_JSON` | optional fallback when no `social_accounts` row exists (see `loadAccountFromEnv`) |

### Connect a client's Facebook Page

Get a long-lived **Page access token** from a user with the CREATE_CONTENT
task on the Page (`pages_manage_posts`, `pages_read_engagement`,
`pages_show_list`), then:

```
curl -X POST https://app.skooped.io/api/admin/social-account \
  -H "Authorization: Bearer $SOCIAL_CRON_SECRET" -H "Content-Type: application/json" \
  -d '{"org_slug":"gunns-fencing","platform":"facebook","external_id":"<page-id>","display_name":"Gunn'\''s Fencing","access_token":"<token>"}'
```

Response: `{ account: { id, org_id, org_slug, platform, external_id, page_id, display_name, token_expires_at } }`
— the token is never echoed or logged. Re-running replaces the stored token.
Disconnect: `DELETE` with `{ "org_slug", "platform": "facebook" }` → `{ removed }`.
(`npm run social-account` still works from a machine that has
`TOKEN_ENCRYPTION_KEY` + `SUPABASE_DB_URL`.)

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
  only in the `Authorization: Bearer` header.
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
- A `publishing` row whose approve was killed AFTER Meta accepted the post
  but before the row was written is swept to `failed` without a post id;
  check Planner before Retry (the failed-row message says so).
