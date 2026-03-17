# PRD: Client Portal — Mobile-First Responsive Rebuild

## ⚠️ MANDATORY: Read These Files First

Before writing ANY code, read these guideline files in full:

1. `~/.openclaw/workspace/memory/resources/reference/bob-ui-guidelines.md` — UI components, shadcn usage, brand theme, component patterns
2. `~/.openclaw/workspace/knowledge/web-dev/design/responsive-design-patterns.md` — Mobile-first methodology, breakpoints, touch targets, responsive patterns
3. `~/.openclaw/workspace/knowledge/web-dev/design/accessibility-deep-dive.md` — WCAG 2.1 AA, keyboard nav, ARIA, screen readers
4. `~/.openclaw/workspace/knowledge/web-dev/performance/frontend-performance-guide.md` — Performance budgets, bundle analysis, lazy loading

Follow every rule in those files. No exceptions.

## Overview

The current portal v2 was built fast and has mobile layout issues — sidebar doesn't work well on small screens, cards overflow, charts aren't responsive, touch targets are too small, and text gets cut off. Jake flagged this last night and said to rebuild mobile-first with the knowledge base we now have.

This is NOT a full feature rebuild. The features stay the same. This is a responsive/accessibility/performance pass on every component. Mobile-first means: write styles for mobile with no prefix, then add breakpoints going up.

## Working Directory

`~/.openclaw/workspace/builds/client-portal/`

This is an existing Next.js project. Do NOT scaffold a new project. Work within the existing codebase.

## What To Fix

### 1. Sidebar & Navigation (CRITICAL)
**File:** `src/components/layout/Sidebar.tsx`

Current issues:
- Mobile hamburger menu is tiny and hard to tap
- Bottom nav items are cramped on small phones (320px)
- Drawer animation can feel janky on lower-end devices

Fix:
- Ensure all touch targets are minimum 44x44px
- Bottom nav: max 5 items, icons + labels, proper spacing for 320px minimum
- Hamburger button: 44x44px minimum, clear visual affordance
- Drawer: use `will-change: transform` for smooth animation
- Test layout at 320px, 375px, 414px widths
- Add `safe-area-inset-bottom` padding for iOS notch devices (already partially there, verify)

### 2. Dashboard Page
**File:** `src/app/(portal)/dashboard/page.tsx` + dashboard components

Current issues:
- Metric cards stack weirdly between breakpoints
- Charts don't resize properly on mobile
- Content calendar is unreadable on small screens

Fix:
- Metric cards: 1 column on mobile, 2 on sm, 4 on xl (already close, verify grid gaps)
- Charts: set explicit `aspect-ratio` for mobile (e.g., `aspect-[4/3]` on mobile, `aspect-[16/9]` on desktop)
- Charts: use `ResponsiveContainer` from recharts with 100% width
- Content calendar: switch to list view on mobile, calendar grid on md+
- Add horizontal scroll with snap for metric cards on mobile as an alternative
- Ensure all text is readable without zooming (minimum 14px body, 12px captions)

### 3. All Page Layouts
**Files:** All files in `src/app/(portal)/*/page.tsx`

Apply these patterns to every page:
- Container padding: `px-4` on mobile, `px-6` on md, `px-8` on lg
- Section spacing: `space-y-4` on mobile, `space-y-6` on md+
- Page titles: `text-xl` on mobile, `text-2xl` on md+
- Cards: full width on mobile (no side margins cutting content)
- Tables: horizontal scroll wrapper on mobile (`overflow-x-auto`)
- Any grid layout: 1 column on mobile, scale up at breakpoints

### 4. TopBar
**File:** `src/components/layout/TopBar.tsx`

Fix:
- Hide business name on mobile (show only on md+)
- Search/command palette trigger: 44x44px touch target
- Dark mode toggle: 44x44px touch target
- Notification bell: 44x44px touch target
- Ensure no horizontal overflow on 320px screens

