import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Sparkles, TrendingUp, TrendingDown, Calendar as CalendarIcon } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { getTrades, type Trade } from "@/lib/tradeService";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { generateWeeklyInsight } from "@/lib/api/weeklyInsight.functions";
import { EMOTIONS, type EmotionState } from "@/lib/journalService";

export const Route = createFileRoute("/weekly-report")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Weekly Report" },
      { name: "description", content: "Auto-generated weekly trading review with AI insight." },
    ],
  }),
  component: WeeklyReportPage,
});

function WeeklyReportPage() {
  return (
    <ProtectedRoute>
      <WeeklyReport />
    </ProtectedRoute>
  );
}

type JournalRow = {
  trade_id: string;
  emotion: string | null;
};

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  date.setDate(date.getDate() - diff);
  return date;
}

function endOfWeek(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtUSD(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtRange(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}, ${end.getFullYear()}`;
}

function tradesInRange(trades: Trade[], start: Date, end: Date): Trade[] {
  const s = isoDate(start);
  const e = isoDate(end);
  return trades.filter((t) => t.date >= s && t.date <= e);
}

type WeekStats = {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  totalR: number;
  ev: number;
  daysTraded: number;
  bestSetup: { instrument: string; r: number } | null;
  worstSetup: { instrument: string; r: number } | null;
};

function computeWeekStats(trades: Trade[]): WeekStats {
  const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
  const wins = trades.filter((t) => t.result === "Win").length;
  const losses = trades.filter((t) => t.result === "Loss").length;
  const decided = wins + losses;
  const winRate = decided > 0 ? wins / decided : 0;
  const netPnl = trades.reduce((a, t) => a + num(t.pnl), 0);
  const totalR = trades.reduce((a, t) => a + num(t.r_multiple), 0);
  const winsPnl = trades.filter((t) => t.result === "Win").map((t) => num(t.pnl));
  const lossesPnl = trades.filter((t) => t.result === "Loss").map((t) => num(t.pnl));
  const avgWin = winsPnl.length > 0 ? winsPnl.reduce((a, b) => a + b, 0) / winsPnl.length : 0;
  const avgLoss = lossesPnl.length > 0 ? lossesPnl.reduce((a, b) => a + b, 0) / lossesPnl.length : 0;
  const ev = decided > 0 ? (wins / decided) * avgWin + (losses / decided) * avgLoss : 0;

  const dayset = new Set(trades.map((t) => t.date));
  const daysTraded = dayset.size;

  // Group R by instrument for best/worst "setup"
  const byInstrument = new Map<string, number>();
  trades.forEach((t) => {
    const key = t.instrument || "—";
    byInstrument.set(key, (byInstrument.get(key) ?? 0) + num(t.r_multiple));
  });
  let bestSetup: { instrument: string; r: number } | null = null;
  let worstSetup: { instrument: string; r: number } | null = null;
  byInstrument.forEach((r, instrument) => {
    if (bestSetup == null || r > bestSetup.r) bestSetup = { instrument, r };
    if (worstSetup == null || r < worstSetup.r) worstSetup = { instrument, r };
  });
  if (bestSetup && bestSetup.r <= 0) bestSetup = null;
  if (worstSetup && worstSetup.r >= 0) worstSetup = null;

  return {
    count: trades.length,
    wins,
    losses,
    winRate,
    netPnl,
    totalR,
    ev,
    daysTraded,
    bestSetup,
    worstSetup,
  };
}

function WeeklyReport() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [trades, setTrades] = useState<Trade[]>([]);
  const [journals, setJournals] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string>("");
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    (async () => {
      const [tRes, jRes] = await Promise.all([
        getTrades(userId, 500, 0),
        supabase
          .from("trade_journals")
          .select("trade_id, emotion")
          .eq("user_id", userId),
      ]);
      if (!active) return;
      setTrades(tRes.data ?? []);
      setJournals((jRes.data as JournalRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const now = useMemo(() => new Date(), []);
  const thisMonday = useMemo(() => startOfWeek(now), [now]);
  const thisSunday = useMemo(() => endOfWeek(thisMonday), [thisMonday]);
  const lastMonday = useMemo(() => {
    const d = new Date(thisMonday);
    d.setDate(d.getDate() - 7);
    return d;
  }, [thisMonday]);
  const lastSunday = useMemo(() => endOfWeek(lastMonday), [lastMonday]);

  const thisWeekTrades = useMemo(
    () => tradesInRange(trades, thisMonday, thisSunday),
    [trades, thisMonday, thisSunday],
  );
  const lastWeekTrades = useMemo(
    () => tradesInRange(trades, lastMonday, lastSunday),
    [trades, lastMonday, lastSunday],
  );

  const stats = useMemo(() => computeWeekStats(thisWeekTrades), [thisWeekTrades]);
  const lastStats = useMemo(() => computeWeekStats(lastWeekTrades), [lastWeekTrades]);

  const evDelta = stats.ev - lastStats.ev;

  const daysSkipped = 7 - stats.daysTraded;

  // Emotional breakdown from journals filtered to this week's trades.
  const emotionBreakdown = useMemo(() => {
    const tradeIds = new Set(thisWeekTrades.map((t) => t.id));
    const counts = new Map<EmotionState, number>();
    EMOTIONS.forEach((e) => counts.set(e, 0));
    let total = 0;
    journals.forEach((j) => {
      if (!tradeIds.has(j.trade_id) || !j.emotion) return;
      const key = j.emotion as EmotionState;
      if (counts.has(key)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        total += 1;
      }
    });
    return { counts, total };
  }, [journals, thisWeekTrades]);

  // Fetch AI insight after data loads.
  useEffect(() => {
    if (loading) return;
    if (stats.count === 0) {
      setInsight("No trades logged this week — log a few to unlock weekly insights.");
      return;
    }
    let active = true;
    setInsightLoading(true);
    const summary = buildSummaryPrompt(stats, lastStats, emotionBreakdown);
    generateWeeklyInsight({ data: { summary } })
      .then((r) => {
        if (!active) return;
        setInsight(r.insight);
      })
      .catch((e) => {
        if (!active) return;
        setInsight(`AI insight error: ${e instanceof Error ? e.message : "unknown"}`);
      })
      .finally(() => {
        if (active) setInsightLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, stats.count, stats.netPnl, stats.totalR, lastStats.ev, emotionBreakdown.total]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground font-data hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <div className="text-xs text-muted-foreground font-data inline-flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            {fmtRange(thisMonday, thisSunday)}
          </div>
        </div>

        <header>
          <h1 className="font-heading text-2xl font-bold tracking-tight">This Week</h1>
          <p className="font-data text-sm text-muted-foreground mt-1">
            Auto-generated review of Monday – Sunday performance.
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner label="Building report…" />
          </div>
        ) : (
          <>
            <InsightCard insight={insight} loading={insightLoading} />

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Trades" value={String(stats.count)} />
              <Stat
                label="Win Rate"
                value={`${(stats.winRate * 100).toFixed(0)}%`}
              />
              <Stat
                label="Net P&L"
                value={fmtUSD(stats.netPnl)}
                accent={stats.netPnl >= 0 ? "green" : "red"}
              />
              <Stat
                label="Total R"
                value={`${stats.totalR.toFixed(2)}R`}
                accent={stats.totalR >= 0 ? "green" : "red"}
              />
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <HighlightCard
                title="Best Setup"
                icon={<TrendingUp className="h-4 w-4 text-trade-green" />}
                accent="green"
                primary={stats.bestSetup ? stats.bestSetup.instrument : "—"}
                secondary={
                  stats.bestSetup
                    ? `+${stats.bestSetup.r.toFixed(2)}R earned`
                    : "No winning instrument this week"
                }
              />
              <HighlightCard
                title="Biggest Mistake"
                icon={<TrendingDown className="h-4 w-4 text-trade-red" />}
                accent="red"
                primary={stats.worstSetup ? stats.worstSetup.instrument : "—"}
                secondary={
                  stats.worstSetup
                    ? `${stats.worstSetup.r.toFixed(2)}R lost`
                    : "No losing instrument this week"
                }
              />
            </section>

            <EVComparisonCard
              thisEV={stats.ev}
              lastEV={lastStats.ev}
              delta={evDelta}
            />

            <DaysCard daysTraded={stats.daysTraded} daysSkipped={daysSkipped} />

            <EmotionBreakdownCard
              counts={emotionBreakdown.counts}
              total={emotionBreakdown.total}
            />
          </>
        )}
      </main>
    </div>
  );
}

function buildSummaryPrompt(
  stats: WeekStats,
  lastStats: WeekStats,
  emotion: { counts: Map<EmotionState, number>; total: number },
): string {
  const emoLines = Array.from(emotion.counts.entries())
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(", ");
  return [
    `This week: ${stats.count} trades, ${stats.wins}W/${stats.losses}L, winRate=${(stats.winRate * 100).toFixed(0)}%, netPnL=${stats.netPnl.toFixed(2)}, totalR=${stats.totalR.toFixed(2)}, EV/trade=${stats.ev.toFixed(2)}, daysTraded=${stats.daysTraded}/7.`,
    stats.bestSetup ? `Best instrument: ${stats.bestSetup.instrument} +${stats.bestSetup.r.toFixed(2)}R.` : "",
    stats.worstSetup ? `Worst instrument: ${stats.worstSetup.instrument} ${stats.worstSetup.r.toFixed(2)}R.` : "",
    `Last week EV/trade=${lastStats.ev.toFixed(2)}, netPnL=${lastStats.netPnl.toFixed(2)}.`,
    emotion.total > 0 ? `Emotional states logged: ${emoLines}.` : "No journal entries this week.",
  ]
    .filter(Boolean)
    .join(" ");
}

function InsightCard({ insight, loading }: { insight: string; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-trade-green/30 bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[2px] text-muted-foreground font-data">
        <Sparkles className="h-3.5 w-3.5 text-trade-green" />
        AI Insight
      </div>
      <div className="mt-2 font-data text-sm leading-relaxed text-foreground min-h-[2.5rem]">
        {loading ? (
          <span className="text-muted-foreground">Analysing your week…</span>
        ) : (
          insight || "—"
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: string;
  accent?: "default" | "green" | "red";
}) {
  const color =
    accent === "green"
      ? "text-trade-green"
      : accent === "red"
        ? "text-trade-red"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {label}
      </div>
      <div className={`mt-1 font-data text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function HighlightCard({
  title,
  icon,
  accent,
  primary,
  secondary,
}: {
  title: string;
  icon: React.ReactNode;
  accent: "green" | "red";
  primary: string;
  secondary: string;
}) {
  const border = accent === "green" ? "border-trade-green/30" : "border-trade-red/30";
  const color = accent === "green" ? "text-trade-green" : "text-trade-red";
  return (
    <div className={`rounded-2xl border ${border} bg-card p-4`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[2px] text-muted-foreground font-data">
        {icon}
        {title}
      </div>
      <div className="mt-2 font-data text-lg font-semibold">{primary}</div>
      <div className={`mt-1 font-data text-xs ${color}`}>{secondary}</div>
    </div>
  );
}

function EVComparisonCard({
  thisEV,
  lastEV,
  delta,
}: {
  thisEV: number;
  lastEV: number;
  delta: number;
}) {
  const up = delta >= 0;
  const color = up ? "text-trade-green" : "text-trade-red";
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
        EV vs Last Week
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground font-data">This Week</div>
          <div className="mt-1 font-data text-lg font-semibold">{fmtUSD(thisEV)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground font-data">Last Week</div>
          <div className="mt-1 font-data text-lg font-semibold text-muted-foreground">
            {fmtUSD(lastEV)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground font-data">Delta</div>
          <div className={`mt-1 font-data text-lg font-semibold ${color}`}>
            {up ? "+" : "−"}
            {fmtUSD(Math.abs(delta))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DaysCard({
  daysTraded,
  daysSkipped,
}: {
  daysTraded: number;
  daysSkipped: number;
}) {
  const pct = (daysTraded / 7) * 100;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
          Activity
        </div>
        <div className="font-data text-xs text-muted-foreground">
          {daysTraded} traded · {daysSkipped} skipped
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-trade-green transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 font-data text-sm">
        Traded <span className="text-trade-green font-semibold">{daysTraded}</span> of 7 days
      </div>
    </section>
  );
}

function EmotionBreakdownCard({
  counts,
  total,
}: {
  counts: Map<EmotionState, number>;
  total: number;
}) {
  const colorFor = (e: EmotionState) => {
    switch (e) {
      case "Calm":
      case "Confident":
        return "bg-trade-green";
      case "Anxious":
      case "Impatient":
        return "bg-trade-amber";
      case "Revenge":
      case "FOMO":
        return "bg-trade-red";
      default:
        return "bg-muted";
    }
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
        Emotional State (from journals)
      </div>
      {total === 0 ? (
        <div className="mt-3 font-data text-sm text-muted-foreground">
          No journal entries this week.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {EMOTIONS.map((e) => {
            const n = counts.get(e) ?? 0;
            const pct = total > 0 ? (n / total) * 100 : 0;
            return (
              <div key={e}>
                <div className="flex justify-between font-data text-xs">
                  <span>{e}</span>
                  <span className="text-muted-foreground">
                    {n} · {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${colorFor(e)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}