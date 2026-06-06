## Walkthroughs in Settings

Add a "Walkthroughs" section in Settings that lists a catalog of guided tours. Each tour spotlights real UI elements with tooltip bubbles, navigating between screens as needed. No persistence — always replayable.

### Catalog (v1)
1. **App overview** — Dashboard hero, stats, bottom nav (Dashboard → Analyzer → Setups → Trade Log → News → Settings).
2. **Log a trade** — Opens the New Trade sheet, highlights instrument/direction/entry/stop/target/result fields, then Save.
3. **Chart Analyzer** — Upload area → analysis result panel → "Execute trade from analysis" CTA.
4. **All other features** — One combined tour covering Setup Advisor (ORB builder), News + high-impact tagging, Weekly Debrief generation, and Game Plan compliance.

### Implementation

**New files**
- `src/lib/walkthroughs/types.ts` — `Step { selector, title, body, route?, placement? }` and `Walkthrough { id, title, description, icon, steps }`.
- `src/lib/walkthroughs/catalog.ts` — the 4 tours above with stable `data-tour="..."` selectors.
- `src/components/walkthrough/WalkthroughProvider.tsx` — context + `useWalkthrough()` hook. Holds active tour + step index, exposes `start(id)`, `next()`, `prev()`, `stop()`. When a step has `route`, calls `navigate({ to })` then waits for the selector via a short `MutationObserver` poll (max ~2s).
- `src/components/walkthrough/WalkthroughOverlay.tsx` — fixed full-screen dimmed overlay with a cut-out "spotlight" around the target element's `getBoundingClientRect()`, plus a floating tooltip card (title, body, "Step X of N", Back / Next / Skip). Recomputes on scroll/resize. Auto-scrolls the target into view. Mounted once near the app root.
- `src/components/walkthrough/WalkthroughsSection.tsx` — catalog UI for Settings: list of cards (icon + title + description + "Start" button).

**Edits**
- `src/routes/__root.tsx` — wrap children in `<WalkthroughProvider>` and render `<WalkthroughOverlay />` once.
- `src/routes/settings.tsx` — add a new "Walkthroughs" section that renders `<WalkthroughsSection />`.
- Sprinkle `data-tour="..."` attributes on the elements each tour references (bottom-nav items, dashboard stat card, New Trade FAB, chart upload zone, analyzer result, setup builder tabs, news list item, debrief generate button, settings entry). Pure attribute additions, no logic changes.

### UX details
- Tooltip auto-flips above/below the target based on viewport space; falls back to a centered modal if the selector isn't found within ~2s (with a "we couldn't find that element — continue?" message + Next/Skip).
- ESC and a "Skip tour" button both call `stop()`.
- Clicking the dimmed area does nothing (prevents accidental dismissal); a top-right ✕ closes.
- Mobile-aware: tooltip width clamps to `min(360px, calc(100vw - 32px))`; spotlight padding ~8px.
- No database changes, no new dependencies — pure React + Tailwind using existing design tokens.

### Out of scope
- Tracking which tours have been completed.
- First-run auto-launch on signup (can be added later by calling `start("app-overview")` from onboarding completion).
