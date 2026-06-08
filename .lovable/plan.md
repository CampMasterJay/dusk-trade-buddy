## Goal

Remove the standalone "Mode" toggle (Futures / Options / Both) inside the Chart Analyzer. Each global trading mode gets its own dedicated analyzer experience, driven automatically by the app-wide `useTradingMode()` (the logo toggle in `AppHeader`).

## Behavior

- In **Futures mode**: analyzer runs as a futures-only analyzer. No options strategy block, no options recommendation, header reads "Futures Chart Analyzer".
- In **Options mode**: analyzer runs as an options-only analyzer. The AI is asked for `optionsRecommendation` (primary/alternative strategy, DTE, delta, IV note, earnings warning), header reads "Options Chart Analyzer", and the strategy card is always visible.
- Switching modes (via the existing logo toggle) re-themes the analyzer; there is no per-screen mode picker anymore.
- Scan Mode (bulk scan) follows the same active trading mode.
- Build Play and "Use These Levels" continue to branch on mode as they already do.

## Changes

1. **`src/routes/chart-analyzer.tsx`**
   - Delete the `ChartAnalyzerModeToggle` component and its render site (around line 345).
   - Call `useTradingMode()` in `ChartAnalyzer`; derive `marketType = mode === "options" ? "options" : "standard"`.
   - Pass `marketType` into the `analyze({ data: { frames, marketType } })` call so the server function returns the mode-specific shape.
   - Update the page title/subtitle to reflect the active mode ("Futures Chart Analyzer" / "Options Chart Analyzer").

2. **`src/components/ScanMode.tsx`**
   - Use `useTradingMode()` and forward `marketType` to its `analyze({ data })` call so bulk scans also match the active mode.

3. **`src/lib/localPrefs.ts`**
   - Remove the now-unused `chartAnalyzerMode` field (and its default). No other code reads it after step 1.

## Out of scope

- No changes to `analyzeChart` server function — it already accepts `marketType`.
- No DB / schema changes.
- No changes to playbook seeding, Build Play modal, or history detail beyond what already keys off `optionsRecommendation` presence.