### 5. Card Components
**Files:** All card components in `src/components/dashboard/` and `src/components/ui/card.tsx`

Fix:
- Cards should have `rounded-lg` on mobile (not `rounded-xl` — saves visual space)
- Card padding: `p-4` on mobile, `p-6` on md+
- Card headers: stack title and action button vertically on mobile if they don't fit
- Metric values: `text-2xl` on mobile, `text-3xl` on md+
- Trend indicators: keep inline but allow wrapping

### 6. Typography & Spacing
Global responsive typography rules:
- Body text: `text-sm` (14px) minimum everywhere
- Captions/labels: `text-xs` (12px) minimum
- Page headings: `text-xl sm:text-2xl`
- Section headings: `text-lg sm:text-xl`
- Never use `text-[9px]` or `text-[10px]` on user-facing content (agent labels in sidebar are an exception IF they have tooltips)

### 7. Forms (Settings, Onboarding)
**Files:** `src/app/(portal)/settings/`, `src/app/(onboarding)/`

Fix:
- Form inputs: full width on mobile, `max-w-md` on desktop
- Labels above inputs (not inline) on mobile
- Submit buttons: full width on mobile, auto width on md+
- Error messages: visible without scrolling
- Touch-friendly select dropdowns and checkboxes

### 8. Accessibility Quick Wins
Apply across all components:
- All interactive elements have `focus-visible` ring styles
- All images have `alt` text
- All icon-only buttons have `sr-only` text or `aria-label`
- Proper heading hierarchy (h1 → h2 → h3, no skipping)
- Color contrast: ensure all text meets 4.5:1 ratio against backgrounds
- `prefers-reduced-motion` — wrap framer-motion animations in a check

### 9. Performance
- Lazy load below-fold components with `dynamic()` imports
- Charts should be dynamically imported (they're heavy)
- Images: use `next/image` with proper `sizes` attribute
- Add `loading="lazy"` to any non-critical images

## What NOT To Change
- Do NOT change the color scheme or brand theme
- Do NOT change the navigation structure (keep same pages/routes)
- Do NOT change any backend logic, API routes, or server actions
- Do NOT change the auth flow
- Do NOT add new features — this is a responsive/polish pass only
- Do NOT remove existing functionality
- Do NOT change the framer-motion animations — just add `prefers-reduced-motion` fallbacks

## Testing Checklist
After making changes, verify at these widths:
- 320px (iPhone SE / small Android)
- 375px (iPhone 12/13/14)
- 414px (iPhone Plus / larger Android)
- 768px (iPad portrait)
- 1024px (iPad landscape / small laptop)
- 1440px (desktop)

For each width verify:
- [ ] No horizontal overflow (no horizontal scrollbar on the page)
- [ ] All text is readable without zooming
- [ ] All buttons/links are tappable (44px minimum)
- [ ] Cards don't overflow their containers
- [ ] Charts are visible and readable
- [ ] Navigation works properly
- [ ] No overlapping elements

## Acceptance Criteria
- [ ] Every page renders correctly from 320px to 1440px+ with no horizontal overflow
- [ ] All touch targets are minimum 44x44px
- [ ] Mobile bottom nav has proper spacing and safe area padding
- [ ] Dashboard metric cards stack properly at every breakpoint
- [ ] Charts resize gracefully (no cut-off, no overflow)
- [ ] Tables have horizontal scroll on mobile
- [ ] Forms are usable on mobile (full width inputs, properly spaced)
- [ ] Typography scales appropriately across breakpoints
- [ ] Focus-visible styles on all interactive elements
- [ ] prefers-reduced-motion respected for animations
- [ ] No regressions on desktop layout
- [ ] Build passes with zero TypeScript errors

## Notes
- Work through the files systematically — layout first (Sidebar, TopBar, PortalShell), then page by page
- Test each change at 320px width before moving to the next component
- Use Tailwind responsive prefixes only (no custom media queries)
- When in doubt, refer to the responsive design patterns knowledge file
