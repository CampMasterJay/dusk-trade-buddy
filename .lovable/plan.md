## Goal

Clicking the "EDGE TRADER" logo flips the entire app between two persistent modes — **Futures** and **Options** — each with its own balance, challenge target, and challenge history. Mode is remembered per device in `localStorage`.

## UX

- `AppHeader` logo becomes a button. Click cycles Futures → Options → Futures.
- Logo color/badge reflects active mode:
  - Futures: current green `EDGE TRADER` with a small `· FUTURES` suffix.
  - Options: amber tint with `· OPTIONS` suffix.
- Brief toast on switch: "Switched to Options mode" / "Switched to Futures mode".
- Balance pill in the header reads the active mode's balance.

## Scope of the mode switch

The active mode filters/swaps these surfaces:
1. **Dashboard (`/`)** — shows the matching summary card (futures vs options) as primary, and corresponding "New Trade" button.
2. **Trade Log** — default market filter follows mode (Futures shows futures trades, Options shows options trades). User can still override via existing market filter chips.
3. **Playbook** — default tab follows mode (Futures Playbook vs Options Playbook).
4. **Behavioral Analytics** — default sub-tab follows mode (Futures vs Options).
5. **Scaling Plan, Challenges, Weekly Debrief, Weekly Report** — read the active mode's balance + challenge target, and list only that mode's archived challenges.
6. **Chart Analyzer** — default analysis mode follows app mode.
7. **Settings** — shows both modes' fields, but highlights the active one.

Routes unique to one market (e.g. `/options-risk`, `/earnings`) stay reachable from both modes; they just become more prominent in Options mode.

## Data model

Mode itself is **local-only** (`localStorage`), but the per-mode balances and challenge archives are stored in DB so they survive across devices for that mode.

### Migration: add per-mode columns
- `user_settings`: add
  - `options_starting_balance numeric not null default 100`
  - `options_current_balance numeric not null default 100`
  - `options_challenge_target numeric not null default 1000`
- `challenges`: add
  - `mode text not null default 'futures'` with check `mode in ('futures','options')`
  - index `(user_id, mode, ended_at desc)`

Existing rows default to `futures` so nothing breaks.

## Implementation

### New: `src/lib/tradingMode.ts`
- `TradingMode = 'futures' | 'options'`
- `getTradingMode()` / `setTradingMode(mode)` backed by `localStorage` key `et.tradingMode` (default `'futures'`).
- `useTradingMode()` React hook returning `[mode, setMode]` with a window `storage` + custom event listener so all components react instantly to a switch.

### `src/components/AppHeader.tsx`
- Accept `mode`/`onToggleMode` or read from the hook directly.
- Wrap the brand text in a `<button>` with `aria-label="Switch trading mode"`.
- Render suffix + accent based on mode. Balance prop becomes mode-aware (route passes the matching balance).

### Routes/components that read balance
- `useUserSettings` consumers (`/`, `scaling-plan`, `weekly-*`, `risk-of-ruin`, `OptionsSummaryCard`, etc.) call a new helper `getActiveBalance(settings, mode)` returning the right pair of `{ starting, current, target }`.
- New Trade Sheets continue to write to the matching balance column on close (futures sheet → `current_balance`, options sheet → `options_current_balance`).

### Dashboard (`src/routes/index.tsx`)
- Reorders sections by active mode (active mode card on top).
- "Quick action" CTA opens the matching trade sheet.

### Trade Log (`src/routes/trade-log.tsx`)
- Initial `MarketKey` filter derives from mode on mount (still user-overridable).

### Playbook + Behavior Analytics
- Initial tab state seeded from mode.

### Challenges
- `challengeArchive.ts`: write `mode` on insert (from active mode); read queries filter by `mode = activeMode`.
- Challenge History section filters by active mode.
- Reset/new challenge actions operate on the active mode's balance columns.

### Settings
- Add an "Options Challenge" subsection mirroring the existing Futures fields, editing the new columns.

## QA checklist

- Toggle logo on `/`, `/trade-log`, `/playbook`, `/scaling-plan`, `/weekly-debrief` — each view updates without reload.
- Reload page → mode persists.
- Logging a futures trade in Options mode is still possible via market filter, but the Dashboard balance/challenge that updates is the futures one (writes follow the trade's market, not the UI mode).
- Archived challenges from prior to migration appear under Futures only.

## Out of scope

- Cross-device sync of the mode (explicitly chose localStorage).
- Per-mode separate Settings/preferences beyond balances + challenge target.
- A third "Both" mode.
