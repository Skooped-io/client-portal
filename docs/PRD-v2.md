# Client Portal v2 — PRD

**Project:** Skooped Client Portal Rebuild
**Owner:** Cooper (orchestrator) + Bob (lead dev)
**Status:** Approved by Jake — 2026-03-16
**Target:** Production deploy to Vercel
**Repo:** github.com/Skooped-io/client-portal

---

## Overview

Rebuild the Skooped client portal from a functional MVP into a premium, next-generation SaaS dashboard that makes people say "holy shit." The portal is the product — its what clients pay for. It needs to feel like Stripe meets Linear meets the future of AI-powered marketing.

Ice cream brand identity (medium intensity). Dark mode. Framer-motion animations. Agent profiles. Full workflow integration with Axiom logging, GitHub tracking, and Slack communications.

---

## Design Direction

### Energy Level: Premium Playful
Not boring corporate. Not childish. The sweet spot where a client feels like theyre using something built by people who are ahead of the curve. Every interaction should feel intentional and polished.

### Design References
- **Stripe Dashboard** — clean data presentation, beautiful typography, subtle animations
- **Linear** — keyboard-first, fast transitions, dark mode done right
- **Vercel** — deployment status cards, real-time updates, minimal but powerful
- **Framer** — smooth page transitions, micro-interactions that feel alive

### Brand Integration (Medium Ice Cream)
- Ice cream color palette throughout (Strawberry Pink, Mint, Vanilla, Blueberry, Cotton Candy)
- Ice cream themed loading animations (The Drip, Scoop Stack, The Melt)
- Playful typography (Nunito headings, DM Sans body)
- Warm color surfaces (cream backgrounds, not sterile white)
- Subtle decorative touches (no blobs or sparkles — save those for marketing site)
- Brand personality in empty states and micro-copy

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict, functional) |
| Styling | Tailwind CSS + CSS custom properties from design system |
| Components | shadcn/ui (customized to brand) |
| Animations | Framer Motion (page transitions, micro-interactions, loading states) |
| Charts | Recharts or Tremor (animated, branded colors) |
| Icons | Lucide React |
| Auth | Supabase Auth (Google OAuth, magic links) |
| Database | Supabase (PostgreSQL, RLS) |
| Hosting | Vercel (auto-deploy on push to main) |
| Logging | Axiom (ops, clients, portal) + Sentry (errors) |
| Dark Mode | next-themes + CSS custom properties |
| Command Palette | cmdk (⌘K) |
| Toasts | Sonner |
| Fonts | Nunito + DM Sans via next/font |

---

## Pages & Features

### 1. Login / Signup
- Supabase Auth with Google OAuth + magic link
- Branded login page with ice cream gradient background
- Animated logo entrance (framer-motion, scale + fade)
- "Get Skooped" CTA button in Strawberry Pink
- Dark mode toggle available on login

### 2. Onboarding Wizard (existing — enhance)
- 5-step flow with animated progress bar (ice cream scoop filling)
- Step transitions with framer-motion slide animations
- Google OAuth connection step with success celebration animation
- Service selection with animated card hover states
- Completion screen with confetti or sprinkles animation

### 3. Dashboard (Main View)
The hero page. This is what clients see every day.

**Layout:**
- Fixed left sidebar (collapsible) with agent avatars + nav
- Top bar with client name, notification bell, dark mode toggle, ⌘K command palette
- Main content area with responsive card grid

**Metric Cards (top row):**
- Total leads this month (animated counter on load)
- Website traffic (sparkline chart)
- Google ranking (position indicator with trend arrow)
- Ad spend / ROI (progress ring)
- Each card: hover lift animation, click to drill down
- Skeleton loading states on initial load (shimmer animation)

**Content Calendar Preview:**
- Upcoming 7 days of scheduled content
- Platform icons (IG, FB, Google)
- Status badges (scheduled, posted, draft)
- Click to expand to full calendar view

