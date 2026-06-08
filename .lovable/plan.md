## Goal
Add a **Try Demo** button to the login screen so visitors can explore EdgeTrader without signing up. In demo mode, no trades or settings are saved to the backend, but mode switching, Chart Analyzer, EdgeCoach, and walkthroughs all work normally.

## UX
- On `/login`, add a secondary **Try Demo** button under the Sign in form (plus a small "no signup required, data is not saved" caption).
- Entering demo navigates to `/` and shows a slim banner at the top of the app: "Demo Mode — nothing is saved. [Exit demo]". Exit clears the flag and returns to `/login`.
- Header balance, dashboard widgets, and nav all behave as normal but use seeded sample data.

## Demo session model
- New module `src/lib/demoMode.ts`:
  - `isDemoMode()`, `enterDemoMode()`, `exitDemoMode()`, `useDemoMode()` hook (localStorage key `edgetrader.demo.v1` + custom event, same pattern as `tradingMode.ts`).
  - Seeded `DEMO_USER` object (fake uuid + email) and `DEMO_SETTINGS` (starting balance, both futures + options balances, onboarding_completed=true, default risk %, etc.).
  - Small in-memory store for demo trades/journals so users can "log" a trade and see it appear during the session — wiped on refresh or exit.

## Auth + routing
- `AuthProvider`: if `isDemoMode()` is true and no real Supabase session exists, expose the `DEMO_USER` as `user` and short-circuit `signOut` to call `exitDemoMode()`. Real sessions always win.
- `ProtectedRoute`: treat demo user as authenticated and skip the onboarding redirect (demo settings already mark it complete).
- `useUserSettings`: when in demo mode, return `DEMO_SETTINGS` and make `refresh`/updates no-ops (toast: "Not saved in demo mode").

## Data layer guards
Make writes no-ops and reads return seeded/in-memory data when `isDemoMode()`:
- `src/lib/tradeService.ts` — `getTrades`/`getTradeStats` read from the demo store seeded with ~15 sample futures trades and ~5 options positions; `createTrade`/`updateTrade`/`deleteTrade` mutate the in-memory store only and return success.
- `src/lib/userSettingsService.ts` — updates no-op with a toast.
- `src/lib/journalService.ts`, `src/lib/gamePlanService.ts`, `src/lib/priceAlerts.ts`, `src/lib/setupWatchlistStore.ts`, `src/lib/savedArticlesDb.ts`, `src/lib/backup.ts`, `src/lib/challengeArchive.ts` — guard writes; reads return empty arrays or in-memory.
- `src/lib/imageUpload.ts` — return a data URL instead of uploading.

Server functions (Chart Analyzer, EdgeCoach, Setup Advisor, etc.) keep working because they don't require Supabase rows — they accept inputs from the client. They will be called with the demo user id, but since we never persist their output, RLS isn't hit.

## UI touches
- `src/components/AppHeader.tsx` — when in demo mode, render a small "DEMO" pill next to the mode badge.
- New `src/components/DemoBanner.tsx` mounted in `__root.tsx` (above the outlet) showing the dismiss/exit control. Hidden on `/login`, `/signup`, `/onboarding`.
- Walkthroughs already work off DOM selectors — no changes needed.

## Files
- New: `src/lib/demoMode.ts`, `src/lib/demoSeedData.ts`, `src/components/DemoBanner.tsx`.
- Edited: `src/routes/login.tsx` (add button), `src/components/AuthProvider.tsx`, `src/components/ProtectedRoute.tsx`, `src/hooks/useUserSettings.ts`, `src/components/AppHeader.tsx`, `src/routes/__root.tsx`, plus the data-layer files listed above (single guard at the top of each write function).

## Out of scope
- Per-tab isolation (demo state is per-browser like the real session).
- Persisting demo trades across refresh (intentional — keeps the "nothing saved" promise).
