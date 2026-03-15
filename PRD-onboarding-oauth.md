# PRD: Client Onboarding + OAuth Integration

## ⚠️ MANDATORY: Read These Files First

Before writing ANY code, read these guideline files in full:

1. `~/.openclaw/workspace/memory/resources/reference/bob-ui-guidelines.md` — UI components, shadcn usage, brand theme, component patterns
2. `~/.openclaw/workspace/memory/resources/reference/bob-backend-guidelines.md` — Supabase clients, auth, data fetching, validation, error handling
3. `~/.openclaw/workspace/memory/resources/reference/bob-testing-guidelines.md` — Vitest, RTL, Playwright, coverage requirements
4. `~/.openclaw/workspace/brand/shadcn-theme.css` — Drop-in CSS variables for the Skooped brand theme
5. `~/.openclaw/workspace/brand/DESIGN-SYSTEM.md` — Full brand reference (colors, typography, spacing, components)

Follow every rule in those files. No exceptions.

Also read the existing codebase — the v1 scaffold is already built. Do NOT recreate what exists. Build ON TOP of it.

## Overview

Build the client onboarding experience and OAuth integration layer for the Skooped.io client portal. When a new client signs up, they should be guided through setting up their business profile and connecting their Google and Meta accounts. OAuth tokens are stored securely, refreshed automatically, and used by Skooped agents to pull/push data on behalf of clients.

## Tech Stack (same as v1)

- **Framework:** Next.js (App Router) — already set up
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL) — already connected
- **Auth:** Supabase Auth — already working
- **Styling:** Tailwind CSS + shadcn/ui — already configured

## New Dependencies Needed

- `googleapis` — Google API client library (for GSC, GBP, Analytics, Ads)
- `next-auth` is NOT needed — we handle OAuth flows manually with Google/Meta endpoints
- No other new deps — keep it lean

---

## Phase 1: Onboarding Wizard

### New Database Tables (create via Supabase migration SQL)

```sql
-- Track onboarding progress per user
CREATE TABLE onboarding_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  current_step INTEGER DEFAULT 1 NOT NULL,
  completed_steps INTEGER[] DEFAULT '{}' NOT NULL,
  is_complete BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- OAuth connections per organization
CREATE TABLE oauth_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL, -- 'google' | 'meta'
  provider_account_id TEXT, -- their Google/Meta account ID
  provider_email TEXT, -- email associated with the OAuth account
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  scope TEXT, -- granted scopes
  expires_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  refresh_error TEXT, -- last refresh error if any
  refresh_error_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' NOT NULL, -- 'active' | 'expired' | 'revoked' | 'error'
  connected_services TEXT[] DEFAULT '{}', -- ['search_console', 'business_profile', 'analytics', 'ads']
  metadata JSONB DEFAULT '{}', -- provider-specific data (selected GSC property, GBP location ID, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(org_id, provider)
);

-- RLS policies
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding" ON onboarding_progress
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own onboarding" ON onboarding_progress
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can insert own onboarding" ON onboarding_progress
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Org members can view oauth connections" ON oauth_connections
  FOR SELECT USING (
    org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Org members can manage oauth connections" ON oauth_connections
  FOR ALL USING (
    org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );
```

### Onboarding Flow (5 Steps)

**Step 1: Welcome & Business Basics**
- Welcome message: "lets get your business set up on Skooped"
- Fields: business name, industry (dropdown), phone, email, website URL
- Pre-fill from existing business_profiles if data exists
- Validate with Zod

**Step 2: Location & Service Areas**
- Fields: street address, city, state, zip
- Service areas: multi-input (add/remove cities or regions they serve)
- This feeds into SEO targeting later

**Step 3: Services & Description**
- What services does the business offer? (multi-select tags + custom input)
- Business description (textarea, 500 char max)
- This feeds into content generation and SEO pages

**Step 4: Connect Google**
- Explain what we need and why: "connecting Google lets us track your search performance, manage your business listing, and run ads for you"
- "Connect Google Account" button → triggers Google OAuth flow
- After OAuth success, show which services were connected with checkmarks:
  - ✅ Google Search Console
  - ✅ Google Business Profile  
  - ✅ Google Analytics
  - ✅ Google Ads
- Allow "Skip for now" — they can connect later from settings
- Show the Google account email that was connected

**Step 5: Connect Social Media (Optional)**
- "Connect Instagram & Facebook" button → triggers Meta OAuth flow
- Show connected accounts with checkmarks
- "Skip for now" prominently — social is optional
- Note: "you can always connect these later from your dashboard"

