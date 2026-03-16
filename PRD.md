# PRD: Skooped.io Client Portal — v1 Scaffold

## ⚠️ MANDATORY: Read These Files First

Before writing ANY code, read these guideline files in full:

1. `~/.openclaw/workspace/memory/resources/reference/bob-ui-guidelines.md` — UI components, shadcn usage, brand theme, component patterns
2. `~/.openclaw/workspace/memory/resources/reference/bob-backend-guidelines.md` — Supabase clients, auth, data fetching, validation, error handling
3. `~/.openclaw/workspace/memory/resources/reference/bob-testing-guidelines.md` — Vitest, RTL, Playwright, coverage requirements
4. `~/.openclaw/workspace/brand/shadcn-theme.css` — Drop-in CSS variables for the Skooped brand theme
5. `~/.openclaw/workspace/brand/DESIGN-SYSTEM.md` — Full brand reference (colors, typography, spacing, components)

Follow every rule in those files. No exceptions.

## Overview

Build the initial scaffold of the Skooped.io client portal — a Next.js web application that connects to Supabase for auth, data, and client management. This is the dashboard where Skooped clients log in to see their marketing performance, manage their business profile, and communicate with the team.

This PRD covers the v1 scaffold: project setup, auth flow, layout/navigation, and core page shells with real Supabase connections. NOT full feature implementation — just the skeleton that everything builds on.

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL) — already set up with 23 tables
- **Auth:** Supabase Auth (email/password)
- **Hosting:** Vercel (later, develop locally for now)
- **Icons:** Lucide React

## Supabase Connection

- **Project URL:** `[REDACTED - see .env.local]`
- **Anon Key:** `[REDACTED - see .env.local]`
- Store these in `.env.local` (gitignored)

## Design System

### Colors (Tailwind custom config)
```
strawberry: '#D94A7A'
vanilla: '#E8C87A'  
gold: '#C99035'
chocolate: '#6E3D20'
maroon: '#6D1326'
background: '#F7F2ED'
backgroundLight: '#FDFAF7'
card: '#F2E8D6'
cardHover: '#EBDCC5'
border: '#E0D4C4'
foreground: '#361C24'
muted: '#7A6458'
mutedLight: '#9A8A7E'
```

### Typography
- Headings: Nunito (Google Fonts) — weights 600, 700, 800
- Body: DM Sans (Google Fonts) — weights 400, 500, 700
- Border radius: 0.75rem default

### Portal Vibe
- Same brand as marketing site but CALM energy
- No decorative blobs, swooshes, or sparkles
- Clean card-based layouts
- Professional dashboard feel with warm colors

## Requirements

