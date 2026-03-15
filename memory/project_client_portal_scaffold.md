---
name: client_portal_scaffold
description: Current build state of the client portal — all completed features and file structure
type: project
---

## Build State: v2 — Onboarding + OAuth complete

**Why:** PRD-onboarding-oauth.md — onboarding wizard, Google/Meta OAuth, token refresh, agent API stubs, settings overhaul.

**How to apply:** Do not recreate existing files. Build additional features on top of this.

---

## Completed Phases

### v1 Scaffold (base)
- Auth (login, signup, logout)
- Sidebar + portal layout
- Dashboard with stat cards
- Settings page (business profile form)
- All placeholder pages (Analytics, SEO, Social, Ads, Website, Messages)
- Supabase clients (server, browser, admin)
- Tests: 38 passing

### v2 — Onboarding + OAuth (2026-03-15)
- **Onboarding wizard**: 5-step wizard with progress saving, full-screen layout no sidebar
  - Step 1: Business basics (name, industry, phone, email, website)
  - Step 2: Location + service areas (multi-input)
  - Step 3: Services + description (tag selector)
  - Step 4: Connect Google (OAuth trigger, skip option)
  - Step 5: Connect Meta (OAuth trigger, skip option)
  - Complete screen with summary
- **Google OAuth**: authorize → callback → token storage (encrypted) → disconnect → status
- **Meta OAuth**: same pattern, long-lived token exchange, page selection metadata
- **Token encryption**: AES-256-GCM, `src/lib/crypto.ts`
- **Token refresh**: `POST /api/oauth/token/refresh` with SERVICE_API_KEY auth
- **Agent API stubs**: 7 routes under `/api/agents/[orgId]/` (Google: search-console, business-profile, analytics, ads; Meta: instagram, facebook; sync)
- **Settings page**: Tabs — Business Profile | Connected Accounts | Account
- **Middleware**: Redirects users with incomplete onboarding to their current wizard step
- **Migration**: `supabase/migrations/20260315000000_onboarding_oauth.sql`
- **Tests**: 92 passing (was 38, added 54 new)

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt for OAuth tokens |
| `src/lib/oauth/google.ts` | Google OAuth URL builder, token exchange, refresh, revoke |
| `src/lib/oauth/meta.ts` | Meta OAuth URL builder, long-lived token exchange, revoke |
| `src/lib/oauth/token-refresh.ts` | Shared refresh logic, error tracking |
| `src/lib/agents/auth.ts` | verifyServiceApiKey + getDecryptedOauthToken for agent routes |
| `src/app/(onboarding)/` | Full onboarding wizard route group |
| `src/app/api/oauth/` | All OAuth API routes |
| `src/app/api/agents/[orgId]/` | Agent data API stubs |
| `src/components/onboarding/` | 8 wizard step components |
| `src/components/settings/` | ConnectedAccounts, OauthStatusCard, AccountSettings |
| `supabase/migrations/20260315000000_onboarding_oauth.sql` | New tables: onboarding_progress, oauth_connections |

## Environment Variables Added
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
- META_APP_ID, META_APP_SECRET, META_REDIRECT_URI
- TOKEN_ENCRYPTION_KEY (32-byte hex, generated)
- SERVICE_API_KEY (base64url, generated)
