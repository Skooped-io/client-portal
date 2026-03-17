# SEO Review — Skooped Client Portal
**Reviewed by:** Scout (SEO Sub-Agent, Skooped.io)  
**Date:** 2026-03-16  
**URL:** https://portal.skooped.io

---

## Summary

The client portal is an **authenticated, app-gated product** — it is intentionally not publicly indexable. SEO posture is correctly configured to block crawlers while keeping the Skooped brand anchored via schema markup. All high-impact items are in place.

**Overall SEO Readiness: ✅ PASS** (for an auth-gated portal)

---

## Audit Results

### 1. Metadata — `src/app/layout.tsx` ✅

| Tag | Status | Value |
|-----|--------|-------|
| `<title>` | ✅ Set | `Skooped Client Portal` with `%s \| Skooped` template |
| `<meta description>` | ✅ Set | AI-powered client portal description |
| `metadataBase` | ✅ Set | `https://portal.skooped.io` |
| `og:type` | ✅ Set | `website` |
| `og:title` | ✅ Set | Matches page title |
| `og:description` | ✅ Set | Short, clear summary |
| `og:url` | ✅ Set | `https://portal.skooped.io` |
| `og:image` | ✅ Set | `/og-image.png` (1200×630) |
| `twitter:card` | ✅ Set | `summary_large_image` |
| `robots` meta | ✅ Set | `index: false, follow: false` — correct for auth portal |

**Notes:**
- `/og-image.png` must exist in `/public/`. Verify it's 1200×630px and branded.
- Child routes can override the title template via their own `metadata` exports.

---

### 2. `public/robots.txt` ✅

```
User-agent: *
Disallow: /
```

- All routes blocked from crawlers — correct for an authenticated portal.
- Belt-and-suspenders explicit `Disallow` entries for all key sections.
- `Allow: /sitemap.xml` included so bots can still access the sitemap file.
- Marketing SEO is handled entirely by `skooped.io` (separate domain) — no conflict.

**Action needed:** None.

---

### 3. JSON-LD Organization Schema ✅

Organization schema is injected in `<head>` via `dangerouslySetInnerHTML` in the root layout. Fields present:

| Field | Status |
|-------|--------|
| `@type: Organization` | ✅ |
| `name` | ✅ `Skooped.io` |
| `url` | ✅ `https://skooped.io` |
| `logo` | ✅ Points to `skooped.io/logo.png` |
| `description` | ✅ Includes location (Franklin, TN) |
| `address` | ✅ PostalAddress with city/state/country |
| `contactPoint` | ✅ Customer service, links to contact page |
| `sameAs` | ✅ Instagram + Facebook listed |

**Notes:**
- Since `robots: noindex` is set, Google won't process this schema for the portal. Schema here is primarily for brand consistency and future-proofing if any portal pages become public.
- Recommend duplicating this schema on the main `skooped.io` marketing site where it will actually be indexed and influence Knowledge Graph.

---

## Recommendations (Non-Blocking)

| Priority | Item |
|----------|------|
| 🟡 Medium | Verify `/public/og-image.png` exists and is properly branded (1200×630px) |
| 🟡 Medium | Add the same Organization JSON-LD to the main `skooped.io` site — that's where it counts for Google |
| 🟢 Low | Add `twitter:site` handle (`@skoopedio` or similar) to the Twitter metadata block |
| 🟢 Low | Consider a `WebApplication` schema type for authenticated portal pages (future) |
| 🟢 Low | `public/sitemap.xml` should only list `/` (login page) — verify its content matches |

---

## What This Portal Is NOT Responsible For

- **Public SEO rankings** — that's `skooped.io`'s job
- **Google Business Profile** — managed separately via Scout's GBP tooling
- **Keyword targeting** — portal is internal-facing, not a landing page

---

## Files Touched in This Review

- `src/app/layout.tsx` — Already complete. Metadata, OG tags, JSON-LD all present.
- `public/robots.txt` — Already complete. Full disallow + belt-and-suspenders entries.
- `docs/SEO-REVIEW.md` — This file.

---

*Scout out. 🫡*
