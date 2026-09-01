# Social publisher v1 (Facebook + Instagram from /m)

Joseph turns crew-captured material into Facebook/Instagram posts from the
material page (`app.skooped.io/m/<token>`). **Nothing reaches Meta without his
approval** — that is the whole design.

## The review gate

```
select files on /m  →  Queue for posting (FB / IG / both)  →  DRAFT rows
                                                                 │ edit caption, pick time
                                                                 ▼
                                                              Approve
                     ┌───────────────────────────────────────────┴──────────────────────────────┐
   Facebook, 20 min – 29 days out                                      Instagram (any future time)
   Meta SCHEDULED post created now                                     row status 'approved'
   (published=false + scheduled_publish_time)                          /api/cron/social-publish (every 5 min via GitHub Actions)
   → visible/editable in Business Suite Planner                        publishes it at scheduled_at
   → Meta publishes it; our cron notices and stamps the library        (IG has no scheduling API)
   Under 2 minutes / past: published immediately (either platform).    Facebook 2–20 min or beyond 29 days: cron too.
```

Row states (`social_posts.status`): `draft → approved → scheduled | publishing → published`,
with `failed` (last_error shown on the page; Approve = retry, resuming an
in-flight Instagram container) and `cancelled`.
Unapprove works on `approved` and `scheduled` (the Meta scheduled post is
deleted first). Delete works on anything not yet live. Once a row is
`publishing` or `published` no user action applies. Every status write from
the page is a compare-and-swap on the status the row was loaded with, so a
double tap or a second tab can never send the same post to Meta twice; the
loser gets a 409 "changed elsewhere; reload".

Files used in a published post get `capture_uploads.posted_at` + `post_ref`
(`fb:<post id>` / `ig:<media id>`, appended, so a file posted to both keeps
both), the same columns "Mark posted" writes.

## Setup

Env vars (Vercel + local `.env.local`):

| var | status | used for |
|---|---|---|
| `TOKEN_ENCRYPTION_KEY` | exists | AES-256-GCM for `social_accounts.access_token_enc` (`src/lib/crypto.ts`) |
| `CRON_SECRET` | exists | Bearer auth on `/api/cron/social-publish` (same as the other crons). **Also a GitHub repository secret** — the 5-minute trigger is `.github/workflows/social-publish.yml`, because Vercel Hobby only allows daily crons (a `*/5` entry in vercel.json fails the whole deploy); vercel.json keeps a once-daily safety sweep |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | exist | admin client; public bucket URLs Meta fetches from |
| `META_APP_ID`, `META_APP_SECRET` | optional | `scripts/social-account.ts` runs `/debug_token` and stores the expiry |

Apply the migration: `npm run db:apply -- supabase/migrations/20260901000000_social_publisher.sql`.

### Connect a client's Facebook Page / Instagram account

1. Get a **long-lived Page access token** for the client's Page from a user
   who has the CREATE_CONTENT task on it, with `pages_manage_posts`,
   `pages_read_engagement`, `pages_show_list` (+ `instagram_basic`,
   `instagram_content_publish` for IG). Save it to a file (never argv).
2. Facebook:
   ```
   npm run social-account -- gunns-fencing facebook --external-id <page-id> --token-file ./gunn.token --name "Gunn's Fencing"
   ```
3. Instagram (same Page token; the IG user id is resolved from the Page):
   ```
   npm run social-account -- gunns-fencing instagram --page-id <page-id> --token-file ./gunn.token
   ```
   Re-running replaces the stored token. Delete the token file afterwards.

The page shows a clear error on Approve when no account is connected.

## Media

Images are turned into Meta-ready JPEGs on approve (`src/lib/social/media.ts`):
HEIC/HEIF decoded with `heic-decode` (libheif WASM — sharp's prebuilt
binaries will never ship HEVC), EXIF orientation baked in, transparency
flattened onto white, **padded (not cropped)** to the nearest legal Instagram
ratio (4:5 … 1.91:1) — carousels pad every item to the FIRST item's ratio, since
Instagram crops all children to it — width capped at 1440, quality 85, stored at
`client-assets/<org>/derived/<sha1(source path)>.jpg`. Videos pass through as
their original public URL (Meta transcodes; IG feed video = Reel).

Rules: 1 image → photo; 2–10 images → carousel; 1 video → video/reel. Mixed
video+images and multiple videos are refused at queue time.

## Meta facts this code relies on (verified 2026-08-31)

- Graph API pinned at `v26.0` (`src/lib/social/meta.ts`).
- FB `/photos`: `url`, `caption`, `published=false`, `scheduled_publish_time`
  (unix seconds) returns `{ id, post_id }`; multi-photo = unpublished
  `/photos` (`temporary=true` when scheduled) + `/feed` with
  `attached_media[n]={"media_fbid":…}`. Meta documents the scheduling window as 10 minutes to
  30 days (the `/feed` reference says 75 days); the Help Center and real (#100)
  errors put the working range at ~20 minutes to 29 days, so we only hand Meta
  posts 20 min – 29 days out and the cron covers 2–20 min.
  We read the post back (`published` for a Video node, `is_published` for a
  Page Post) and delete + abort on a scheduled-time mismatch; a transient
  read-back failure keeps the post (the create call carried the time).
- Page tokens travel only in the `Authorization: Bearer` header, never the
  query string or body (Sentry span data records URLs; `sentry.server.config.ts`
  also scrubs `access_token` as a backstop).
- "Object deleted" is `(#100)` with `error_subcode` 33 (or `(#803)` / HTTP 404).
  A bare `(#100)` is Meta's generic bad-parameter code and is never read as
  "deleted".
- Unpublished/temporary photos live ~24h if not attached to a post.
- IG: `POST /{ig-user-id}/media` (image_url / CAROUSEL children /
  REELS video_url) → poll `status_code` until FINISHED → `media_publish`.
  Polling backs off 5→10→20→40→60 s. Every publish carries a deadline (route:
  100 s inside its 120 s cap; cron: a 240 s run budget inside its 300 s cap);
  on the deadline the row returns to `approved` with its `ig_container_id`
  and the next cron tick RESUMES that container (PUBLISHED → done, FINISHED →
  publish, IN_PROGRESS → keep waiting) instead of creating a new one.
  100 API posts per 24h per account (`content_publishing_limit`).

## Skipped polish (v1)

- No OAuth flow: tokens are loaded by CLI. Page tokens from a long-lived user
  token do not expire, but re-run the script if `/debug_token` says otherwise.
- No video transcoding or cover frames; no IG Stories; no cross-posting
  from FB to IG via Meta's own tool.
- A `publishing` row whose function was killed is swept to `failed` by the
  cron after 15 minutes (Retry on /m resumes the container). The cron does
  not itself retry it; it
  stays visible as "Publishing…" until then (same posture as GBP posts).
- Facebook video posts store the Video node id; the Page Post id is not
  exposed by `POST /videos`, so Planner deep-links are not built for them.
- A resumed IG container that Meta already PUBLISHED records the container
  id as `platform_post_id` (the container does not expose the media id).