**Final: All Done**
- Summary of what was set up
- "Go to Dashboard" button
- Mark onboarding as complete

### Onboarding UI Requirements

- Full-screen wizard (no sidebar during onboarding)
- Progress bar at top showing steps 1-5
- Back/Next buttons at bottom
- Each step saves progress to Supabase immediately (so they can leave and come back)
- If user has incomplete onboarding, redirect them to onboarding on login
- Clean, calm, encouraging energy — not overwhelming
- Mobile responsive
- Use shadcn Card, Input, Label, Select, Button, Badge components

### Onboarding Route Structure

```
src/app/(onboarding)/
  layout.tsx          ← clean layout, no sidebar, progress bar
  onboarding/
    page.tsx           ← redirects to current step
    step/[step]/
      page.tsx         ← dynamic step pages
    complete/
      page.tsx         ← completion screen
```

---

## Phase 2: Google OAuth Integration

### Google OAuth Setup

**Scopes needed:**
```
https://www.googleapis.com/auth/webmasters.readonly    — Search Console
https://www.googleapis.com/auth/business.manage        — Business Profile
https://www.googleapis.com/auth/analytics.readonly      — Analytics
https://www.googleapis.com/auth/adwords                 — Google Ads (read)
https://www.googleapis.com/auth/userinfo.email          — Get their email
https://www.googleapis.com/auth/userinfo.profile        — Get their name
```

**Environment Variables (add to .env.local):**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/oauth/google/callback
```

### OAuth Flow

1. Client clicks "Connect Google"
2. Frontend redirects to `/api/oauth/google/authorize`
3. API route builds Google OAuth URL with scopes and state parameter
4. Google shows consent screen
5. Google redirects to `/api/oauth/google/callback` with authorization code
6. Callback exchanges code for access_token + refresh_token
7. Tokens stored in `oauth_connections` table
8. Redirect back to onboarding/settings with success

### API Routes

```
src/app/api/oauth/
  google/
    authorize/route.ts    ← builds OAuth URL, redirects to Google
    callback/route.ts     ← handles callback, stores tokens
    disconnect/route.ts   ← revokes token, removes from DB
    status/route.ts       ← returns connection status for current org
  meta/
    authorize/route.ts    ← builds Meta OAuth URL
    callback/route.ts     ← handles callback, stores tokens
    disconnect/route.ts   ← revokes, removes
    status/route.ts       ← connection status
  token/
    refresh/route.ts      ← manual token refresh endpoint (called by cron)
```

### Google Callback Logic (Detailed)

```typescript
// In /api/oauth/google/callback/route.ts
// 1. Verify state parameter matches what we sent
// 2. Exchange authorization code for tokens
// 3. Call Google userinfo to get email + profile
// 4. Determine which services are available:
//    - Check if they have Search Console properties
//    - Check if they have Business Profile listings
//    - Check if they have Analytics properties
//    - Check if they have Google Ads accounts
// 5. Store in oauth_connections:
//    - access_token (encrypted)
//    - refresh_token (encrypted)
//    - expires_at (access tokens expire in 1 hour)
//    - scope (what was actually granted)
//    - connected_services (which APIs they have access to)
//    - provider_email
// 6. Redirect back to onboarding or settings page
```

### Token Encryption

Tokens at rest should be encrypted before storing in Supabase:
- Use AES-256-GCM encryption
- Encryption key stored in environment variable: `TOKEN_ENCRYPTION_KEY`
- Create `src/lib/crypto.ts` with encrypt/decrypt functions
- Never log or expose raw tokens

```typescript
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