**Recent Activity Feed:**
- Timeline of what the team did for this client
- Agent avatars next to each action ("Scout updated your keywords", "Sierra scheduled 3 posts")
- Animated entry — items slide in from right
- "View all" link to full activity log

**AI Insights Panel:**
- Cooper's latest recommendations
- Styled as a chat-like interface with Coopers avatar
- "Your top keyword dropped 3 spots — heres what I recommend"
- Action buttons on recommendations ("Apply", "Dismiss", "Ask Cooper")

### 4. SEO & Rankings Page
- Keyword position tracking table with trend arrows (↑ green, ↓ red, → gray)
- Search impressions / clicks chart (Recharts, animated on load)
- Top performing pages table
- Google Business Profile health card
- Competitor comparison section
- Filter by date range (7d, 30d, 90d, custom)

### 5. Ads & Leads Page
- Active campaign cards with status indicators
- Cost per lead gauge (animated ring chart)
- Lead pipeline funnel visualization
- Lead list with source, status, date
- Call log from LSA (if active)
- Budget vs spend progress bar

### 6. Content & Social Page
- Full content calendar (month view, week view)
- Post preview cards with platform, caption, image, scheduled time
- Engagement metrics per post (likes, comments, shares, saves)
- Content performance chart (engagement over time)
- Drag to reschedule (future)
- Upload area for client photos/videos

### 7. Reports Page
- Monthly report viewer (HTML/PDF)
- Key metrics summary with MoM comparison
- Downloadable reports archive
- "Share with team" functionality
- Automated report badge ("Generated by Riley")

### 8. Agent Team Page
- Grid of agent cards with avatars, names, roles
- Each agent shows what theyre currently working on for this client
- Agent activity feed (recent actions per agent)
- "Ask Cooper" button — opens chat interface
- Animated card entrance (staggered, framer-motion)
- Hover: agent card lifts, shows bio tooltip
- This page should make clients feel like they have a TEAM working for them

### 9. Settings Page
- Account settings (name, email, password)
- Connected accounts (Google, Meta) with OAuth status
- Notification preferences
- Billing info and plan details
- Team members (invite others from their business)
- Dark mode preference (persisted)

### 10. Command Palette (⌘K)
- Global search across all pages
- Quick actions: "Go to SEO", "View latest report", "Ask Cooper"
- Recent pages
- Keyboard navigation
- Animated open/close (framer-motion backdrop blur + scale)

---

## Animations & Interactions

### Page Transitions
- Framer-motion AnimatePresence on route changes
- Fade + slight translateY on enter/exit
- Duration: 200ms ease-in-out

### Loading States
- Skeleton screens with shimmer animation for all data-dependent components
- Ice cream themed full-page loader for initial app load (Scoop Stack animation)
- Inline loading spinners use Strawberry Pink

### Metric Cards
- Animated counters (count up from 0 to value on first load)
- Sparkline charts draw themselves left-to-right
- Hover: translateY(-2px) + shadow increase
- Click: slight scale down (0.98) on press

### Charts
- Animate on viewport enter (intersection observer)
- Line charts draw path progressively
- Bar charts grow from bottom
- Pie/ring charts animate clockwise fill

### Agent Cards
- Staggered entrance (each card 50ms delay)
- Hover: lift + glow with agents accent color
- Avatar has subtle breathing animation (scale 1.0 → 1.02)

### Dark Mode Toggle
- Smooth transition on all colors (200ms)
- Sun/moon icon morphs between states
- No flash on page load (next-themes handles this)

### Toast Notifications
- Sonner toasts slide in from bottom-right
- Success: mint green accent
- Error: strawberry pink accent
- Auto-dismiss after 5s with progress bar

---

## Dark Mode

Full dark mode implementation using next-themes + CSS custom properties.

