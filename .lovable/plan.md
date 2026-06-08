## Goal

The `/playbook` route currently shows a "Futures Playbook / Options Playbook" market toggle and renders a thin OptionsPlaybookBuilder when the second tab is picked. The Options side is shallow compared to Futures and the toggle itself bleeds futures terminology into options mode.

This plan makes the page mode-aware and rebuilds the options builder to match (and in places exceed) the futures builder's depth, using options-native dimensions.

## What changes

### 1. `src/routes/playbook.tsx` — mode-aware shell, no toggle
- Read active mode from `useTradingMode()` instead of a local toggle.
- In **futures mode**: render the existing futures playbook flow unchanged (no "Options Playbook" tab visible, no options copy).
- In **options mode**: render only the new `OptionsPlaybookBuilder` (no futures discovery, no futures filters, no "Futures Playbook" label, no shared toggle).
- Header title flips: "Futures Playbook Builder" vs "Options Playbook Builder".
- Drop the `market` state, the toggle UI, and the conditional `<>` futures fragment guard from the options branch.

### 2. `src/components/OptionsPlaybookBuilder.tsx` — full rebuild
Rebuild as a comprehensive, options-first builder. Sections, top to bottom:

1. **Header strip** — closed-trade count, IVR snapshot of last entry, AI confidence chip.
2. **Strategy Templates (new)** — curated starter entries the user can clone into their playbook in one tap. Templates are derived from `ivrGuidance` + common options strategies:
   - High-IVR credit: Iron Condor 45 DTE, Bull Put Spread 30-45 DTE, Bear Call Spread 30-45 DTE, Covered Call, Cash-Secured Put.
   - Low-IVR debit: Long Call / Long Put, Bull Call Debit Spread, Bear Put Debit Spread, Long Straddle / Strangle.
   - Neutral/Tactical: 0DTE Iron Fly, Calendar, Diagonal, Earnings Strangle.
   Each template seeds the filter panel and a suggested name/notes block.
3. **AI Discovery card** — unchanged shape but wired to options-native conditions (strategy, IVR bucket, DTE bucket, regime, day-of-week, underlying sector). Already in `discoverOptionsSetup.functions`.
4. **Live Results card** — adds Net P&L tile (currently missing), Avg DTE held, Avg % of max profit, win rate, trade count, confidence bar.
5. **Filters card (expanded)**:
   - Underlying, Strategy, Market Regime (existing).
   - IVR bucket chips: Low (<30) / Moderate (30-60) / High (>60), plus the slider.
   - DTE bucket chips: 0DTE / Weekly (1-7) / Monthly (8-45) / LEAPS (>45), plus slider.
   - VIX range (existing).
   - **Greeks targets (new)**: entry-delta band slider (-0.5 to +0.5), max |theta|/day, max |vega| per position. Filters historical trades by `entry_delta/theta/vega` columns on `options_trades`.
   - **Exit discipline (new)**: profit-take % bucket (25/50/75/100), stop loss % bucket (50/100/200), days held bucket.
   - Day-of-week, Days-to-Avoid (existing).
   - Earnings flag (Hold through / Avoid / Either) when `is_earnings_play` is present.
   - Direction (Debit / Credit / Both), Checklist score (existing).
   - Reset button.
6. **Sample Trades** — keep, add % max-profit and DTE columns.
7. **My Options Playbook** — keep `OptionsEntryCard` with health monitoring (HEALTHY / SOFTENING / DEGRADING / INSUFFICIENT), status switch (Active / Testing / Retired), delete, load-back-into-filters, baseline vs current win-rate delta.
8. **Empty state** — when no closed options trades exist, still show Strategy Templates so a brand-new user can save a curated starter playbook without trade history.

### 3. Shared helpers (small)
- Extend `applyOptionsFilters` to honor new dimensions (greeks band, exit %, DTE buckets, earnings flag). Each new filter is a guarded pass — missing data ⇒ row not excluded by that filter.
- Add a small `optionsStrategyTemplates.ts` next to `OptionsPlaybookBuilder.tsx` listing the curated templates above as `{ name, notes, filters: Partial<OptionsFilters> }`.

### 4. Out of scope
- No changes to `setup-library`, dashboards, walkthroughs, navigation, or the futures playbook logic itself.
- No DB migrations — all new filters read existing `options_trades` columns and `daily_game_plans` for regime/VIX.
- No edit to `src/components/dashboards/OptionsDashboard.tsx`, only the `/playbook` route and builder.

## Technical notes

```text
/playbook (route)
 ├─ mode === 'futures' → existing futures builder (unchanged)
 └─ mode === 'options' → <OptionsPlaybookBuilder/> (rebuilt)
        ├─ <StrategyTemplates/>      (new)
        ├─ <AIDiscoveryCard/>        (kept, options-native)
        ├─ <LiveResultsCard/>        (expanded tiles)
        ├─ <FiltersCard/>            (expanded dimensions)
        ├─ <SampleTradesCard/>       (kept)
        └─ <MyOptionsPlaybookCard/>  (kept, health-aware)
```

Filter persistence: stored in `playbook_entries.filters` with `market: "options"` marker, same as today, so existing saved options entries still load.

## Acceptance criteria

- In options mode, `/playbook` shows zero references to "Futures Playbook", "Futures" tab, or futures-only filters (setup_tag, hour-of-day CT, session_trade_number).
- In futures mode, `/playbook` shows zero "Options Playbook" tab/copy.
- New options builder includes Strategy Templates, IVR buckets, DTE buckets, Greeks targets, exit-discipline filters, earnings flag, and existing underlying/strategy/regime/VIX/DOW/checklist/direction filters.
- Saved entries continue to load, health-monitor, and restore filters correctly.
- Build passes.