### 1. Project Setup
- [ ] Initialize Next.js 14+ with App Router and TypeScript
- [ ] Install and configure Tailwind CSS with custom color palette from the design system
- [ ] Install and initialize shadcn/ui (`npx shadcn@latest init`) — use the custom theme from `brand/shadcn-theme.css`
- [ ] Install shadcn components: Button, Card, Input, Label, Select, Textarea, Dialog, Sheet, Avatar, Badge, Separator, Skeleton, Tabs, Accordion, Table, Tooltip, DropdownMenu, Toast
- [ ] Install `@supabase/supabase-js` and `@supabase/ssr`
- [ ] Install `zod` for validation
- [ ] Install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` for testing
- [ ] Create Supabase client utilities (browser + server + admin) following the patterns in bob-backend-guidelines.md exactly
- [ ] Configure `.env.local` with Supabase URL and anon key (already exists in this directory)
- [ ] Install `lucide-react` for icons
- [ ] Add Google Fonts: Nunito and DM Sans via `next/font`
- [ ] Apply the shadcn theme CSS variables from `brand/shadcn-theme.css` into globals.css
- [ ] Set up the custom Tailwind theme with all brand colors, fonts, and border radius

### 2. Authentication
- [ ] Login page (`/login`) — email + password form
- [ ] Sign up page (`/signup`) — email + password + full name
- [ ] Auth middleware — protect all routes except `/login` and `/signup`
- [ ] On signup, create a row in `profiles` table with user's name
- [ ] On login, redirect to `/dashboard`
- [ ] Logout functionality in the sidebar
- [ ] Session management with Supabase SSR helpers

### 3. Layout & Navigation
- [ ] Authenticated layout with fixed left sidebar (240px, collapsible to 64px icon-only)
- [ ] Sidebar items:
  - Dashboard (home icon)
  - Analytics (bar-chart icon)
  - SEO (search icon)
  - Social (instagram icon)
  - Ads (megaphone icon)
  - Website (globe icon)
  - Messages (message-square icon)
  - Settings (settings icon)
- [ ] Sidebar header: Skooped logo/icon + org name
- [ ] Sidebar footer: user avatar + name + logout button
- [ ] Active state: Strawberry Pink text with pink/10% background pill
- [ ] Top bar with page title and breadcrumbs
- [ ] Mobile: sidebar becomes a hamburger slide-out

### 4. Dashboard Page (`/dashboard`)
- [ ] Welcome header: "Welcome back, [name]" with current date
- [ ] 4 stat cards in a row:
  - Website Visits (this month)
  - Google Impressions (this month)
  - Phone Calls (this month)
  - Google Reviews (total)
- [ ] Stat cards pull from Supabase tables: `analytics_daily`, `gsc_daily`, `gbp_daily`, `gbp_reviews`
- [ ] If no data exists yet, show placeholder state: "No data yet — we're setting things up!"
- [ ] Recent Activity section (placeholder for now)
- [ ] Quick Actions: "Update Business Profile", "View Reports", "Send Message"

### 5. Settings / Business Profile Page (`/settings`)
- [ ] Form that reads from and writes to `business_profiles` table
- [ ] Fields: business name, industry, phone, email, website URL, city, state, description, services (JSON array), service areas (JSON array)
- [ ] Save button that updates Supabase
- [ ] Success toast on save
- [ ] This is how clients update their info — it flows into our knowledge base

### 6. Page Shells (Empty States)
Create these pages with proper layout, title, and a centered empty state message. No real functionality yet — just the shells:
- [ ] `/analytics` — "Analytics dashboard coming soon"
- [ ] `/seo` — "SEO reports coming soon"
- [ ] `/social` — "Social media dashboard coming soon"  
- [ ] `/ads` — "Ads performance coming soon"
- [ ] `/website` — "Website health dashboard coming soon"
- [ ] `/messages` — "Messages coming soon"

Each shell should have the sidebar nav active state on the correct item.

### 7. Seed Script
- [ ] Create a seed script (`scripts/seed.ts` or `seed.sql`) that:
  - Creates a test organization: "Skooped" with slug "skooped"
  - Creates a business profile for Skooped (Franklin, TN, etc.)
  - Inserts sample data into `analytics_daily`, `gsc_daily`, `gbp_daily` for the last 30 days so the dashboard has something to show
  - This is for development/demo purposes

## File Structure

```
builds/client-portal/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (portal)/
│   │   │   ├── layout.tsx          ← sidebar layout
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   ├── seo/page.tsx
│   │   │   ├── social/page.tsx
│   │   │   ├── ads/page.tsx
│   │   │   ├── website/page.tsx
│   │   │   ├── messages/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── layout.tsx              ← root layout (fonts, globals)
│   │   └── page.tsx                ← redirect to /dashboard or /login
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── StatCard.tsx
│   │   └── EmptyState.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           ← browser client
│   │   │   ├── server.ts           ← server client
│   │   │   └── middleware.ts        ← auth middleware
│   │   └── types.ts                ← TypeScript types for DB tables
│   └── styles/
│       └── globals.css
├── .env.local
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## Acceptance Criteria

- [ ] Can create an account with email/password
- [ ] Can log in and see the dashboard
- [ ] Dashboard shows 4 stat cards (with placeholder data if no real data)
- [ ] Sidebar navigation works — clicking each item goes to the right page
- [ ] Sidebar collapses to icon-only on toggle
- [ ] Settings page can read/write business profile to Supabase
- [ ] All pages use the brand design system (colors, fonts, radius)
- [ ] Mobile responsive — sidebar becomes hamburger menu
- [ ] Auth-protected routes redirect to /login if not authenticated
- [ ] Clean TypeScript — no `any` types

## Notes

- The database already exists with all 23 tables and RLS policies. Do NOT run migrations — just connect to it
- RLS is enabled — authenticated users can only see data for orgs they belong to via `organization_members`
- The seed script should use the service role key (stored in env) to bypass RLS for seeding
- This is the SCAFFOLD — get the structure right, make it look good, make auth work. Features come next
- Do NOT use `pages/` router — use App Router only
- Keep the repo in this directory: `~/.openclaw/workspace/builds/client-portal/`
- ALL UI components must use shadcn/ui — never build custom when shadcn has it
- ALL styling must use Tailwind — no custom CSS files, no inline styles, no CSS modules
- ALL forms must validate with Zod before hitting the database
- ALL interactive components need hover and focus states
- The portal is CALM energy — no decorative blobs, swooshes, or sparkles. Clean, professional, warm Skooped colors
- Follow the component patterns in bob-ui-guidelines.md exactly for stat cards, sidebar, forms, empty states
- Write tests for server actions, Zod schemas, and interactive components using Vitest + RTL
