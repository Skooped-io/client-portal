# PRD: Client Portal — UX Fixes (Walkthrough, Services, Address, Nav Speed)

## Overview
Three UX bugs and one performance issue need to be fixed in the Skooped client portal (Next.js app). These were found during Jake's end-to-end testing of the signup → onboarding → dashboard flow.

## Project Context
- **Repo:** Skooped-io/client-portal (Next.js 14, App Router, Supabase, Tailwind, shadcn/ui)
- **Working directory:** ~/.openclaw/workspace/builds/client-portal/
- **Design system:** strawberry accent color, rounded-xl, font-dm-sans, font-nunito for headings
- **Key principle:** Changes we already made to `useDashboardTour.ts`, `DashboardTourWrapper.tsx`, and the new `MobileWelcomeCard.tsx` are ALREADY IN PLACE. Do NOT revert or overwrite those files. This PRD covers the REMAINING fixes only.

---

## Fix 1: Google Places Autocomplete for Address Fields

**File:** `src/components/onboarding/location-step.tsx`

**Current behavior:** Street Address, City, State, ZIP are all plain text inputs. Users type everything manually.

**Required behavior:** Replace the Street Address input with a Google Places Autocomplete field. When the user types, a dropdown of real addresses appears. On selection, auto-fill City, State, and ZIP from the selected place.

**Implementation:**
1. Install `@react-google-maps/api` or use the Google Places Autocomplete API directly via a `useEffect` + `google.maps.places.Autocomplete` on the street address input
2. The Google Maps API key should be loaded from environment variable `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
3. Add a `<Script>` tag or load the Google Maps JS API with the `places` library
4. On place selection, parse the `address_components` from the Place result:
   - `street_number` + `route` → street address
   - `locality` → city input
   - `administrative_area_level_1` (short_name) → state input
   - `postal_code` → zip input
5. Keep the manual inputs editable — autocomplete fills them but user can still override
6. If the Google API key is missing or the API fails to load, fall back gracefully to the current plain text inputs (no crash)
7. Style the autocomplete dropdown to match the existing design (the `.pac-container` CSS can be overridden)
8. Create a reusable hook or component: `src/hooks/useGooglePlacesAutocomplete.ts` or `src/components/ui/AddressAutocomplete.tsx`

**Acceptance criteria:**
- [ ] Typing in street address shows Google Places suggestions
- [ ] Selecting a suggestion auto-fills city, state, zip
- [ ] User can still manually edit any field after autofill
- [ ] Works without Google API key (degrades to plain inputs)
- [ ] No TypeScript errors

---

## Fix 2: Multiple Custom Services Can Be Added

**File:** `src/components/onboarding/services-step.tsx`

**Current behavior:** The custom service input + "+" button only allows adding 1 custom service. After adding one, subsequent attempts don't work properly.

**Root cause:** The `addCustomService` function and state look correct in code — it pushes to the array and clears input. The likely issue is that the custom services are only displayed when they're NOT in the `industryServices` list (see the filter: `services.filter((s) => !industryServices.includes(s))`). But if the user clicks a preset pill AND adds a custom one, the rendering logic might not be showing all customs, or the input isn't properly re-focusing after clear.

**Required fix:**
1. Verify the `addCustomService` function works for multiple additions — add console.log temporarily if needed
2. Make sure `setCustomInput('')` actually clears the input (it's a controlled component so it should)
3. After adding a custom service, auto-focus the input field so the user can immediately type another one
4. Make sure the custom services badge section renders ALL non-industry services, not just the first one
5. Test: add 3+ custom services in a row — all should appear as badges below the input
6. Pressing Enter in the input should also add the service (already implemented via `onCustomKeyDown`, verify it works for multiple)

**Acceptance criteria:**
- [ ] Can add 1 custom service via "+" button — appears as badge
- [ ] Can add 2nd, 3rd, 4th+ custom services — all appear as badges
- [ ] Enter key adds custom service (same as clicking "+")
- [ ] Input clears and re-focuses after each add
- [ ] Each custom badge has working X remove button
- [ ] No duplicates allowed (already handled in code, verify)

---

## Fix 3: Slow Tab Navigation in Dashboard

**Files:** `src/app/(portal)/layout.tsx` and all page files under `src/app/(portal)/*/page.tsx`

**Current behavior:** Clicking a sidebar tab (Analytics, SEO, Content, etc.) takes several seconds to navigate. The page eventually loads but there's no visual feedback during the wait.

**Root cause:** Every page under `(portal)` is a server component that does fresh Supabase queries on each navigation. The `(portal)/layout.tsx` also re-runs auth checks on every route change. There are NO `loading.tsx` files providing instant loading states.

**Required fixes:**

### 3a: Add loading.tsx files for instant feedback
Create `loading.tsx` in each route segment that shows a skeleton/spinner immediately:
- `src/app/(portal)/loading.tsx` (catch-all for any portal page)
- This should show a simple skeleton that matches the general page layout

The loading.tsx content should be minimal:
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}
```

### 3b: Add revalidate to pages that don't have it
Several page files already have `export const revalidate = 300` (analytics, seo). Make sure ALL portal pages that fetch data have this set so Next.js caches the server-rendered output for 5 minutes instead of re-fetching on every navigation.

Check and add `export const revalidate = 300` to any page under `(portal)` that fetches from Supabase but doesn't already have it.

### 3c: Consider prefetch on sidebar links
In the Sidebar component, make sure all `<Link>` components have the default Next.js prefetch behavior (enabled by default in Next.js App Router). Verify the sidebar uses `next/link` and not raw `<a>` tags or `router.push()`.

**Acceptance criteria:**
- [ ] Clicking any sidebar tab shows a loading skeleton instantly (< 100ms)
- [ ] Page data loads within 1-3 seconds after skeleton appears
- [ ] Repeated visits to the same page within 5 minutes are near-instant (cached)
- [ ] No layout shift when content replaces skeleton

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/components/onboarding/location-step.tsx` | Add Google Places Autocomplete |
| `src/hooks/useGooglePlacesAutocomplete.ts` | NEW — reusable places autocomplete hook |
| `src/components/onboarding/services-step.tsx` | Fix multi-add for custom services + auto-focus |
| `src/app/(portal)/loading.tsx` | NEW — skeleton loading state |
| `src/app/(portal)/*/page.tsx` | Add revalidate where missing |
| `src/components/layout/Sidebar.tsx` | Verify using next/link with prefetch |

## Environment Variables Needed
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — Google Maps JavaScript API key with Places library enabled

## Notes
- Do NOT touch `useDashboardTour.ts`, `DashboardTourWrapper.tsx`, or `MobileWelcomeCard.tsx` — those fixes are already done
- Keep all styling consistent with existing design system
- Test on mobile viewport (< 768px) as well as desktop
