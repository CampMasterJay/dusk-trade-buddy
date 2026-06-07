import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { List, type RowComponentProps } from "react-window";
import { Trash2, Search, BookOpen, CalendarDays, Shield, Download, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { NewTradeSheet } from "@/components/NewTradeSheet";
import { OptionsTradeSheet } from "@/components/OptionsTradeSheet";
import { IvrPerformanceTracker } from "@/components/IvrPerformanceTracker";
import { IvrHistoryChart } from "@/components/IvrHistoryChart";
import { OptionsTradesList } from "@/components/OptionsTradesList";
import { OpenOptionsManager } from "@/components/OpenOptionsManager";
import { TradeDetailSheet } from "@/components/TradeDetailSheet";
import { TradeStats } from "@/components/TradeStats";
import { RollingPerformance, EdgeHealthScore } from "@/components/RollingPerformance";
import { PerformanceTrends } from "@/components/PerformanceTrends";
import { StopAnalytics } from "@/components/StopAnalytics";
import { ExitAnalytics } from "@/components/ExitAnalytics";
import { BehaviorAnalytics } from "@/components/BehaviorAnalytics";
import { StreakBehavior } from "@/components/StreakBehavior";
import { RegimePerformance } from "@/components/RegimePerformance";
import { SetupPerformanceBreakdown } from "@/components/SetupPerformanceBreakdown";
import { BenchmarksPanel } from "@/components/BenchmarksPanel";
import { TradeLockGate, TradeLockBanner } from "@/components/TradeLockGate";
import { computeDrawdown } from "@/lib/drawdown";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import {
  getTrades,
  getAllTrades,
  getTradeStats,
  deleteTrade,
  type Trade,
  type TradeStats as TradeStatsType,
} from "@/lib/tradeService";
import { getJournalTradeIds } from "@/lib/journalService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trade-log")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Trade Log" },
      { name: "description", content: "Track and review your trading history and performance." },
      { property: "og:title", content: "EdgeTrader — Trade Log" },
      { property: "og:description", content: "Track and review your trading history." },
    ],
  }),
  component: TradeLog,
});

const PAGE_SIZE = 25;
type FilterKey = "All" | "Wins" | "Losses";
type SortKey = "Newest" | "Oldest" | "LargestWin" | "LargestLoss";

function TradeLog() {
  return (
    <ProtectedRoute>
      <TradeLogScreen />
    </ProtectedRoute>
  );
}

function TradeLogScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useUserSettings();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<TradeStatsType | null>(null);
  const [journalIds, setJournalIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterKey>("All");
  const [instrumentFilter, setInstrumentFilter] = useState<string>("All");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("Newest");
  const [reloadKey, setReloadKey] = useState(0);

  // Auto-open New Trade sheet with prefill stashed by Chart Analyzer
  const [prefill, setPrefill] = useState<{
    entry?: string;
    stop?: string;
    target?: string;
    direction?: "Long" | "Short";
    instrument?: string;
  } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("pendingTradePrefill");
    if (!raw) return;
    sessionStorage.removeItem("pendingTradePrefill");
    try {
      setPrefill(JSON.parse(raw));
      setNewOpen(true);
    } catch {
      // ignore
    }
  }, []);

  // Initial / reload fetch
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      getTrades(userId, PAGE_SIZE, 0),
      getTradeStats(userId),
      getJournalTradeIds(userId),
    ]).then(
      ([tRes, sRes, jRes]) => {
        if (!active) return;
        if (tRes.error) {
          setError(tRes.error.message);
          setLoading(false);
          return;
        }
        const list = tRes.data ?? [];
        setTrades(list);
        setStats(sRes.data);
        setJournalIds(jRes.data ?? new Set());
        setPage(1);
        setHasMore(list.length === PAGE_SIZE);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const res = await getTrades(userId, PAGE_SIZE, page * PAGE_SIZE);
    if (res.error) {
      toast.error(res.error.message);
    } else {
      const list = res.data ?? [];
      setTrades((prev) => [...prev, ...list]);
      setPage((p) => p + 1);
      setHasMore(list.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [userId, page, hasMore, loadingMore]);

  // IntersectionObserver for infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const instruments = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => set.add(t.instrument));
    return Array.from(set).sort();
  }, [trades]);

  const filteredSorted = useMemo(() => {
    let list = trades.slice();
    if (filter === "Wins") list = list.filter((t) => t.result === "Win");
    if (filter === "Losses") list = list.filter((t) => t.result === "Loss");
    if (instrumentFilter !== "All")
      list = list.filter((t) => t.instrument === instrumentFilter);
    if (dateFilter) list = list.filter((t) => t.date === dateFilter);

    const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
    switch (sort) {
      case "Oldest":
        list.sort((a, b) =>
          a.date === b.date
            ? a.created_at.localeCompare(b.created_at)
            : a.date.localeCompare(b.date),
        );
        break;
      case "LargestWin":
        list.sort((a, b) => num(b.pnl) - num(a.pnl));
        break;
      case "LargestLoss":
        list.sort((a, b) => num(a.pnl) - num(b.pnl));
        break;
      case "Newest":
      default:
        list.sort((a, b) =>
          a.date === b.date
            ? b.created_at.localeCompare(a.created_at)
            : b.date.localeCompare(a.date),
        );
    }
    return list;
  }, [trades, filter, instrumentFilter, dateFilter, sort]);

  // Running balance: oldest -> newest cumulative
  const balanceMap = useMemo(() => {
    const start = Number(settings?.starting_balance ?? 100);
    const oldestFirst = trades.slice().sort((a, b) =>
      a.date === b.date
        ? a.created_at.localeCompare(b.created_at)
        : a.date.localeCompare(b.date),
    );
    const map = new Map<string, number>();
    let running = start;
    for (const t of oldestFirst) {
      running += Number(t.pnl ?? 0);
      map.set(t.id, running);
    }
    return map;
  }, [trades, settings?.starting_balance]);

  const currentBalance = Number(settings?.current_balance ?? 100);
  const refresh = () => setReloadKey((k) => k + 1);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const drawdown = useMemo(
    () => computeDrawdown(trades, Number(settings?.starting_balance ?? 100)),
    [trades, settings?.starting_balance],
  );

  return (
    <>
      <AppHeader balance={currentBalance} />
      <div className="px-4 pt-4 pb-24 lg:px-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold font-heading">Trade Log</h1>
            <p className="text-xs text-muted-foreground font-data uppercase tracking-wider mt-1">
              {trades.length} {trades.length === 1 ? "trade" : "trades"}
            </p>
          </div>
          <TradeLockGate
            locked={drawdown.lockTrading}
            defaultInstrument={settings?.instrument ?? "MES"}
            onLogged={refresh}
            prefill={prefill}
            sheetOpen={newOpen}
            onSheetOpenChange={(v) => {
              setNewOpen(v);
              if (!v) setPrefill(null);
            }}
          />
        </div>

        <div className="flex justify-end -mt-2 mb-3">
          <OptionsTradeSheet onLogged={refresh} />
        </div>

        <TradeLockBanner
          level={drawdown.level}
          title={drawdown.alertTitle}
          message={drawdown.alertMessage}
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link
            to="/calendar"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-xs font-data uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-trade-green/50"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar view
          </Link>
          <Link
            to="/risk-of-ruin"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-xs font-data uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-trade-green/50"
          >
            <Shield className="h-3.5 w-3.5" />
            Risk of Ruin
          </Link>
          <ExportButtons
            userId={userId}
            startingBalance={Number(settings?.starting_balance ?? 100)}
            stats={stats}
          />
        </div>

        {/* Stats */}
        <div className="mb-4">
          <Tabs defaultValue="stats" className="w-full">
            <TabsList className="grid w-full grid-cols-6 mb-3">
              <TabsTrigger value="stats" className="text-xs uppercase tracking-wider font-data">
                Stats
              </TabsTrigger>
              <TabsTrigger value="behavior" className="text-xs uppercase tracking-wider font-data">
                Behavior
              </TabsTrigger>
              <TabsTrigger value="regime" className="text-xs uppercase tracking-wider font-data">
                By Regime
              </TabsTrigger>
              <TabsTrigger value="stops" className="text-xs uppercase tracking-wider font-data">
                Stops
              </TabsTrigger>
              <TabsTrigger value="exits" className="text-xs uppercase tracking-wider font-data">
                Exits
              </TabsTrigger>
              <TabsTrigger value="options" className="text-xs uppercase tracking-wider font-data">
                Options
              </TabsTrigger>
            </TabsList>
            <TabsContent value="stats" className="mt-0">
              <div className="space-y-3">
                <EdgeHealthScore trades={trades} />
                <RollingPerformance trades={trades} />
                <PerformanceTrends trades={trades} />
                <TradeStats stats={stats} trades={trades} />
              </div>
            </TabsContent>
            <TabsContent value="behavior" className="mt-0">
              <div className="space-y-4">
                <BehaviorAnalytics trades={trades} />
                <StreakBehavior
                  trades={trades}
                  startingBalance={Number(settings?.starting_balance ?? 100)}
                />
              </div>
            </TabsContent>
            <TabsContent value="regime" className="mt-0">
              <RegimePerformance trades={trades} />
            </TabsContent>
            <TabsContent value="stops" className="mt-0">
              <StopAnalytics
                trades={trades}
                tickValue={Number(settings?.tick_value ?? 5)}
              />
            </TabsContent>
            <TabsContent value="exits" className="mt-0">
              <ExitAnalytics
                trades={trades}
                tickValue={Number(settings?.tick_value ?? 5)}
              />
            </TabsContent>
            <TabsContent value="options" className="mt-0">
              <div className="space-y-3">
                <OpenOptionsManager />
                <IvrHistoryChart />
                <IvrPerformanceTracker />
                <div>
                  <h3 className="text-xs uppercase tracking-wider font-data text-muted-foreground mb-2 px-1">
                    Recent options trades
                  </h3>
                  <OptionsTradesList />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="mb-4">
          <SetupPerformanceBreakdown trades={trades} />
        </div>

        <div className="mb-4">
          <BenchmarksPanel trades={trades} />
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-4 px-4 scrollbar-none">
          {(["All", "Wins", "Losses"] as FilterKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-data uppercase tracking-wider border whitespace-nowrap transition-colors",
                filter === k
                  ? "bg-trade-green/15 border-trade-green/50 text-trade-green"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {k}
            </button>
          ))}
          <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
            <SelectTrigger className="h-8 w-auto min-w-[120px] rounded-full text-xs font-data uppercase tracking-wider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Instruments</SelectItem>
              {instruments.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-8 w-auto rounded-full text-xs font-data"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-xs text-muted-foreground hover:text-foreground px-2"
            >
              Clear
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-data uppercase tracking-wider text-muted-foreground">
            Sort
          </span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs font-data">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Newest">Newest first</SelectItem>
              <SelectItem value="Oldest">Oldest first</SelectItem>
              <SelectItem value="LargestWin">Largest Win</SelectItem>
              <SelectItem value="LargestLoss">Largest Loss</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-12 flex justify-center">
            <LoadingSpinner label="Loading trades..." />
          </div>
        ) : error ? (
          <ErrorCard message={error} onRetry={refresh} />
        ) : filteredSorted.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No trades found"
            subtitle={
              trades.length === 0
                ? "Log your first trade to start building your edge."
                : "Try clearing your filters."
            }
          />
        ) : filteredSorted.length > 50 ? (
          <VirtualizedTradeList
            trades={filteredSorted}
            balanceMap={balanceMap}
            journalIds={journalIds}
            onOpen={(t) => {
              setSelectedTrade(t);
              setDetailOpen(true);
            }}
            onDeleted={(id) => setTrades((prev) => prev.filter((x) => x.id !== id))}
            onRestore={(t) => setTrades((prev) => [t, ...prev])}
          />
        ) : (
          <ul className="space-y-2">
            {filteredSorted.map((t) => (
              <TradeCard
                key={t.id}
                trade={t}
                runningBalance={balanceMap.get(t.id) ?? 0}
                hasJournal={journalIds.has(t.id)}
                onOpen={() => {
                  setSelectedTrade(t);
                  setDetailOpen(true);
                }}
                onDeleted={() => setTrades((prev) => prev.filter((x) => x.id !== t.id))}
                onRestore={() => setTrades((prev) => [t, ...prev])}
              />
            ))}
          </ul>
        )}

        {/* Infinite scroll sentinel + load more */}
        {!loading && !error && hasMore && (
          <div ref={sentinelRef} className="py-6 flex justify-center">
            {loadingMore ? (
              <LoadingSpinner />
            ) : (
              <Button variant="ghost" size="sm" onClick={loadMore}>
                Load more
              </Button>
            )}
          </div>
        )}
      </div>
      <TradeDetailSheet
        trade={selectedTrade}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onChanged={refresh}
      />
    </>
  );
}

