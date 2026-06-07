import { useMemo } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Activity, CalendarRange } from "lucide-react";
import type { Trade } from "@/lib/tradeService";
import { cn } from "@/lib/utils";

interface Props {
  trades: Trade[];
  startingBalance: number;
}

const MIN_TRADES = 30;

type Bucket = { wins: number; losses: number; total: number };
function wr(b: Bucket): number | null {
  const d = b.wins + b.losses;
  return d > 0 ? b.wins / d : null;
}
function emptyBucket(): Bucket {
  return { wins: 0, losses: 0, total: 0 };
}
function tally(b: Bucket, result: string | null) {
  if (result === "Win") {
    b.wins += 1;
    b.total += 1;
  } else if (result === "Loss") {
    b.losses += 1;
    b.total += 1;
  }
}

function wrTone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v >= 0.55) return "text-trade-green";
  if (v >= 0.45) return "text-foreground";
  return "text-trade-red";
}
function barTone(v: number | null, count: number): string {
  if (v == null || count === 0)
    return "bg-muted/30 border-border";
  if (v > 0.65) return "bg-trade-green/20 border-trade-green/40";
  if (v >= 0.5) return "bg-trade-amber/20 border-trade-amber/40";
  return "bg-trade-red/15 border-trade-red/40";
}

