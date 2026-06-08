# Build Play from Chart Analysis

Add a second primary action — **Build Play** — alongside the existing **Use These Levels** button in the Chart Analyzer results panel. It takes the AI analysis and produces an A+ setup + strategy recommendation tailored to the user's active trading mode (futures or options).

## What ships

### 1. New action button — `AnalysisView`
In `src/routes/chart-analyzer.tsx`, in the results actions row that currently renders "Use These Levels" / "Save":
- Add **Build Play** (Sparkles/Zap icon, primary accent) to the left of "Use These Levels".
- Disabled until the analysis has at least a `biasDirection` or `setupIdea.direction`.

### 2. New modal — `BuildPlayModal`
New file `src/components/BuildPlayModal.tsx`. Opens over the analyzer with a structured A+ Play card. Mode-aware via `useTradingMode()`.

**Shared header (both modes):**
- Instrument · Timeframe · Bias chip (Long/Short)
- Setup name (from `analysis.setupDetected`)
- Quality score (1–5 stars from `analysis.setupQuality`)
- One-line thesis (from `analysis.summary` / MTF verdict)

**Futures mode body:**
- **Plan**: Entry / Stop / Target / R:R (from `analysis.setupIdea`)
- **Position size**: computed from `positionSizing.ts` using balance + risk_pct + stop distance
- **Checklist**: confluence factors as ✓ items, risk factors as ⚠ items
- **Best-fit playbook match**: run `classifyConditions()` from `playbookMatcher.ts` against the user's existing futures playbook entries; show A+/Partial/No-Match badge with win rate + trade count when found
- **Session note**: warn if outside user's session window or VIX out of range
- Actions: **Use These Levels** (existing prefill flow) · **Save to Playbook** (seeds futures playbook builder with setup/instrument/direction filters) · **Close**

**Options mode body:**
- **Recommended strategy**: `analysis.optionsRecommendation.primaryStrategy` (large) + alternative
- **Reasoning**: `optionsRecommendation.reasoning`
- **Greeks/structure guidance**: idealDTE, idealDelta, strikeGuidance, expirationGuidance, maxRiskGuidance, ivRankNote
- **Risk flags**: earningsWarning chip + keyRisk
- **Best-fit template match**: scan `OPTIONS_TEMPLATES` from `optionsStrategyTemplates.ts` for the closest match by strategy name + direction; show the template card with its blurb
- **Quick sizing hint**: link to options position sizer with strategy preselected
- Actions: **Open Options Trade Sheet** (prefilled strategy + underlying via sessionStorage key `pendingOptionsPrefill`) · **Save to Options Playbook** (seeds `OptionsPlaybookBuilder` filters) · **Close**

If `optionsRecommendation` is missing from the analysis JSON (older saves), show a graceful empty state: "No options recommendation in this analysis — re-run analysis in Options mode."

### 3. Prefill plumbing
- Futures "Save to Playbook" → write `sessionStorage["pendingPlaybookSeed"]` with `{ setups, instruments, direction }`, navigate to `/playbook`. Playbook builder reads + clears it on mount and seeds filters.
- Options "Open Trade Sheet" → write `sessionStorage["pendingOptionsPrefill"]` with `{ strategy, underlying, dte, delta }`, navigate to `/trade-log` (options tab) or trigger `OptionsTradeSheet` open. Existing options trade sheet reads + clears.
- Options "Save to Options Playbook" → write `sessionStorage["pendingOptionsPlaybookSeed"]` with `{ strategies, ivrRange, dteRange, direction, earnings }`, navigate to `/playbook` (options mode auto-renders `OptionsPlaybookBuilder`).

### 4. History — same CTA
In the saved-analysis detail view (`SavedAnalysisDetail` / when `selected` is set in the history tab), surface the same **Build Play** button so users can rebuild a play from any past analysis.

## Out of scope
- No DB schema changes — Build Play is derived live from the existing analysis JSON.
- No changes to `analyzeChart` server function — the AI output already contains `setupIdea` and `optionsRecommendation`.
- No changes to the futures/options playbook builders' core logic — only their `useEffect` mount hook to read the new sessionStorage seed keys.

## Files touched
- `src/routes/chart-analyzer.tsx` — add Build Play button in `AnalysisView` actions row and in `SavedAnalysisDetail`.
- `src/components/BuildPlayModal.tsx` — new component (mode-aware).
- `src/components/OptionsPlaybookBuilder.tsx` — read `pendingOptionsPlaybookSeed` on mount.
- `src/routes/playbook.tsx` (futures builder section) — read `pendingPlaybookSeed` on mount.
- `src/components/OptionsTradeSheet.tsx` — read `pendingOptionsPrefill` on mount (if not already).
