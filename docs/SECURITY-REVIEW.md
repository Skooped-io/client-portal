# Security Review — Client Portal

**Date:** 2026-03-16  
**Reviewer:** Mark (Security Chief, Skooped.io)  
**Scope:** Full security audit of `builds/client-portal`

---

## Summary

Overall security posture is **solid for a v1 portal**. Auth is enforced, tokens are encrypted, RLS is configured, and the OAuth flows follow best practices. Three issues required immediate fixes (committed alongside this review). Several medium-priority recommendations follow.

---

## 1. Middleware — Auth Enforcement on Protected Routes ✅ GOOD

**File:** `middleware.ts`

- Uses `supabase.auth.getUser()` (server-side, not `getSession()`) — correct. Session cookie forgery cannot bypass this.
- Unauthenticated users are redirected to `/login` for all non-API, non-auth routes.
- Authenticated users on auth pages are correctly redirected to `/dashboard`.
- Onboarding gate is enforced: incomplete onboarding redirects to the current step.
- API routes (`/api/*`) are intentionally excluded from middleware redirects — they handle their own auth. This is correct.

**Finding:** No issues. Middleware is properly structured.

---

## 2. API Routes — Auth Checks, Input Validation, Error Handling ✅ GOOD (with one fix applied)

### Agent Routes (`/api/agents/[orgId]/*`)
- All routes call `verifyServiceApiKey(request)` before any logic. ✅
- Service key check: `apiKey === process.env.SERVICE_API_KEY` — correct, but see **Recommendation 2** on timing attacks.
- OrgId from URL params is passed to `getDecryptedOauthToken` which fetches from DB — no user-controlled injection risk.
- Stub responses in place for unimplemented APIs (GSC, GBP, Ads, Analytics) — acceptable for v1.

### OAuth Routes (`/api/oauth/*`)
- Authorize routes: auth check via `supabase.auth.getUser()` before initiating flow. ✅
- Callback routes: CSRF protection via `state` cookie (httpOnly, sameSite=lax, 10-min TTL). ✅
- State validation compares both the state value AND binds to `userId` from session. ✅
- Redirect URL from state payload validated to be a relative path (see fix below). ✅
- Token encryption before DB upsert. ✅
- Status/Disconnect routes: user auth + org membership enforced via Supabase RLS + `getCurrentOrgId`. ✅

### Auth Callback (`/api/auth/callback`)
**🔴 FIXED — Open Redirect Vulnerability**

The `next` query parameter was passed directly to `NextResponse.redirect()` without validation:
```ts
// Before (vulnerable)
const next = searchParams.get('next') ?? '/dashboard'
return NextResponse.redirect(`${origin}${next}`)
```

An attacker could craft: `/api/auth/callback?code=...&next=//evil.com` to redirect users off-domain after login.

**Fix applied:** `next` is now validated to be a relative path with no protocol-relative prefix:
```ts
const next =
  nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.includes(':')
    ? nextParam
    : '/dashboard'
```

### Token Refresh (`/api/oauth/token/refresh`)
- Service key auth enforced. ✅
- Uses admin Supabase client (service role) — appropriate for a cron-only route. ✅
- Error handling per-connection: failures are written back to DB without crashing the batch. ✅
- Revocation logic (after 5 failed refresh attempts) is implemented. ✅

---

## 3. Hardcoded Secrets / API Keys 🟡 WARNING

**Finding:** `.next/` build artifacts contain the Supabase anon key baked into compiled chunks. This is expected for `NEXT_PUBLIC_*` variables (they are intentionally public) but worth flagging for clarity:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` appear in `.next/` build files — this is **by design**. The anon key is safe to be public because RLS is enforced (see Section 5).
- `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, `SERVICE_API_KEY`, `META_APP_SECRET`, `GOOGLE_CLIENT_SECRET` are all server-only and do **not** appear in client-side code. ✅
- No hardcoded secrets found in application source (`src/`). ✅

**Recommendation:** Add `.next/` and `.env.local` to `.gitignore` (verify they are not committed).

---

## 4. `.env.example` — Missing Variables 🔴 FIXED

**File:** `.env.example`

