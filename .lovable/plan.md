## Goal
Standardize loading, error, and optimistic-update behavior across every Supabase-backed surface in the app.

## Scope (audited surfaces)
Components/hooks that fetch from Supabase directly today:
- Hooks: `useUserSettings`, `useSetupStatuses`, `useTodayVix`, plus equivalents in `useOptionsCalculator` consumers
- Components: `OptionsRollingPerformance`, `OptionsSummaryCard`, `OptionsWeeklyDebriefSection`, `OptionsDashboardSection`, `OptionsTradesList`, `OptionsTradeStats`, `OptionsBehaviorAnalytics`, `OptionsRiskDashboard`, `OptionsPnLAttribution`, `OpenOptionsManager`, `CreditSpreadManager`, `DailyThetaCard`, `IvrHistoryChart`, `IvrPerformanceTracker`, `EarningsCalendarManager`, `EarningsPlayStats`, `PriceAlertsPanel`, `WatchlistManager`, `ScalingTierCard`, `ChallengeHistorySection`, `AchievementsSection`, `BehaviorAnalytics`, `StreakBehavior`, `PerformanceTrends`, `RollingPerformance`, `SetupPerformanceBreakdown`, `JournalTab`, `TradeStats`, `DrawdownTracker`, `ConsistencyStreak`, `TradeOfTheWeek`, `BenchmarksPanel`, `HighImpactAlertCard`, `ExitAnalytics`, `StopAnalytics`, `SparklineCard`, `ZeroDteModule`
- Trade logging: `NewTradeSheet`, `OptionsTradeSheet`, `QuickLogPhotoUpload`, `OptionsQuickLogFab`
- Routes that fetch in loaders/effects: `index.tsx`, `trade-log.tsx`, `trading-history.tsx`, `weekly-debrief.tsx`, `weekly-report.tsx`, `calendar.tsx`, `game-plan.tsx`, `setup-library.tsx`, `setup-advisor.tsx`, `playbook.tsx`, `prop-firms*`, `options-risk.tsx`, `scaling-plan.tsx`, `news*`, `settings.tsx`

## Approach

### 1. Shared primitives
- Reuse existing `SkeletonCard` and `Skeleton` for shimmer; add a small set of layout-matched skeletons:
  - `StatsTileSkeleton` (4-tile grid like `OptionsWeeklyDebriefSection`)
  - `ListRowSkeleton` (trades/setups list rows)
  - `ChartSkeleton` (chart cards)
  - `SummarySkeleton` (Greeks/portfolio cards)
- Reuse existing `ErrorCard` for retry UI everywhere.

### 2. Standard async hook
Introduce `useAsyncData<T>(fetcher, deps)` that returns `{ data, loading, error, refresh }`. Sets `loading=true` BEFORE fetch and `false` in `finally`. Components render: `loading → Skeleton`, `error → ErrorCard onRetry={refresh}`, `data → content`.

### 3. Per-component refactor
For each component in scope:
- Replace ad-hoc `useState/useEffect/then/catch/finally` with `useAsyncData` (or keep local state but enforce the loading-before/after invariant and add `error`)
- Render flow: skeleton → error → empty → content (never render content while `loading || !data`)
- Use a layout-matched skeleton variant

### 4. Optimistic trade logging
- `tradeService.createTrade` / options equivalent: emit an optimistic event and update local caches before the network call resolves; rollback on error with a toast.
- In `NewTradeSheet`, `OptionsTradeSheet`, `QuickLogPhotoUpload`: close the sheet immediately on submit, show optimistic row in lists, dispatch existing `edgetrader:refresh` so `useUserSettings` recalculates. On error, revert and surface `ErrorCard`/toast.
- Add an in-memory `optimisticTradesStore` keyed by a temp UUID; trades lists merge optimistic + server rows, replacing on confirmation.

### 5. Verification
- Build passes.
- Spot-check: throttle network in preview, confirm skeletons appear, error UI shows on forced failure, optimistic row appears instantly on trade save.

## Caveats / size
This touches 40+ files. I'll execute in waves (primitives → hooks → top-traffic components → remaining → trade logging optimistic path) and report progress. If you'd rather I scope to a subset first (e.g. dashboard + trade logging only), say which.