export function encrypt(text: string): string { ... }
export function decrypt(encrypted: string): string { ... }
```

---

## Phase 3: Meta OAuth Integration

### Meta OAuth Setup

**Scopes needed:**
```
pages_show_list          — List their Facebook pages
pages_read_engagement    — Read page insights
pages_manage_posts       — Create/edit posts on their page
instagram_basic          — Basic Instagram account info
instagram_content_publish — Publish content to Instagram
instagram_manage_insights — Read Instagram insights
```

**Environment Variables:**
```
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:3001/api/oauth/meta/callback
```

### Meta OAuth Flow

Same pattern as Google:
1. Build OAuth URL with scopes
2. Meta consent screen
3. Callback with code
4. Exchange for access token (Meta uses long-lived tokens — 60 days)
5. Store in oauth_connections
6. Get list of Facebook pages + connected Instagram accounts
7. Let client select which page/account to use (store in metadata JSONB)

---

## Phase 4: Token Refresh System

### Token Refresh API Route

`POST /api/oauth/token/refresh` — called by Cooper's cron job

```typescript
// Logic:
// 1. Query all oauth_connections where:
//    - status = 'active'
//    - expires_at < NOW() + interval '30 minutes' (refresh 30 min before expiry)
//    OR
//    - status = 'error' AND refresh_error_count < 5 (retry failed refreshes)
// 2. For each connection:
//    a. Decrypt refresh_token
//    b. Call provider's token refresh endpoint
//    c. Encrypt new access_token
//    d. Update: access_token, expires_at, last_refreshed_at, status = 'active'
//    e. On error: increment refresh_error_count, set refresh_error message
//    f. If refresh_error_count >= 5: set status = 'revoked', alert Cooper
// 3. Return summary: { refreshed: N, failed: N, revoked: N }
```

### Google Token Refresh
```
POST https://oauth2.googleapis.com/token
  grant_type=refresh_token
  client_id=...
  client_secret=...
  refresh_token=...
→ Returns new access_token + expires_in (3600 seconds)
```

### Meta Token Refresh
```
GET https://graph.facebook.com/v19.0/oauth/access_token
  grant_type=fb_exchange_token
  client_id=...
  client_secret=...
  fb_exchange_token=...
→ Returns new long-lived token (60 days)
```

### Token Refresh Cron (Cooper manages this)

A cron job that runs every 30 minutes:
- Calls `POST /api/oauth/token/refresh` with a service API key
- Google tokens expire every hour — refresh at 30 min mark
- Meta tokens expire every 60 days — refresh weekly
- If a token can't be refreshed after 5 attempts, mark as revoked and notify Cooper
- Cooper alerts Jake + the client that reconnection is needed

**Security:** The refresh endpoint requires a `SERVICE_API_KEY` header to prevent unauthorized access. This key is stored in .env.local.

---

## Phase 5: Agent Data API Routes

These are the endpoints our agents (Scout, Riley, Sierra) call to interact with client data through their OAuth connections.

```
src/app/api/agents/
  [orgId]/
    google/
      search-console/route.ts  ← GSC data (impressions, clicks, queries)
      business-profile/route.ts ← GBP data (reviews, posts, insights)
      analytics/route.ts        ← GA4 data (sessions, pageviews)
      ads/route.ts              ← Google Ads data (spend, impressions, clicks)
    meta/
      instagram/route.ts        ← IG insights, posts
      facebook/route.ts         ← FB page insights, posts
    sync/route.ts               ← Trigger manual data sync for this org
```

Each route:
1. Authenticates the request (service API key or authenticated user)
2. Looks up the org's oauth_connection for that provider
3. Decrypts the access_token
4. Makes the API call to Google/Meta
5. Returns the data

**These routes are for Phase 2 of the portal build — stub them out now with proper types and error handling, but don't implement the full API calls yet. Mark them with TODO comments.**

---

## Phase 6: Settings Page Updates

Update the existing `/settings` page to include:

### Connected Accounts Section
- Show each connected service with status indicator:
  - 🟢 Connected (provider email shown)
  - 🔴 Disconnected
  - 🟡 Needs Reconnection (token expired/revoked)
- "Connect" / "Disconnect" / "Reconnect" buttons per service
- Last synced timestamp
- Which specific properties/accounts are selected (e.g., which GSC property, which GBP location)

### Layout
```
Settings Page
├── Business Profile (existing — move to tab)
├── Connected Accounts (new tab)
│   ├── Google section
│   │   ├── Search Console — 🟢 Connected (property: skooped.io)
│   │   ├── Business Profile — 🟢 Connected (Skooped - Franklin, TN)
│   │   ├── Analytics — 🟢 Connected (GA4 property: 12345)
│   │   └── Google Ads — 🔴 Not Connected [Connect]
│   └── Meta section
│       ├── Instagram — 🟡 Needs Reconnection [Reconnect]
│       └── Facebook — 🔴 Not Connected [Connect]
└── Account (new tab — email, password change)
```

Use shadcn Tabs for the settings layout.

---

## File Structure (new files only)

```
src/
├── app/
│   ├── (onboarding)/
│   │   ├── layout.tsx
│   │   └── onboarding/
│   │       ├── page.tsx
│   │       ├── step/[step]/page.tsx
│   │       └── complete/page.tsx
│   └── api/
│       ├── oauth/
│       │   ├── google/
│       │   │   ├── authorize/route.ts
│       │   │   ├── callback/route.ts
│       │   │   ├── disconnect/route.ts
│       │   │   └── status/route.ts
│       │   ├── meta/
│       │   │   ├── authorize/route.ts
│       │   │   ├── callback/route.ts
│       │   │   ├── disconnect/route.ts
│       │   │   └── status/route.ts
│       │   └── token/
│       │       └── refresh/route.ts
│       └── agents/
│           └── [orgId]/
│               ├── google/
│               │   ├── search-console/route.ts
│               │   ├── business-profile/route.ts
│               │   ├── analytics/route.ts
│               │   └── ads/route.ts
│               ├── meta/
│               │   ├── instagram/route.ts
│               │   └── facebook/route.ts
│               └── sync/route.ts
├── components/
│   ├── onboarding/
│   │   ├── OnboardingWizard.tsx
│   │   ├── StepProgress.tsx
│   │   ├── BusinessBasicsStep.tsx
│   │   ├── LocationStep.tsx
│   │   ├── ServicesStep.tsx
│   │   ├── GoogleConnectStep.tsx
│   │   ├── MetaConnectStep.tsx
│   │   └── OnboardingComplete.tsx
│   └── settings/
│       ├── ConnectedAccounts.tsx
│       ├── OAuthStatusCard.tsx
│       └── AccountSettings.tsx
└── lib/
    ├── crypto.ts               ← token encryption/decryption
    ├── oauth/
    │   ├── google.ts           ← Google OAuth helpers
    │   ├── meta.ts             ← Meta OAuth helpers
    │   └── token-refresh.ts    ← shared refresh logic
    └── schemas.ts              ← add new Zod schemas for onboarding
