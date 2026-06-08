## Goal
Split the walkthrough catalog into mode-aware sets so Futures and Options each get their own unique tours, and rebuild the "App Overview" tour into a detailed cross-mode walkthrough that programmatically switches modes mid-tour so users see both dashboards.

## Architecture changes

### Step capability: programmatic mode switch
`WalkthroughStep` (`src/lib/walkthroughs/types.ts`) gets one new optional field:
- `setMode?: "futures" | "options"` — when present, the provider calls `setTradingMode(setMode)` before resolving the route/selector.

`WalkthroughProvider.resolveStep` runs `setMode` first (if defined), then handles `route` and `selector` as today. This lets a single walkthrough hop between the futures dashboard and the options dashboard without user interaction.

### Mode-scoped catalog
`src/lib/walkthroughs/catalog.ts` is restructured:
- `WALKTHROUGHS_SHARED` — tours that exist in both modes (App Overview, Chart Analyzer, EdgeCoach).
- `WALKTHROUGHS_FUTURES` — futures-only (Log a futures trade, Trade Log + setups, Setup Advisor / ORB & VWAP, Risk-of-Ruin & scaling).
- `WALKTHROUGHS_OPTIONS` — options-only (Open a position, Options Playbook + AI scan, IVR & Greeks, 0DTE & Earnings, Credit-spread manager).
- `getWalkthroughsForMode(mode)` returns `[...shared, ...modeSpecific]`.
- `getWalkthrough(id)` still works by id across all sets.

### Mode-aware Walkthroughs panel
`WalkthroughsSection` reads `useTradingMode()` and renders `getWalkthroughsForMode(mode)`. The panel header shows the active mode label ("Walkthroughs · Futures" / "· Options") so it's obvious the list changes when you switch.

## Tour content

### App Overview (shared, redesigned — ~12 steps, very detailed)
1. Welcome + the mode pill in the header (selector: app-name button) — explains EdgeTrader has two distinct modes.
2. Tap the header to switch modes — selector targets the header button; body teaches the gesture.
3. `setMode: "futures"` → `/` Futures dashboard balance card.
4. Futures stats strip (`dashboard-stats`).
5. Futures Quick Log FAB (`new-trade-fab`) — "log a contract in seconds".
6. `setMode: "options"` → `/` Options dashboard (Greeks/IV widgets).
7. Options key panels (uses an `options-dashboard-summary` data-tour we'll add on the OptionsDashboard root card).
8. EdgeCoach FAB (`edgecoach-fab`) — adapts persona per mode.
9. Bottom-nav `nav-/trade-log` — explains it splits per mode.
10. Bottom-nav `nav-/playbook` — explains per-mode playbook builders.
11. Settings nav (`nav-/settings`) — replay walkthroughs, manage challenge.
12. Reminder: tap the brand pill anytime to swap modes; finish.

### Futures-only tours
- **Log a futures trade** — `new-trade-fab`, instrument, long/short, entry/stop/target, outcome, then `/trade-log` review.
- **Trade Log & Setup edge** — filter tabs, Edge Health, Setup Performance Breakdown, Benchmarks, Exit Analytics.
- **Setup Advisor (ORB / VWAP)** — `/setup-advisor` ORB builder then VWAP reclaim builder.
- **Risk & scaling** — `/risk-of-ruin` and `/scaling-plan` highlights.

### Options-only tours
- **Open your first position** — `OptionsTradeSheet` trigger (add `data-tour="new-options-fab"` on the CTA), strategy picker, legs, IVR snapshot, save.
- **Options Playbook + AI scan** — `/playbook` options tab, AI discovery button, save to entries.
- **IVR, Greeks & risk** — `/options-risk` page or IVR card on dashboard, daily theta, portfolio Greeks.
- **0DTE, Earnings & spreads** — Zero-DTE module, Earnings calendar, Credit-spread manager on `/trade-log` options view.

### Shared (besides overview)
- **Chart Analyzer** — unchanged steps.
- **EdgeCoach AI** — new short tour highlighting the FAB and that it reads the active mode's data.

## DOM anchors to add
Small additions in existing components so steps can target real elements (no logic change):
- `OptionsDashboard` root section → `data-tour="options-dashboard-summary"`.
- Options dashboard Greeks card → `data-tour="options-greeks"`.
- Options "new position" CTA → `data-tour="new-options-fab"`.
- `/playbook` options tab AI-scan button → `data-tour="options-ai-scan"`.
- `/options-risk` summary card → `data-tour="options-risk-summary"`.
- ZeroDteModule root → `data-tour="zero-dte"`.
- CreditSpreadManager root → `data-tour="credit-spreads"`.
- EarningsCalendarManager root → `data-tour="earnings-calendar"`.
- Setup Advisor ORB/VWAP cards → `data-tour="orb-builder"` / `data-tour="vwap-builder"`.

## Files
- Edited: `src/lib/walkthroughs/types.ts` (add `setMode`), `src/lib/walkthroughs/catalog.ts` (restructured + new tours), `src/components/walkthrough/WalkthroughProvider.tsx` (apply `setMode` before resolve), `src/components/walkthrough/WalkthroughsSection.tsx` (mode-aware list + header label), plus the data-tour anchor additions listed above.
- No new files.

## Out of scope
- Visual redesign of the overlay/tooltip.
- Persistence of "completed" state per tour.
- Translating tour copy.