### Dark Palette
| Token | Light | Dark |
|-------|-------|------|
| Background | #F7F2ED | #1A1216 |
| Background Light | #FDFAF7 | #211A1E |
| Card | #F2E8D6 | #2A1E22 |
| Card Hover | #EBDCC5 | #352830 |
| Border | #E0D4C4 | #3D2E35 |
| Foreground | #361C24 | #F7F2ED |
| Muted | #7A6458 | #9A8A7E |

Brand colors (Strawberry Pink, Waffle Gold, etc) stay the same in both modes — they work on both light and dark.

---

## Workflow Integration

### Axiom Logging (via src/lib/logger/)
Every significant portal action gets logged:
- `portal.auth.login` / `portal.auth.logout`
- `portal.page.viewed` (which page, which client)
- `portal.api.request` (all API calls with status + duration)
- `portal.report.downloaded`
- `portal.oauth.connected` / `portal.oauth.disconnected`
- `portal.settings.updated`

### Sentry Error Tracking
- Automatic error boundary on every page
- Source maps uploaded for readable stack traces
- User context attached (client_id, client_name)
- Performance monitoring (20% sample in production)

### GitHub Issues
- Build tasks tracked as issues in Skooped-io/client-portal
- Branch naming: feat/bob-{issue#}-{description}
- PRs reviewed by Cooper before merge

### Agent Activity Display
- Dashboard pulls recent agent activity from Supabase
- Shows real actions agents took (not fake/simulated)
- Agent avatars and names from the team profiles

---

## Data Sources

| Data | Source | Update Frequency |
|------|--------|-----------------|
| SEO metrics | Google Search Console API | Daily (via seo-engine) |
| Ad performance | Google Ads API | Daily (via seo-engine) |
| Website traffic | GA4 API | Daily (via reporting-engine) |
| GBP data | Google Business Profile API | Daily (via seo-engine) |
| Content calendar | Supabase content_queue table | Real-time |
| Agent activity | Supabase agent_activity table | Real-time |
| Reports | Supabase / generated PDFs | Monthly |
| Client profile | Supabase clients table | On update |

---

## Acceptance Criteria

### Must Have (v2 Launch)
- [ ] All 10 pages built and functional
- [ ] Framer-motion animations on all page transitions
- [ ] Animated metric cards with counters and sparklines
- [ ] Skeleton loading states on every data component
- [ ] Dark mode with smooth toggle
- [ ] Agent team page with avatars and activity
- [ ] Command palette (⌘K)
- [ ] Axiom logging on all portal events
- [ ] Sentry error tracking
- [ ] Mobile responsive (all pages)
- [ ] Ice cream brand identity throughout
- [ ] Google OAuth working in production
- [ ] Core Web Vitals passing (green scores)

### Nice to Have (post-launch)
- [ ] Ice cream loading animation (custom SVG)
- [ ] Drag-to-reschedule on content calendar
- [ ] "Ask Cooper" chat interface
- [ ] Confetti/sprinkles celebration animations
- [ ] Real-time notifications via Supabase real-time
- [ ] Multi-user team access per client
- [ ] Report PDF generation

---

## Timeline

| Phase | What | Duration |
|-------|------|----------|
| 1 | Design system evolution + dark mode + base layout | 1-2 sessions |
| 2 | Dashboard + metric cards + animations | 1-2 sessions |
| 3 | SEO, Ads, Content pages | 1-2 sessions |
| 4 | Agent team page + activity feed | 1 session |
| 5 | Reports + Settings + Command palette | 1 session |
| 6 | Polish, QA, performance optimization | 1 session |
| 7 | Scout SEO review + Mark security review + deploy | 1 session |

---

## Build Rules

1. Follow ENGINEERING-STANDARDS.md for all code
2. TypeScript strict mode, functional patterns
3. Framer-motion for all animations (no CSS keyframes for interactive elements)
4. Every component gets a loading/skeleton state
5. Every page gets dark mode support
6. Every API call goes through the logger
7. Server components by default, client components only when needed
8. Mobile-first responsive design
9. Accessibility (WCAG 2.1 AA) on every component
10. Cooper reviews every PR before merge