The original `.env.example` was missing 6 variables that are required for the application to function:
- `GOOGLE_REDIRECT_URI`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY` (was listed as `ENCRYPTION_KEY` — wrong name)
- `SERVICE_API_KEY`

**Fix applied:** `.env.example` has been rewritten to match the actual env vars used in the codebase, with generation instructions for sensitive keys.

---

## 5. Supabase RLS — Row Level Security ✅ GOOD

**File:** `supabase/migrations/20260315000000_onboarding_oauth.sql`

RLS is enabled on both new tables:

**`onboarding_progress`:**
- SELECT: `user_id = auth.uid()` — users see only their own record. ✅
- INSERT: `user_id = auth.uid()` — users can only insert for themselves. ✅
- UPDATE: `user_id = auth.uid()` — users can only update their own record. ✅
- No DELETE policy — correct. Progress records should persist.

**`oauth_connections`:**
- SELECT/ALL: scoped to `org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())` ✅
- This prevents cross-org token access at the database level — even if a bug exists in API logic, RLS is a hard stop.

**Finding:** RLS is correctly configured. The admin client (service role) used in agent routes and token refresh bypasses RLS intentionally — this is appropriate since those routes are service-authenticated.

---

## 6. XSS Vectors — `dangerouslySetInnerHTML` ✅ CLEAN

Grepped all `.tsx` and `.ts` files under `src/`. Zero results for `dangerouslySetInnerHTML`. No XSS injection vectors found in JSX.

---

## 7. Dependency Vulnerabilities — npm audit 🟡 MODERATE (dev-only)

```
Total: 6 moderate, 0 high, 0 critical
```

All 6 moderate vulnerabilities are in **development dependencies only** (`vitest`, `vite`, `esbuild`). The esbuild issue allows dev servers to accept cross-origin requests — irrelevant in production since the dev server is never exposed.

**No production dependency vulnerabilities.** ✅

**Recommendation:** Run `npm audit fix` to update dev deps when vite/vitest publish patches, but this is low urgency.

---

## 8. Security Headers — next.config.ts 🔴 FIXED

**File:** `next.config.ts`

No security headers were configured. This left the portal without:
- Clickjacking protection (`X-Frame-Options`)
- MIME sniffing protection (`X-Content-Type-Options`)
- HTTPS enforcement (`Strict-Transport-Security`)
- Content Security Policy

**Fix applied:** Added a `headers()` block to `next.config.ts` with the following headers on all routes:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-XSS-Protection` | `1; mode=block` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | Scoped to self + Supabase + Sentry + Axiom |

**Note:** The `serverActions.allowedOrigins` array was also updated to include `NEXT_PUBLIC_APP_URL` so production server actions are permitted beyond `localhost:3000`.

---

## 9. OAuth Token Handling — Encrypted Storage ✅ GOOD

**File:** `src/lib/crypto.ts`

Tokens are encrypted with AES-256-GCM before storage:
- Algorithm: `aes-256-gcm` ✅
- IV: 96-bit random per encryption call ✅
- Auth tag: 128-bit (tamper detection) ✅
- Key: 32-byte hex from `TOKEN_ENCRYPTION_KEY` env var ✅
- Format: `iv:authTag:ciphertext` (all hex) ✅

Key is never logged or exposed. `decrypt()` validates IV and auth tag lengths before use.

**Finding:** Cryptographic implementation is correct and production-grade. No issues.

---

## 10. Sensitive Route Auth Guards ✅ GOOD

**`/settings` (and all portal pages):**
Protected by middleware — unauthenticated users are redirected to `/login`. Onboarding gate also applies.

**`/api/*` agent routes:**
All require `x-service-api-key` header matching `SERVICE_API_KEY` env var. No user-facing exposure.

**`/api/oauth/*` user-facing routes:**
All validate Supabase session via `supabase.auth.getUser()` and return 401 on failure.

**`/api/oauth/token/refresh`:**
Cron-only endpoint. Validates `x-service-api-key`. Not accessible without the key.

---

## Recommendations (Not Yet Fixed)

### Rec 1: Add `orgId` UUID format validation on agent routes
Agent routes accept `orgId` from the URL path. While the DB query will simply return 0 rows for malformed IDs, explicit UUID format validation would prevent unnecessary DB queries and clarify error responses.

```ts
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
if (!UUID_REGEX.test(orgId)) {
  return NextResponse.json({ error: 'Invalid orgId' }, { status: 400 })
}
```

### Rec 2: Use timing-safe comparison for SERVICE_API_KEY
String equality (`===`) is vulnerable to timing attacks. Use Node's `timingSafeEqual`:

```ts
import { timingSafeEqual } from 'crypto'

export function verifyServiceApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-service-api-key')
  if (!apiKey || !process.env.SERVICE_API_KEY) return false
  const a = Buffer.from(apiKey)
  const b = Buffer.from(process.env.SERVICE_API_KEY)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
```

### Rec 3: Verify .next/ and .env.local are in .gitignore
Confirm `.gitignore` excludes `.next/`, `.env.local`, and any other files containing secrets before the repo goes public or is shared with contractors.

### Rec 4: Rate limiting on OAuth authorize routes
The `/api/oauth/google/authorize` and `/api/oauth/meta/authorize` routes generate a new state cookie on every request. Consider adding rate limiting (e.g., via Upstash or Vercel middleware rate limiting) to prevent abuse.

### Rec 5: Add `SameSite=Strict` to state cookies (low priority)
Current setting is `SameSite=Lax`. For the OAuth state cookies, `Strict` would be slightly more hardened, though `Lax` is the standard recommendation for OAuth flows that require cross-site redirects from the provider.

---

## Files Modified in This Review

| File | Change |
|------|--------|
| `src/app/api/auth/callback/route.ts` | Fixed open redirect on `next` param |
| `next.config.ts` | Added security headers, fixed allowedOrigins |
| `.env.example` | Added 6 missing variables, corrected key names |
| `docs/SECURITY-REVIEW.md` | This file |

---

— Mark  
Security Chief, Skooped.io  
2026-03-16
