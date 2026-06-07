
# Separate Futures & Options into Two Distinct Experiences

Right now both modes share the same routes, terminology, colors, components, and AI prompts — the toggle just swaps a balance. This plan makes each mode feel like its own product, sharing only authentication, the app shell, and the user's settings record.

## 1. Mode-aware shell & theming

- Promote `useTradingMode()` to a top-level context provider mounted in `__root.tsx` so every component reads mode without prop drilling and re-renders together on toggle.
- Add a `data-mode="futures|options"` attribute to `<html>` driven by the provider.
- In `src/styles.css`, define two token blocks scoped to that attribute:
  - **Futures** — green accent system (existing `--trade-green` lineage), sharper/tactical feel, mono-leaning data type, square corners.
  - **Options** — amber/violet accent system, softer rounded surfaces, slightly more editorial type weight.
  - Both override `--primary`, `--accent`, `--ring`, `--chart-1..5`, and a new `--mode-accent` / `--mode-accent-soft` pair.
- AppHeader logo badge already shows the active mode — extend it with:
  - Mode-tinted glow ring.
  - Subtle dot indicator if the *other* mode has open positions or 0DTE alerts (single query on toggle hover/mount).

## 2. Terminology dictionary

Create `src/lib/modeCopy.ts` exporting `useModeCopy()` that returns a strongly-typed dictionary per mode. Every label below comes from this hook — no hard-coded strings in shared components.

| Key | Futures | Options |
|---|---|---|
| `tradeNoun` | Trade | Position |
| `tradeNounPlural` | Trades | Positions |
| `newCta` | New Trade | New Position |
| `instrumentLabel` | Instrument | Underlying |
| `sizeLabel` | Contracts | Contracts (× leg) |
| `riskLabel` | Risk ($) | Max Risk / Net Debit |
| `targetLabel` | Target | Profit Target % |
| `stopLabel` | Stop | Stop (% of credit/debit) |
| `pnlLabel` | P&L | Net P&L |
| `dashboardTitle` | Trading Floor | Options Desk |
| `playbookTitle` | Setup Playbook | Strategy Playbook |
| `weeklyDebriefTitle` | Weekly Trader Debrief | Options Week in Review |
| `coachPersona` | "Pit boss" — tactical, scalper-flavored | "Strategist" — IV/Greeks-flavored |
| `emptyStateTrades` | "No trades logged yet. Log your first contract." | "No positions yet. Open your first spread." |

Also includes mode-specific icon set choices (e.g. `TrendingUp` vs `Layers`) and accent class helpers.

## 3. Distinct navigation & route trees

Today both modes share `/`, `/trade-log`, `/playbook`, `/weekly-debrief`, etc. Split via a single source of truth:

- `src/lib/navConfig.ts` exports `getNav(mode)` returning the BottomNav + drawer items for that mode.
- **Futures nav**: Dashboard · Trade Log · Game Plan · Playbook · Scaling Plan · Risk of Ruin · Weekly Debrief · Chart Analyzer · Setup Library · Prop Firms.
- **Options nav**: Options Desk · Positions · Strategy Playbook · Options Risk · IVR & Theta · Earnings Calendar · Week in Review · Chart Analyzer.
- Hide nav items that don't apply per mode (Prop Firms hidden in Options; Earnings Calendar hidden in Futures).
- Routes still exist under one tree, but `BottomNav` and the `__root` drawer render only the active mode's items. Hitting a hidden route URL directly is allowed (for backward links) but won't surface in nav.

## 4. Distinct dashboards

- `src/routes/index.tsx` becomes a thin switcher: `mode === "futures" ? <FuturesDashboard /> : <OptionsDashboard />`.
- **FuturesDashboard** (extracted from current index): challenge tier, futures balance, futures stats, game plan, VIX, regime, recent futures trades, scaling, futures-only behavior alerts.
- **OptionsDashboard** (built from existing `OptionsDashboardSection` + new tiles): options balance, open positions count, today's unrealized P&L, net theta, next-expiring DTE, earnings-this-week, IVR snapshot, 0DTE module, recent options positions, "New Position" CTA.
- Each dashboard uses its mode's accent and copy dictionary.

## 5. Fully split data surfaces