// ============= Virtualized list =============
const ROW_HEIGHT = 104; // px — TradeCard height incl. 8px gap

type RowProps = {
  items: Trade[];
  balanceMap: Map<string, number>;
  journalIds: Set<string>;
  onOpen: (t: Trade) => void;
  onDeleted: (id: string) => void;
  onRestore: (t: Trade) => void;
};

function TradeRow({ index, style, items, balanceMap, journalIds, onOpen, onDeleted, onRestore }: RowComponentProps<RowProps>) {
  const t = items[index];
  return (
    <div style={style} className="pb-2">
      <TradeCard
        trade={t}
        runningBalance={balanceMap.get(t.id) ?? 0}
        hasJournal={journalIds.has(t.id)}
        onOpen={() => onOpen(t)}
        onDeleted={() => onDeleted(t.id)}
        onRestore={() => onRestore(t)}
      />
    </div>
  );
}

function VirtualizedTradeList({
  trades,
  balanceMap,
  journalIds,
  onOpen,
  onDeleted,
  onRestore,
}: {
  trades: Trade[];
  balanceMap: Map<string, number>;
  journalIds: Set<string>;
  onOpen: (t: Trade) => void;
  onDeleted: (id: string) => void;
  onRestore: (t: Trade) => void;
}) {
  // Cap viewport at ~70vh on mobile so the page still scrolls naturally.
  const height = Math.min(
    typeof window !== "undefined" ? window.innerHeight * 0.7 : 600,
    trades.length * ROW_HEIGHT,
  );
  return (
    <List
      rowCount={trades.length}
      rowHeight={ROW_HEIGHT}
      rowComponent={TradeRow}
      rowProps={{ items: trades, balanceMap, journalIds, onOpen, onDeleted, onRestore }}
      style={{ height }}
    />
  );
}