```

---

## Environment Variables Needed

```env
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/oauth/google/callback

# Meta OAuth  
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:3001/api/oauth/meta/callback

# Token Security
TOKEN_ENCRYPTION_KEY=          # 32-byte hex string for AES-256-GCM

# Agent API Access
SERVICE_API_KEY=               # Random string for agent API auth
```

---

## Acceptance Criteria

### Onboarding
- [ ] New users see onboarding wizard after first login
- [ ] Progress saves between steps (can leave and come back)
- [ ] All business info saves to business_profiles table
- [ ] Wizard is mobile responsive
- [ ] "Skip" options work for OAuth steps
- [ ] Completed onboarding never shows wizard again

### Google OAuth
- [ ] "Connect Google" redirects to Google consent screen
- [ ] Callback stores encrypted tokens in oauth_connections
- [ ] Connected services detected and displayed
- [ ] Disconnect revokes token and removes from DB
- [ ] Status endpoint returns current connection state

### Meta OAuth
- [ ] Same flow as Google but for Meta/Instagram/Facebook
- [ ] Page/account selection stored in metadata
- [ ] Long-lived token exchange works

### Token Refresh
- [ ] `/api/oauth/token/refresh` refreshes expiring tokens
- [ ] Failed refreshes increment error count
- [ ] 5+ failures mark connection as revoked
- [ ] Refresh endpoint requires SERVICE_API_KEY auth

### Settings
- [ ] Connected Accounts tab shows all OAuth connections
- [ ] Can connect/disconnect/reconnect from settings
- [ ] Status indicators reflect real connection state

### Security
- [ ] Tokens encrypted at rest (AES-256-GCM)
- [ ] State parameter prevents CSRF in OAuth flows
- [ ] Agent API routes require SERVICE_API_KEY
- [ ] No tokens exposed in frontend or logs
- [ ] RLS policies enforce org-level access

### Tests
- [ ] Zod schemas for onboarding steps
- [ ] Crypto encrypt/decrypt roundtrip
- [ ] OAuth state parameter validation
- [ ] Token refresh logic (mock provider responses)
- [ ] Onboarding wizard step navigation
- [ ] Connected accounts status display

---

## Notes

- The existing portal scaffold is in this directory. Do NOT recreate existing pages, components, or lib files.
- Read the existing code first to understand the patterns already in place.
- Google and Meta OAuth credentials will be added to .env.local separately — generate placeholder values for now.
- For the TOKEN_ENCRYPTION_KEY, generate a random 32-byte hex string and add it to .env.local.
- The Supabase migration SQL should be in `supabase/migrations/` as timestamped files.
- Agent API routes should be stubbed with proper types and TODO comments — full Google/Meta API integration comes in a future PRD.
- Keep the onboarding energy calm and encouraging — match the portal vibe, not a sales funnel.
- All UI components must use shadcn/ui. All styling must use Tailwind.
