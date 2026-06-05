import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { TradeDetailSheet } from "@/components/TradeDetailSheet";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getTrades, type Trade } from "@/lib/tradeService";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Calendar" },
      { name: "description", content: "Monthly trading calendar with daily P&L." },
      { property: "og:title", content: "EdgeTrader — Calendar" },
      { property: "og:description", content: "Monthly trading calendar with daily P&L." },
    ],
  }),
  component: CalendarRoute,
});

function CalendarRoute() {
  return (
    <ProtectedRoute>
      <CalendarScreen />
    </ProtectedRoute>
  );
}

function fmtMoney(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtMoneyFull(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);
}

function CalendarScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useUserSettings();
  const currentBalance = Number(settings?.current_balance ?? 100);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    // Pull up to 500 trades (enough to fill many months)
    getTrades(userId, 500, 0).then((res) => {
      if (!active) return;
      setTrades(res.data ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  // Group trades by ISO date, scoped to month for stats.
  const monthData = useMemo(() => {
    const { y, m } = cursor;
    const startISO = isoDate(y, m, 1);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const endISO = isoDate(y, m, lastDay);

    const monthTrades = trades.filter(
      (t) => t.date >= startISO && t.date <= endISO,
    );

    const byDate = new Map<string, { pnl: number; trades: Trade[] }>();
    for (const t of monthTrades) {
      const e = byDate.get(t.date) ?? { pnl: 0, trades: [] };
      e.pnl += Number(t.pnl ?? 0);
      e.trades.push(t);
      byDate.set(t.date, e);
    }

    let tradingDays = 0;
    let greenDays = 0;
    let redDays = 0;
    let bestDay: { date: string; pnl: number } | null = null;
    let worstDay: { date: string; pnl: number } | null = null;
    for (const [date, { pnl }] of byDate) {
      tradingDays += 1;
      if (pnl > 0) greenDays += 1;
      else if (pnl < 0) redDays += 1;
      if (!bestDay || pnl > bestDay.pnl) bestDay = { date, pnl };
      if (!worstDay || pnl < worstDay.pnl) worstDay = { date, pnl };
    }

    return {
      byDate,
      tradingDays,
      greenDays,
      redDays,
      bestDay,
      worstDay,
      lastDay,
      firstWeekday: new Date(y, m, 1).getDay(),
    };
  }, [trades, cursor]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const goPrev = () =>
    setCursor(({ y, m }) =>
      m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 },
    );
  const goNext = () =>
    setCursor(({ y, m }) =>
      m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 },
    );
  const goToday = () => {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  // Build grid cells (lead + days, no trailing — just fill week)
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < monthData.firstWeekday; i++) {
    cells.push({ date: null, day: null });
  }
  for (let d = 1; d <= monthData.lastDay; d++) {
    cells.push({ date: isoDate(cursor.y, cursor.m, d), day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });

  const todayISO = (() => {
    const d = new Date();
    return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  })();

  const dayTrades = selectedDate
    ? (monthData.byDate.get(selectedDate)?.trades ?? []).slice().sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      )
    : [];
  const dayPnl = selectedDate
    ? (monthData.byDate.get(selectedDate)?.pnl ?? 0)
    : 0;

  return (
    <>
      <AppHeader balance={currentBalance} />
      <div className="px-4 pt-4 pb-24 lg:px-6 max-w-3xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/trade-log"
            className="inline-flex items-center gap-1 text-xs font-data uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Trade Log
          </Link>
          <Button variant="ghost" size="sm" onClick={goToday} className="font-data text-xs uppercase tracking-wider">
            Today
          </Button>
        </div>

        {/* Month header */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={goPrev}
            className="p-2 rounded-full hover:bg-muted/40"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-heading text-xl font-bold">{monthLabel}</h1>
          <button
            onClick={goNext}
            className="p-2 rounded-full hover:bg-muted/40"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <LoadingSpinner label="Loading calendar..." />
          </div>
        ) : (
          <>
            {/* Weekday headings */}
            <div className="grid grid-cols-7 gap-1 mb-1 text-[10px] uppercase tracking-wider font-data text-muted-foreground">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="text-center py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (!cell.date) {
                  return <div key={i} className="aspect-square" />;
                }
                const entry = monthData.byDate.get(cell.date);
                const pnl = entry?.pnl ?? 0;
                const hasTrades = !!entry;
                const isBest = monthData.bestDay?.date === cell.date && pnl > 0;
                const isWorst = monthData.worstDay?.date === cell.date && pnl < 0;
                const isToday = cell.date === todayISO;
                const isSelected = cell.date === selectedDate;

                const colorClass = !hasTrades
                  ? "text-muted-foreground"
                  : pnl > 0
                    ? "text-trade-green"
                    : pnl < 0
                      ? "text-trade-red"
                      : "text-muted-foreground";

                const dotClass = !hasTrades
                  ? "bg-muted-foreground/30"
                  : pnl > 0
                    ? "bg-trade-green"
                    : pnl < 0
                      ? "bg-trade-red"
                      : "bg-muted-foreground/50";

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedDate(cell.date)}
                    className={cn(
                      "relative aspect-square rounded-lg border text-left p-1.5 transition-colors flex flex-col",
                      "border-border bg-card hover:bg-muted/30",
                      isSelected && "ring-2 ring-trade-green",
                      isBest && "border-trade-green/60 bg-trade-green/10",
                      isWorst && "border-trade-red/60 bg-trade-red/10",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[11px] font-data leading-none",
                        isToday ? "font-bold text-foreground" : "text-foreground/80",
                      )}
                    >
                      {cell.day}
                    </span>
                    <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
                      <span className={cn("h-1.5 w-6 rounded-full", dotClass)} />
                      {hasTrades && (
                        <span className={cn("text-[10px] font-data font-semibold leading-none mt-1", colorClass)}>
                          {pnl >= 0 ? "+" : ""}
                          {fmtMoney(pnl)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Summary */}
            <div className="mt-5 rounded-xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data mb-3">
                {monthLabel} Summary
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <SummaryStat
                  label="Trading days"
                  value={String(monthData.tradingDays)}
                />
                <SummaryStat
                  label="Green days"
                  value={String(monthData.greenDays)}
                  accent="green"
                />
                <SummaryStat
                  label="Red days"
                  value={String(monthData.redDays)}
                  accent="red"
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <HighlightCard
                  label="Best day"
                  date={monthData.bestDay?.date ?? null}
                  pnl={monthData.bestDay?.pnl ?? null}
                  accent="green"
                />
                <HighlightCard
                  label="Worst day"
                  date={monthData.worstDay?.date ?? null}
                  pnl={monthData.worstDay?.pnl ?? null}
                  accent="red"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Day trades sheet */}
      <Sheet
        open={selectedDate != null}
        onOpenChange={(o) => !o && setSelectedDate(null)}
      >
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading">
              {selectedDate ? formatLongDate(selectedDate) : ""}
            </SheetTitle>
            {selectedDate && (
              <p className={cn(
                "text-sm font-data",
                dayPnl > 0
                  ? "text-trade-green"
                  : dayPnl < 0
                    ? "text-trade-red"
                    : "text-muted-foreground",
              )}>
                {dayTrades.length} {dayTrades.length === 1 ? "trade" : "trades"} ·{" "}
                {dayPnl >= 0 ? "+" : ""}
                {fmtMoneyFull(dayPnl)}
              </p>
            )}
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {dayTrades.length === 0 ? (
              <p className="text-sm text-muted-foreground font-data text-center py-8">
                No trades on this day.
              </p>
            ) : (
              dayTrades.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTrade(t);
                    setDetailOpen(true);
                  }}
                  className="w-full text-left rounded-xl border border-border bg-card p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-data font-semibold text-sm">
                        {t.instrument}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-data uppercase tracking-wider rounded-full border px-2 py-0.5",
                          t.direction === "Long"
                            ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/40",
                        )}
                      >
                        {t.direction}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-data uppercase tracking-wider rounded-full border px-2 py-0.5",
                          t.result === "Win"
                            ? "bg-trade-green/15 text-trade-green border-trade-green/40"
                            : t.result === "Loss"
                              ? "bg-trade-red/15 text-trade-red border-trade-red/40"
                              : "bg-muted text-muted-foreground border-border",
                        )}
                      >
                        {t.result}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "font-data font-semibold text-sm",
                        Number(t.pnl ?? 0) > 0
                          ? "text-trade-green"
                          : Number(t.pnl ?? 0) < 0
                            ? "text-trade-red"
                            : "text-muted-foreground",
                      )}
                    >
                      {Number(t.pnl ?? 0) >= 0 ? "+" : ""}
                      {fmtMoneyFull(Number(t.pnl ?? 0))}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <TradeDetailSheet
        trade={selectedTrade}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "red";
}) {
  const color =
    accent === "green"
      ? "text-trade-green"
      : accent === "red"
        ? "text-trade-red"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {label}
      </div>
      <div className={cn("mt-1 font-data text-xl font-semibold", color)}>
        {value}
      </div>
    </div>
  );
}

function HighlightCard({
  label,
  date,
  pnl,
  accent,
}: {
  label: string;
  date: string | null;
  pnl: number | null;
  accent: "green" | "red";
}) {
  const has = date != null && pnl != null && pnl !== 0;
  const color = accent === "green" ? "text-trade-green" : "text-trade-red";
  const border = accent === "green" ? "border-trade-green/40" : "border-trade-red/40";
  const bg = accent === "green" ? "bg-trade-green/5" : "bg-trade-red/5";
  return (
    <div className={cn("rounded-lg border p-3", has ? `${border} ${bg}` : "border-border bg-background/40")}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {label}
      </div>
      {has ? (
        <>
          <div className={cn("mt-1 font-data text-lg font-semibold", color)}>
            {pnl! >= 0 ? "+" : ""}
            {fmtMoneyFull(pnl!)}
          </div>
          <div className="text-[10px] text-muted-foreground font-data mt-0.5">
            {formatShortDate(date!)}
          </div>
        </>
      ) : (
        <div className="mt-1 font-data text-sm text-muted-foreground">—</div>
      )}
    </div>
  );
}

function isoDate(y: number, m: number, d: number) {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function formatLongDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}