export function StreakBehavior({ trades, startingBalance }: Props) {
  const decisive = useMemo(
    () =>
      trades
        .filter((t) => t.result === "Win" || t.result === "Loss")
        .sort((a, b) => {
          const da = new Date(a.date).getTime();
          const db = new Date(b.date).getTime();
          if (da !== db) return da - db;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }),
    [trades],
  );

  const totalDecisive = decisive.length;
  const needed = Math.max(0, MIN_TRADES - totalDecisive);

  // Pre-compute per-trade context: consecutive wins/losses before, drawdown at entry, week index.
  const ctx = useMemo(() => {
    type Row = {
      t: Trade;
      consecWins: number;
      consecLosses: number;
      ddPct: number;
      weekIdx: number;
    };
    const rows: Row[] = [];
    let consecWins = 0;
    let consecLosses = 0;
    let running = startingBalance;
    let peak = startingBalance;
    const firstDate = decisive.length > 0 ? new Date(decisive[0].date).getTime() : 0;
    for (const t of decisive) {
      const ddPct =
        peak > 0 ? Math.max(0, ((peak - running) / peak) * 100) : 0;
      const weekIdx = Math.floor(
        (new Date(t.date).getTime() - firstDate) / (7 * 24 * 60 * 60 * 1000),
      );
      rows.push({ t, consecWins, consecLosses, ddPct, weekIdx });

      // Update streaks AFTER recording context (context = state before this trade)
      if (t.result === "Win") {
        consecWins += 1;
        consecLosses = 0;
      } else if (t.result === "Loss") {
        consecLosses += 1;
        consecWins = 0;
      }
      running += Number(t.pnl ?? 0);
      if (running > peak) peak = running;
    }
    return rows;
  }, [decisive, startingBalance]);

  // --- Post-win / post-loss buckets ---
  const postWin: Record<1 | 2 | 3, Bucket> = { 1: emptyBucket(), 2: emptyBucket(), 3: emptyBucket() };
  const postLoss: Record<1 | 2 | 3, Bucket> = { 1: emptyBucket(), 2: emptyBucket(), 3: emptyBucket() };
  // Baseline
  const baseline: Bucket = emptyBucket();
  for (const row of ctx) {
    tally(baseline, row.t.result);
    if (row.consecWins >= 3) tally(postWin[3], row.t.result);
    else if (row.consecWins === 2) tally(postWin[2], row.t.result);
    else if (row.consecWins === 1) tally(postWin[1], row.t.result);
    if (row.consecLosses >= 3) tally(postLoss[3], row.t.result);
    else if (row.consecLosses === 2) tally(postLoss[2], row.t.result);
    else if (row.consecLosses === 1) tally(postLoss[1], row.t.result);
  }

  // --- Drawdown buckets ---
  type DdKey = "0-5" | "5-10" | "10-20" | "20+";
  const ddBuckets: Record<DdKey, Bucket> = {
    "0-5": emptyBucket(),
    "5-10": emptyBucket(),
    "10-20": emptyBucket(),
    "20+": emptyBucket(),
  };
  for (const row of ctx) {
    const k: DdKey =
      row.ddPct < 5 ? "0-5" : row.ddPct < 10 ? "5-10" : row.ddPct < 20 ? "10-20" : "20+";
    tally(ddBuckets[k], row.t.result);
  }

  // --- Weekly buckets ---
  const maxWeek = ctx.reduce((m, r) => Math.max(m, r.weekIdx), 0);
  const weekly: Bucket[] = Array.from({ length: maxWeek + 1 }, () => emptyBucket());
  for (const row of ctx) tally(weekly[row.weekIdx], row.t.result);

  if (totalDecisive < MIN_TRADES) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
        <Activity className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
          Streak Behavior
        </p>
        <p className="mt-2 text-sm text-foreground font-data">
          Need {needed} more trade{needed === 1 ? "" : "s"} for this analysis.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {totalDecisive} / {MIN_TRADES} trades logged
        </p>
      </div>
    );
  }

  const baselineWr = wr(baseline);

  // Warnings
  const wr2W = wr(postWin[2]);
  const overtradePostWin =
    wr2W != null && baselineWr != null && wr2W < baselineWr - 0.08 && postWin[2].total >= 5;

  const wr2L = wr(postLoss[2]);
  const revengeTrading =
    wr2L != null && baselineWr != null && wr2L < baselineWr - 0.1 && postLoss[2].total >= 5;

  const wr10dd = wr(ddBuckets["10-20"]);
  const wr20dd = wr(ddBuckets["20+"]);
  const ddEdgeLost =
    (wr10dd != null && wr10dd < 0.4 && ddBuckets["10-20"].total >= 3) ||
    (wr20dd != null && wr20dd < 0.4 && ddBuckets["20+"].total >= 3);
  const worstDdWr =
    wr20dd != null && wr20dd < 0.4 ? wr20dd : wr10dd != null && wr10dd < 0.4 ? wr10dd : null;

  // Weekly degradation: compare first half vs second half
  let weeklyNote: string | null = null;
  if (weekly.length >= 4) {
    const mid = Math.floor(weekly.length / 2);
    const first = weekly.slice(0, mid).reduce(
      (acc, b) => ({ wins: acc.wins + b.wins, losses: acc.losses + b.losses, total: acc.total + b.total }),
      emptyBucket(),
    );
    const second = weekly.slice(mid).reduce(
      (acc, b) => ({ wins: acc.wins + b.wins, losses: acc.losses + b.losses, total: acc.total + b.total }),
      emptyBucket(),
    );
    const fw = wr(first);
    const sw = wr(second);
    if (fw != null && sw != null && first.total >= 5 && second.total >= 5) {
      const diff = (sw - fw) * 100;
      if (Math.abs(diff) >= 10) {
        weeklyNote =
          diff < 0
            ? `Performance degrades over time — your win rate dropped ${Math.abs(diff).toFixed(0)} points from the first to the second half of your trading history. Possible fatigue.`
            : `Performance improves over time — your win rate is up ${diff.toFixed(0)} points from the first to the second half. Keep going.`;
      }
    }
  }

  return (
    <section className="space-y-4">
      {/* Section 1: Post-Win Behavior */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Post-Win Behavior
          </h2>
        </div>

        <ul className="space-y-2 text-xs font-data">
          {([1, 2, 3] as const).map((n) => {
            const v = wr(postWin[n]);
            const c = postWin[n].total;
            return (
              <li key={n} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  After {n} win{n > 1 ? "s" : ""} in a row
                </span>
                <span className={cn("font-semibold", wrTone(v))}>
                  {v != null ? `${Math.round(v * 100)}% win rate` : "—"}
                  <span className="ml-1.5 text-[10px] text-muted-foreground">({c})</span>
                </span>
              </li>
            );
          })}
        </ul>

        {overtradePostWin && wr2W != null && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-trade-amber/40 bg-trade-amber/10 p-3 text-xs leading-snug text-trade-amber">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              You tend to overtrade after wins — your win rate after 2 wins drops to{" "}
              {Math.round(wr2W * 100)}%. Consider a mandatory 30-min break after 2 consecutive wins.
            </span>
          </div>
        )}
      </div>

      {/* Section 2: Post-Loss Behavior */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Post-Loss Behavior
          </h2>
        </div>

        <ul className="space-y-2 text-xs font-data">
          {([1, 2, 3] as const).map((n) => {
            const v = wr(postLoss[n]);
            const c = postLoss[n].total;
            return (
              <li key={n} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  After {n} loss{n > 1 ? "es" : ""} in a row
                </span>
                <span className={cn("font-semibold", wrTone(v))}>
                  {v != null ? `${Math.round(v * 100)}% win rate` : "—"}
                  <span className="ml-1.5 text-[10px] text-muted-foreground">({c})</span>
                </span>
              </li>
            );
          })}
        </ul>

        {revengeTrading && wr2L != null && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-trade-red/40 bg-trade-red/10 p-3 text-xs leading-snug text-trade-red">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Revenge trading detected — your win rate after 2 losses is only{" "}
              {Math.round(wr2L * 100)}%. Stop for the day.
            </span>
          </div>
        )}
      </div>

      {/* Section 3: Drawdown Behavior */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Drawdown Behavior
          </h2>
        </div>

        <div className="space-y-2">
          {(["0-5", "5-10", "10-20", "20+"] as const).map((k) => {
            const v = wr(ddBuckets[k]);
            const c = ddBuckets[k].total;
            const maxC = Math.max(1, ...Object.values(ddBuckets).map((b) => b.total));
            const widthPct = (c / maxC) * 100;
            return (
              <div key={k} className="flex items-center gap-2">
                <span className="w-20 text-[11px] font-data text-muted-foreground">
                  {k}% down
                </span>
                <div className="relative h-6 flex-1 rounded-md bg-background/40 border border-border overflow-hidden">
                  <div
                    className={cn("absolute inset-y-0 left-0 border-r", barTone(v, c))}
                    style={{ width: `${Math.max(widthPct, c > 0 ? 6 : 0)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-data">
                    <span className="text-foreground/80">{c} trades</span>
                    <span className="text-foreground/80">
                      {v != null ? `${Math.round(v * 100)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {ddEdgeLost && worstDdWr != null && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-trade-red/40 bg-trade-red/10 p-3 text-xs leading-snug text-trade-red">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Your edge disappears when you're down 10%+ (win rate {Math.round(worstDdWr * 100)}%).
              Hard stop at 10% drawdown.
            </span>
          </div>
        )}
      </div>

      {/* Section 4: Weekly Patterns */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Weekly Patterns
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          {weekly.map((b, i) => {
            const v = wr(b);
            const maxC = Math.max(1, ...weekly.map((x) => x.total));
            const widthPct = (b.total / maxC) * 100;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-14 text-[11px] font-data text-muted-foreground">
                  Week {i + 1}
                </span>
                <div className="relative h-5 flex-1 rounded-md bg-background/40 border border-border overflow-hidden">
                  <div
                    className={cn("absolute inset-y-0 left-0 border-r", barTone(v, b.total))}
                    style={{ width: `${Math.max(widthPct, b.total > 0 ? 6 : 0)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-data">
                    <span className="text-foreground/80">{b.total}</span>
                    <span className="text-foreground/80">
                      {v != null ? `${Math.round(v * 100)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {weeklyNote && (
          <p className="mt-3 text-xs font-data text-muted-foreground">{weeklyNote}</p>
        )}
      </div>
    </section>
  );
}