// ============= Trade Card =============
const TradeCard = memo(function TradeCard({
  trade,
  runningBalance,
  hasJournal,
  onOpen,
  onDeleted,
  onRestore,
}: {
  trade: Trade;
  runningBalance: number;
  hasJournal: boolean;
  onOpen: () => void;
  onDeleted: () => void;
  onRestore?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Swipe state
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setDragX(Math.max(dx, -120));
  };
  const onTouchEnd = () => {
    if (dragX < -60) {
      setDragX(-100);
      setConfirmOpen(true);
    } else {
      setDragX(0);
    }
    startX.current = null;
  };

  const handleDelete = async () => {
    // Optimistic: remove from UI immediately, sync to server in the background,
    // restore on failure.
    setDeleting(true);
    setConfirmOpen(false);
    onDeleted();
    const { error } = await deleteTrade(trade.id);
    setDeleting(false);
    if (error) {
      toast.error(`Couldn't delete: ${error.message}`);
      onRestore?.();
      setDragX(0);
      return;
    }
    toast.success("Trade deleted");
  };

  const fmtMoney = (v: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(v);

  const pnl = Number(trade.pnl ?? 0);
  const r = trade.r_multiple == null ? null : Number(trade.r_multiple);

  const resultColor =
    trade.result === "Win"
      ? "bg-trade-green/15 text-trade-green border-trade-green/40"
      : trade.result === "Loss"
        ? "bg-trade-red/15 text-trade-red border-trade-red/40"
        : "bg-muted text-muted-foreground border-border";

  const dirColor =
    trade.direction === "Long"
      ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
      : "bg-amber-500/15 text-amber-400 border-amber-500/40";

  const pnlColor =
    pnl > 0 ? "text-trade-green" : pnl < 0 ? "text-trade-red" : "text-muted-foreground";

  return (
    <li className="relative overflow-hidden rounded-xl animate-card-rise">
      {/* Delete reveal background */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end pr-5 bg-trade-red text-white">
        <Trash2 className="h-5 w-5" />
      </div>

      <div
        className="relative bg-card border border-border rounded-xl transition-transform"
        style={{ transform: `translateX(${dragX}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={onOpen}
          className="w-full text-left p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-data text-muted-foreground">
                  {formatDate(trade.date)}
                </span>
                <span className="font-data font-semibold text-sm">
                  {trade.instrument}
                </span>
                <Badge className={dirColor}>{trade.direction}</Badge>
                <Badge className={resultColor}>{trade.result}</Badge>
                {hasJournal && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-trade-amber/40 bg-trade-amber/10 text-trade-amber px-1.5 py-0.5"
                    title="Has journal entry"
                    aria-label="Has journal entry"
                  >
                    <BookOpen className="h-3 w-3" />
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className={cn("font-data font-bold text-lg", pnlColor)}>
                  {pnl >= 0 ? "+" : ""}
                  {fmtMoney(pnl)}
                </span>
                {r != null && (
                  <span
                    className={cn(
                      "text-xs font-data",
                      r > 0
                        ? "text-trade-green"
                        : r < 0
                          ? "text-trade-red"
                          : "text-muted-foreground",
                    )}
                  >
                    {r > 0 ? "+" : ""}
                    {r.toFixed(2)}R
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
                Balance
              </div>
              <div className="text-sm font-data text-foreground">
                {fmtMoney(runningBalance)}
              </div>
            </div>
          </div>
        </button>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setDragX(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              {trade.instrument} {trade.direction} on {formatDate(trade.date)}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className="bg-trade-red text-white hover:bg-trade-red/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
});

function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-data uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </span>
  );
}


function formatDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ============ Export helpers ============ */

function escapeCsvCell(v: string | number | null | undefined): string {
  const str = String(v ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(allTrades: Trade[], startingBalance: number): string {
  const headers = [
    "Date",
    "Instrument",
    "Direction",
    "Entry",
    "Stop",
    "Target",
    "Result",
    "R Multiple",
    "P&L",
    "Running Balance",
    "Notes",
  ];
  let csv = headers.map(escapeCsvCell).join(",") + "\n";
  let running = startingBalance;
  for (const t of allTrades) {
    running += Number(t.pnl ?? 0);
    const row = [
      t.date,
      t.instrument,
      t.direction,
      t.entry,
      t.stop,
      t.target,
      t.result,
      t.r_multiple == null ? "" : Number(t.r_multiple).toFixed(2),
      Number(t.pnl ?? 0).toFixed(2),
      running.toFixed(2),
      t.notes ?? "",
    ];
    csv += row.map(escapeCsvCell).join(",") + "\n";
  }
  return csv;
}

function triggerDownload(filename: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);

  // Try Web Share API on mobile
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator
      .share({ files: [file], title: filename })
      .catch(() => fallbackDownload(url, filename));
  } else {
    fallbackDownload(url, filename);
  }
}

function fallbackDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function getWeekBounds(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diffToMon = (day + 6) % 7;
  const mon = new Date(dt);
  mon.setDate(dt.getDate() - diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { mon, sun };
}

function buildWeeklySummary(allTrades: Trade[], stats: TradeStatsType | null): string {
  const { mon, sun } = getWeekBounds();
  const monStr = mon.toISOString().slice(0, 10);
  const sunStr = sun.toISOString().slice(0, 10);

  const weekTrades = allTrades.filter(
    (t) => t.date >= monStr && t.date <= sunStr,
  );
  const wins = weekTrades.filter((t) => t.result === "Win");
  const losses = weekTrades.filter((t) => t.result === "Loss");
  const winRate = weekTrades.length > 0 ? (wins.length / weekTrades.length) * 100 : 0;
  const netPnl = weekTrades.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
  const totalR = weekTrades.reduce((a, t) => a + Number(t.r_multiple ?? 0), 0);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const lines: string[] = [
    "📊 EdgeTrader Weekly Summary",
    `${mon.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sun.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    "",
    `Trades taken: ${weekTrades.length}`,
    `Win rate: ${winRate.toFixed(0)}% (${wins.length}W / ${losses.length}L)`,
    `Net P&L: ${netPnl >= 0 ? "+" : ""}${fmtMoney(netPnl)}`,
    `Total R: ${totalR.toFixed(2)}R`,
  ];

  if (stats) {
    const ev = stats.ev;
    const avgWin = stats.avgWin;
    const avgLoss = Math.abs(stats.avgLoss);
    lines.push(``, `Avg Win: ${fmtMoney(avgWin)}`);
    lines.push(`Avg Loss: ${fmtMoney(-avgLoss)}`);
    lines.push(`EV / Trade: ${ev >= 0 ? "+" : ""}${fmtMoney(ev)}`);
  }

  return lines.join("\n");
}

function ExportButtons({
  userId,
  startingBalance,
  stats,
}: {
  userId: string | null;
  startingBalance: number;
  stats: TradeStatsType | null;
}) {
  const [exporting, setExporting] = useState(false);

  const handleExportCsv = async () => {
    if (!userId) return;
    setExporting(true);
    const res = await getAllTrades(userId);
    setExporting(false);
    if (res.error || !res.data) {
      toast.error("Failed to load trades for export");
      return;
    }
    const csv = buildCsv(res.data, startingBalance);
    const today = new Date().toISOString().slice(0, 10);
    const filename = `EdgeTrader_trades_${today}.csv`;
    triggerDownload(filename, csv);
    toast.success("CSV exported");
  };

  const handleCopySummary = async () => {
    if (!userId) return;
    const res = await getAllTrades(userId);
    if (res.error || !res.data) {
      toast.error("Failed to load trades");
      return;
    }
    const text = buildWeeklySummary(res.data, stats);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Weekly summary copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <>
      <button
        onClick={handleExportCsv}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-data uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-trade-green/50 disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        {exporting ? "Exporting…" : "Export CSV"}
      </button>
      <button
        onClick={handleCopySummary}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-data uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-trade-green/50"
      >
        <ClipboardCopy className="h-3.5 w-3.5" />
        Copy stats
      </button>
    </>
  );
}