- **Trade Log → split into two routes**:
  - `/trade-log` (futures only, no market filter shown).
  - `/positions` (options only, redirect target when Options mode active).
  - Active-mode default ensures `/` → correct list. The combined view is removed; each route reads only its own table.
- **Playbook**: `OptionsPlaybookBuilder` becomes the entire `/playbook` page in Options mode; futures setup playbook stays in Futures mode. No tab switcher.
- **Weekly Debrief**: separate generators and prompts (`weeklyDebrief.functions.ts` already exists; add `optionsWeeklyDebrief.functions.ts` or branch by mode). Stored `weekly_debriefs` gets a `mode` column so history filters correctly.
- **Challenges**: already mode-scoped via `challenges.mode` — verified.
- **AI coach memory**: pass `mode` to `coachChat.functions.ts`; system prompt swaps persona, glossary, and which trade tables it reads (`trades` vs `options_trades`). No cross-pollination of advice.
- **Journal**: scoped — journal entries already join `trade_id`, and options have their own notes field; coach reads only the active mode's entries.

## 6. Settings split

- `/settings` renders shared blocks (account, theme, backup) plus a mode-aware section:
  - **Futures-only**: tick value, instrument default, VIX tiers, prop firm constraints, scaling-tier rules.
  - **Options-only**: default commission/contract, profit target %, stop %, 0DTE hard exit time, IVR source, earnings-play mode.
- Onboarding asks which mode the user starts in and seeds only that mode's defaults.

## 7. Cross-mode indicator (header only)

- New helper `useOtherModeSignals()` runs one lightweight query on mount/toggle:
  - In Futures: count open `options_trades` + count expiring today.
  - In Options: count of today's `trades` + open game-plan alerts.
- AppHeader shows a tiny mode-tinted dot on the toggle when the other mode has any signal. Tooltip: "3 open options positions — tap to switch". No toasts, no banners, no notifications.

## 8. Schema changes

Single migration:
- `weekly_debriefs.mode text not null default 'futures'` + index.
- `trade_journals.mode text not null default 'futures'` (optional — only if we want to fully scope journal; otherwise infer from joined trade).
- Backfill existing rows to `'futures'`.

## 9. Cleanup

- Delete the in-page tab switchers that today juggle both modes inside one screen (Playbook tabs, Trade Log market filter dropdown).
- Move `OptionsDashboardSection` content into the new `OptionsDashboard` route component and delete the section file.
- Audit `OptionsWeeklyDebriefSection`, `OptionsRollingPerformance`, `OptionsSettingsSection` — they become primary content on their respective Options routes, not embedded into futures pages.

## Technical notes

```text
src/
  lib/
    modeCopy.ts            ← terminology dictionary hook
    navConfig.ts           ← per-mode nav items
    tradingModeContext.tsx ← provider, sets html[data-mode]
    otherModeSignals.ts    ← cross-mode dot helper
  components/
    AppHeader.tsx          ← reads context, renders mode dot
    BottomNav.tsx          ← reads navConfig
    dashboards/
      FuturesDashboard.tsx
      OptionsDashboard.tsx
  routes/
    index.tsx              ← mode switcher
    trade-log.tsx          ← futures only
    positions.tsx          ← options only (new)
    playbook.tsx           ← branches by mode
    weekly-debrief.tsx     ← branches by mode + reads scoped debriefs
    settings.tsx           ← branches mode-specific block
  styles.css               ← [data-mode="futures"] / [data-mode="options"] token blocks
```

## Out of scope (deliberate)

- No second logo or brand identity — same product, two skins.
- No separate Supabase project or separate auth.
- No hard archive of the other mode's data; switching is instant and reversible.
- No combined "all markets" report view — fully split per your choice.

## Rollout order

1. Migration (debrief mode column).
2. Context provider + `data-mode` + token blocks in styles.css.
3. `modeCopy.ts` + replace hard-coded labels in shared components.
4. `navConfig.ts` + BottomNav/drawer per-mode rendering.
5. Split dashboards (`/`).
6. Split Trade Log → `/trade-log` + `/positions`.
7. Branch Playbook, Weekly Debrief, Settings.
8. Mode-scope AI coach + weekly debrief generator.
9. Cross-mode header dot.
10. Delete dead tab-switcher code.

After approval I'll execute these in order, verifying the build between each major step.
