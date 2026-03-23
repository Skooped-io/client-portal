# PRD: First-Login Demo Tour + Bot Activity Logs

## Overview

Build two features that make the client portal feel alive from the moment someone logs in:

1. **First-Login Demo Tour** — guided walkthrough that introduces new clients to the portal. Highlights key sections, explains what each page does, and makes them feel like they're in good hands.
2. **Bot Activity Logs** — a visible feed on the dashboard showing clients what Skooped's agents are doing for their business in real time. This is how clients SEE the value.

## Context

- **Location:** ~/.openclaw/workspace/builds/client-portal/
- **Stack:** Next.js 14, Tailwind CSS, shadcn/ui, framer-motion, recharts, Supabase
- **Design system:** Ice cream palette (strawberry, vanilla, gold, mint, blueberry)
- **Existing components:** Dashboard page with charts, MetricCards, TrafficChart, ContentCalendar, AIInsightsPanel, AgentActivityFeed
- **Auth:** Supabase auth already wired

### Brand Guidelines
Read these before coding:
- `~/.openclaw/workspace/memory/resources/reference/bob-ui-guidelines.md`
- `~/.openclaw/workspace/brand/DESIGN-SYSTEM.md`

---

## Feature 1: First-Login Demo Tour

### Requirements

- [ ] Detect first login via Supabase user metadata (check `user_metadata.tour_completed`)
- [ ] On first login, trigger an animated tour overlay
- [ ] Tour should highlight 5-6 key areas with spotlight effect:
  1. **Dashboard** — "this is your command center. everything about your business at a glance"
  2. **SEO page** — "we monitor your google rankings and search performance here"
  3. **Analytics** — "real traffic data from your website, updated daily"
  4. **Ads** — "if youre running google ads, this is where you track spend and conversions"
  5. **Social** — "your instagram and facebook content calendar and engagement"
  6. **Messages** — "talk directly to your skooped team right here"
- [ ] Each step has: spotlight on the sidebar nav item + a tooltip card with title, description, and step counter
- [ ] Smooth transitions between steps (framer-motion)
- [ ] "Skip tour" button always visible
- [ ] "Next" and "Back" navigation
- [ ] On completion or skip: update `user_metadata.tour_completed = true` via Supabase
- [ ] Tour never shows again after completion/skip
- [ ] Final step: welcome message — "youre all set! your skooped team is already working on your business. check back anytime to see progress"
- [ ] Mobile responsive — tour works on phone screens too

### Technical Approach

- Build as a standalone component: `src/components/onboarding/DemoTour.tsx`
- Use a portal/overlay pattern with framer-motion for animations
- Spotlight effect: dark overlay with a transparent cutout around the highlighted element
- Tooltip card: glass-morphism style matching the design system
- Step data as a config array (easy to add/remove steps later)
- Wrap the portal layout with a `<DemoTourProvider>` that checks tour status on mount

### Files to Create/Modify

- `src/components/onboarding/DemoTour.tsx` (NEW — main tour component)
- `src/components/onboarding/DemoTourProvider.tsx` (NEW — context provider)
- `src/components/onboarding/tour-steps.ts` (NEW — step configuration)
- `src/app/(portal)/layout.tsx` (MODIFY — wrap with DemoTourProvider)

---

## Feature 2: Bot Activity Logs (Client-Facing)

### Requirements

- [ ] Create a visible activity feed component showing what Skooped agents did for this client
- [ ] Activity types:
  - 🔍 SEO scan completed
  - 📊 Analytics report generated
  - 📱 Social post scheduled
  - 🌐 Website health check passed
  - ⭐ New Google review detected
  - 📈 Keyword ranking improved
  - 🔧 Website update deployed
  - 💬 Message from your Skooped team
- [ ] Each activity shows: icon, description, timestamp (relative — "2 hours ago"), agent name
- [ ] Activities should feel real — use demo data for now but structure it so we can wire to Supabase later
- [ ] Activity feed on the dashboard (already have AgentActivityFeed.tsx — enhance it)
- [ ] Add a dedicated `/activity` page for full history with filtering
- [ ] Smooth entry animations (stagger children with framer-motion)
- [ ] "Mark all as read" and unread dot indicators
- [ ] Max 50 items on dashboard, full list on /activity page

### Technical Approach

- Enhance existing `src/components/dashboard/AgentActivityFeed.tsx`
- Create demo data generator: `src/lib/activity-demo-data.ts`
- Create new page: `src/app/(portal)/activity/page.tsx`
- Add "Activity" to sidebar navigation
- Structure activities with a typed interface ready for Supabase table later:
  ```typescript
  interface BotActivity {
    id: string;
    org_id: string;
    agent: 'scout' | 'bob' | 'sierra' | 'riley' | 'cooper';
    action_type: string;
    title: string;
    description: string;
    metadata?: Record<string, unknown>;
    read: boolean;
    created_at: string;
  }
  ```

### Files to Create/Modify

- `src/components/dashboard/AgentActivityFeed.tsx` (MODIFY — enhance with new design)
- `src/lib/activity-demo-data.ts` (NEW — realistic demo data generator)
- `src/app/(portal)/activity/page.tsx` (NEW — full activity history page)
- `src/app/(portal)/layout.tsx` (MODIFY — add Activity to nav if not present)

---

## Acceptance Criteria

- [ ] First login triggers tour overlay with spotlight + tooltip cards
- [ ] Tour can be navigated (next/back) and skipped
- [ ] Tour completion persists — never shows again
- [ ] Bot activity feed shows on dashboard with realistic demo activities
- [ ] Activity page exists with full history and filtering
- [ ] All components use ice cream design system (dark + light mode)
- [ ] All animations respect prefers-reduced-motion
- [ ] Mobile responsive
- [ ] Build passes with no TypeScript errors
- [ ] No console errors

## What NOT to Do

- Do NOT install tour libraries (react-joyride etc.) — build it custom with framer-motion
- Do NOT create actual Supabase tables yet — use demo data, structure for future
- Do NOT modify auth flow or API routes
- Do NOT touch the charting components we just built
- Do NOT change design tokens or tailwind config

## Notes

- The AgentActivityFeed.tsx already exists but may be basic — enhance dont replace
- The DashboardTourWrapper.tsx also exists — check if it can be extended or if a fresh approach is better
- Cooper will review all output before deploying
