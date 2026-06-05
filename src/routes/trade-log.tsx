import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Plus, Trash2, ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import {
  getTrades,
  createTrade,
  deleteTrade,
  type Trade,
} from "@/lib/tradeService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

  // Initial / reload fetch
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    setError(null);
    getTrades(userId, PAGE_SIZE, 0).then((res) => {
      if (!active) return;
      if (res.error) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      const list = res.data ?? [];
      setTrades(list);
      setPage(1);
      setHasMore(list.length === PAGE_SIZE);
      setLoading(false);
    });
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
          <NewTradeButton
            defaultInstrument={settings?.instrument ?? "MES"}
            onLogged={refresh}
          />
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
            icon={<Search className="h-6 w-6" />}
            title="No trades found"
            subtitle={
              trades.length === 0
                ? "Log your first trade to start building your edge."
                : "Try clearing your filters."
            }
          />
        ) : (
          <ul className="space-y-2">
            {filteredSorted.map((t) => (
              <TradeCard
                key={t.id}
                trade={t}
                runningBalance={balanceMap.get(t.id) ?? 0}
                onDeleted={() => {
                  setTrades((prev) => prev.filter((x) => x.id !== t.id));
                }}
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
    </>
  );
}

// ============= Trade Card =============
function TradeCard({
  trade,
  runningBalance,
  onDeleted,
}: {
  trade: Trade;
  runningBalance: number;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
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
    setDeleting(true);
    const { error } = await deleteTrade(trade.id);
    setDeleting(false);
    setConfirmOpen(false);
    if (error) {
      toast.error(error.message);
      setDragX(0);
      return;
    }
    toast.success("Trade deleted");
    onDeleted();
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
    <li className="relative overflow-hidden rounded-xl">
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
          onClick={() => setExpanded((x) => !x)}
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
              <ChevronDown
                className={cn(
                  "h-4 w-4 ml-auto mt-1 text-muted-foreground transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </div>
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3 text-xs font-data">
              <Detail label="Entry" value={fmtNum(trade.entry)} />
              <Detail label="Stop" value={fmtNum(trade.stop)} />
              <Detail label="Target" value={fmtNum(trade.target)} />
              {trade.range_size != null && (
                <Detail label="Range" value={fmtNum(trade.range_size)} />
              )}
              {trade.notes && (
                <div className="col-span-3 text-muted-foreground whitespace-pre-wrap">
                  {trade.notes}
                </div>
              )}
              <div className="col-span-3 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-trade-red hover:text-trade-red"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </div>
            </div>
          )}
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
}

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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toString() : "—";
}

function formatDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ============= New Trade Sheet =============
function NewTradeButton({
  defaultInstrument,
  onLogged,
}: {
  defaultInstrument: string;
  onLogged: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [instrument, setInstrument] = useState(defaultInstrument);
  const [direction, setDirection] = useState<"Long" | "Short">("Long");
  const [result, setResult] = useState<"Win" | "Loss" | "Scratch">("Win");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [pnl, setPnl] = useState("");
  const [rMultiple, setRMultiple] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setInstrument(defaultInstrument);
  }, [defaultInstrument]);

  const reset = () => {
    setEntry("");
    setStop("");
    setTarget("");
    setPnl("");
    setRMultiple("");
    setNotes("");
    setResult("Win");
    setDirection("Long");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await createTrade({
      user_id: user.id,
      date,
      instrument,
      direction,
      entry: Number(entry) || 0,
      stop: Number(stop) || 0,
      target: Number(target) || 0,
      result,
      pnl: pnl === "" ? null : Number(pnl),
      r_multiple: rMultiple === "" ? null : Number(rMultiple),
      notes: notes || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Trade logged");
    reset();
    setOpen(false);
    onLogged();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          className="bg-trade-green text-background hover:bg-trade-green/90 font-data uppercase tracking-wider"
        >
          <Plus className="mr-1 h-4 w-4" />
          New Trade
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Trade</SheetTitle>
          <SheetDescription>Record a trade.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="nt-date">Date</Label>
            <Input
              id="nt-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nt-inst">Instrument</Label>
            <Input
              id="nt-inst"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Direction</Label>
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v as "Long" | "Short")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Long">Long</SelectItem>
                <SelectItem value="Short">Short</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Result</Label>
            <Select
              value={result}
              onValueChange={(v) =>
                setResult(v as "Win" | "Loss" | "Scratch")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Win">Win</SelectItem>
                <SelectItem value="Loss">Loss</SelectItem>
                <SelectItem value="Scratch">Scratch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nt-pnl">P&L ($)</Label>
            <Input
              id="nt-pnl"
              type="number"
              step="0.01"
              value={pnl}
              onChange={(e) => setPnl(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nt-r">R Multiple</Label>
            <Input
              id="nt-r"
              type="number"
              step="0.01"
              value={rMultiple}
              onChange={(e) => setRMultiple(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nt-entry">Entry</Label>
            <Input
              id="nt-entry"
              type="number"
              step="0.01"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nt-stop">Stop</Label>
            <Input
              id="nt-stop"
              type="number"
              step="0.01"
              value={stop}
              onChange={(e) => setStop(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nt-target">Target</Label>
            <Input
              id="nt-target"
              type="number"
              step="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="nt-notes">Notes</Label>
            <Input
              id="nt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <SheetFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-trade-green text-background hover:bg-trade-green/90"
          >
            {submitting ? "Saving..." : "Log Trade"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
