import { useMemo, useState } from "react";
import { AlertTriangle, Clock, CalendarDays, Hash } from "lucide-react";
import type { Trade } from "@/lib/tradeService";
import { cn } from "@/lib/utils";
import { computeOverrideStats, type BehaviorAlertType } from "@/lib/behaviorAlerts";

interface Props {
  trades: Trade[];
}

// Convert a UTC timestamp to a CT hour (0-23) using America/Chicago.
function ctHourOf(iso: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(h) % 24;
}

// 0=Sun..6=Sat in CT
function ctDowOf(iso: string): number {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

function ctDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

function wrColor(wr: number | null, count: number): string {
  if (wr == null || count === 0) return "bg-muted/30 text-muted-foreground border-border";
  if (wr > 0.65) return "bg-trade-green/20 text-trade-green border-trade-green/40";
  if (wr >= 0.5) return "bg-trade-amber/20 text-trade-amber border-trade-amber/40";
  return "bg-trade-red/15 text-trade-red border-trade-red/40";
}

type Bucket = { wins: number; losses: number; total: number };

function bucketWr(b: Bucket | undefined): number | null {
  if (!b) return null;
  const decided = b.wins + b.losses;
  return decided > 0 ? b.wins / decided : null;
}

export function BehaviorAnalytics({ trades }: Props) {
  const decisive = useMemo(
    () => trades.filter((t) => t.result === "Win" || t.result === "Loss"),
    [trades],
  );

  // ---------- Hour aggregation ----------
  const hourBuckets = useMemo(() => {
    const m = new Map<number, Bucket>();
    for (const t of decisive) {
      const h = ctHourOf(t.created_at);
      const b = m.get(h) ?? { wins: 0, losses: 0, total: 0 };
      b.total += 1;
      if (t.result === "Win") b.wins += 1;
      else b.losses += 1;
      m.set(h, b);
    }
    return m;
  }, [decisive]);

  const tradingHours = Array.from({ length: 8 }, (_, i) => i + 8); // 8..15 CT
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const selectedHourTrades = useMemo(
    () =>
      selectedHour == null
        ? []
        : trades
            .filter((t) => ctHourOf(t.created_at) === selectedHour)
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            ),
    [selectedHour, trades],
  );

  const tradingHourEntries = tradingHours
    .map((h) => ({ h, wr: bucketWr(hourBuckets.get(h)), count: hourBuckets.get(h)?.total ?? 0 }))
    .filter((e) => e.count >= 2 && e.wr != null);

  const bestHour = tradingHourEntries
    .slice()
    .sort((a, b) => (b.wr! - a.wr!) || (b.count - a.count))[0];
  const worstHour = tradingHourEntries
    .slice()
    .sort((a, b) => (a.wr! - b.wr!) || (b.count - a.count))[0];

  const goodHours = tradingHourEntries
    .filter((e) => (e.wr ?? 0) >= 0.5)
    .sort((a, b) => a.h - b.h);
  const recRange =
    goodHours.length > 0
      ? `${hourLabel(goodHours[0].h)} – ${hourLabel(goodHours[goodHours.length - 1].h + 1)} CT`
      : null;

  // ---------- Day-of-week aggregation ----------
  const dowBuckets = useMemo(() => {
    const m = new Map<number, Bucket>();
    for (const t of decisive) {
      const d = ctDowOf(t.created_at);
      const b = m.get(d) ?? { wins: 0, losses: 0, total: 0 };
      b.total += 1;
      if (t.result === "Win") b.wins += 1;
      else b.losses += 1;
      m.set(d, b);
    }
    return m;
  }, [decisive]);

  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const weekdayEntries = [1, 2, 3, 4, 5].map((d, i) => ({
    d,
    name: weekdayNames[i],
    wr: bucketWr(dowBuckets.get(d)),
    count: dowBuckets.get(d)?.total ?? 0,
  }));
  const maxDowCount = Math.max(1, ...weekdayEntries.map((e) => e.count));
  const dowWithData = weekdayEntries.filter((e) => e.count >= 2 && e.wr != null);
  const bestDow = dowWithData.slice().sort((a, b) => b.wr! - a.wr!)[0];
  const worstDow = dowWithData.slice().sort((a, b) => a.wr! - b.wr!)[0];

  // ---------- Trade-number-in-session aggregation ----------
  const sessionBuckets = useMemo(() => {
    // Group trades by CT date, order by created_at, assign session_trade_number.
    const byDay = new Map<string, Trade[]>();
    for (const t of trades) {
      const k = ctDateKey(t.created_at);
      const arr = byDay.get(k) ?? [];
      arr.push(t);
      byDay.set(k, arr);
    }
    const buckets: Record<"1" | "2" | "3+", Bucket> = {
      "1": { wins: 0, losses: 0, total: 0 },
      "2": { wins: 0, losses: 0, total: 0 },
      "3+": { wins: 0, losses: 0, total: 0 },
    };
    for (const [, arr] of byDay) {
      arr.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      arr.forEach((t, i) => {
        if (t.result !== "Win" && t.result !== "Loss") return;
        const key: "1" | "2" | "3+" = i === 0 ? "1" : i === 1 ? "2" : "3+";
        const b = buckets[key];
        b.total += 1;
        if (t.result === "Win") b.wins += 1;
        else b.losses += 1;
      });
    }
    return buckets;
  }, [trades]);

  const sessionEntries = (["1", "2", "3+"] as const).map((k) => ({
    key: k,
    label: k === "1" ? "1st trade" : k === "2" ? "2nd trade" : "3rd+ trade",
    wr: bucketWr(sessionBuckets[k]),
    count: sessionBuckets[k].total,
  }));
  const maxSessCount = Math.max(1, ...sessionEntries.map((e) => e.count));
  const thirdWr = sessionEntries[2].wr;
  const thirdCount = sessionEntries[2].count;

  if (decisive.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground font-data">
          Log a few trades to unlock behavioral analytics.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {/* Section 1: Time-of-Day Heatmap */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Time of Day · CT
          </h2>
        </div>

        <div className="grid grid-cols-12 gap-1">
          {Array.from({ length: 24 }, (_, h) => h).map((h) => {
            const isTrading = h >= 8 && h <= 15;
            const b = hourBuckets.get(h);
            const wr = bucketWr(b);
            const count = b?.total ?? 0;
            const active = selectedHour === h;
            return (
              <button
                key={h}
                type="button"
                disabled={!isTrading}
                onClick={() => setSelectedHour((prev) => (prev === h ? null : h))}
                className={cn(
                  "aspect-square rounded-md border text-[9px] font-data flex flex-col items-center justify-center leading-tight transition-all",
                  isTrading
                    ? wrColor(wr, count)
                    : "bg-background/40 text-muted-foreground/40 border-border/40 cursor-not-allowed",
                  active && "ring-2 ring-foreground/60",
                )}
                aria-label={`Hour ${h} CT`}
              >
                <span className="font-semibold">{h}</span>
                {isTrading && count > 0 && (
                  <span>{wr != null ? `${Math.round(wr * 100)}%` : "—"}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected hour list */}
        {selectedHour != null && (
          <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] font-data uppercase tracking-wider text-muted-foreground">
              <span>Trades at {hourLabel(selectedHour)} CT</span>
              <button
                onClick={() => setSelectedHour(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            {selectedHourTrades.length === 0 ? (
              <p className="text-xs text-muted-foreground">No trades at this hour.</p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {selectedHourTrades.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between text-xs font-data"
                  >
                    <span className="text-muted-foreground">
                      {t.date} · {t.instrument}
                    </span>
                    <span
                      className={cn(
                        t.result === "Win" && "text-trade-green",
                        t.result === "Loss" && "text-trade-red",
                      )}
                    >
                      {t.result}
                      {t.pnl != null && (
                        <span className="ml-2 text-muted-foreground">
                          {Number(t.pnl) >= 0 ? "+" : ""}
                          {Number(t.pnl).toFixed(2)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3 space-y-1 text-xs font-data">
          {bestHour ? (
            <p className="text-trade-green">
              Your best hour: {hourLabel(bestHour.h)} CT (
              {Math.round((bestHour.wr ?? 0) * 100)}% win rate)
            </p>
          ) : (
            <p className="text-muted-foreground">Need more trades for a best-hour read.</p>
          )}
          {worstHour && worstHour.h !== bestHour?.h && (
            <p className="text-trade-red">
              Your worst hour: {hourLabel(worstHour.h)} CT (
              {Math.round((worstHour.wr ?? 0) * 100)}% win rate)
            </p>
          )}
          {recRange && (
            <p className="text-muted-foreground">
              Recommendation: Only trade between {recRange}.
            </p>
          )}
        </div>
      </div>

      {/* Section 2: Day of Week */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Day of Week
          </h2>
        </div>

        <div className="space-y-2">
          {weekdayEntries.map((e) => {
            const widthPct = (e.count / maxDowCount) * 100;
            const tone = wrColor(e.wr, e.count);
            return (
              <div key={e.d} className="flex items-center gap-2">
                <span className="w-8 text-[11px] font-data text-muted-foreground">
                  {e.name}
                </span>
                <div className="relative h-6 flex-1 rounded-md bg-background/40 border border-border overflow-hidden">
                  <div
                    className={cn("absolute inset-y-0 left-0 border-r", tone)}
                    style={{ width: `${Math.max(widthPct, e.count > 0 ? 6 : 0)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-data">
                    <span className="text-foreground/80">{e.count} trades</span>
                    <span className="text-foreground/80">
                      {e.wr != null ? `${Math.round(e.wr * 100)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 space-y-1 text-xs font-data">
          {bestDow && (
            <p className="text-trade-green">
              Best day: {weekdayNames[bestDow.d - 1]} (
              {Math.round((bestDow.wr ?? 0) * 100)}% win rate)
            </p>
          )}
          {worstDow && worstDow.d !== bestDow?.d && (
            <p className="text-trade-red">
              Worst day: {weekdayNames[worstDow.d - 1]} (
              {Math.round((worstDow.wr ?? 0) * 100)}% win rate)
            </p>
          )}
          {worstDow && (worstDow.wr ?? 1) < 0.4 && worstDow.count >= 3 && (
            <p className="text-muted-foreground">
              Consider skipping {weekdayNames[worstDow.d - 1]} — your win rate is only{" "}
              {Math.round((worstDow.wr ?? 0) * 100)}%.
            </p>
          )}
        </div>
      </div>

      {/* Section 3: Trade Number in Session */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Trade Number in Session
          </h2>
        </div>

        <div className="space-y-2">
          {sessionEntries.map((e) => {
            const widthPct = (e.count / maxSessCount) * 100;
            const tone = wrColor(e.wr, e.count);
            return (
              <div key={e.key} className="flex items-center gap-2">
                <span className="w-20 text-[11px] font-data text-muted-foreground">
                  {e.label}
                </span>
                <div className="relative h-6 flex-1 rounded-md bg-background/40 border border-border overflow-hidden">
                  <div
                    className={cn("absolute inset-y-0 left-0 border-r", tone)}
                    style={{ width: `${Math.max(widthPct, e.count > 0 ? 6 : 0)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-data">
                    <span className="text-foreground/80">{e.count} trades</span>
                    <span className="text-foreground/80">
                      {e.wr != null ? `${Math.round(e.wr * 100)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {thirdWr != null && thirdWr < 0.4 && thirdCount >= 3 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-trade-red/40 bg-trade-red/10 p-3 text-xs leading-snug text-trade-red">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-data uppercase tracking-wider text-[10px] font-semibold">
                Stop at 2 trades
              </div>
              <div className="mt-0.5 font-data">
                Your 3rd trade of the day loses {Math.round((1 - thirdWr) * 100)}% of the
                time. Stop at 2 trades.
              </div>
            </div>
          </div>
        )}
      </div>

      <AlertOverrideSection trades={trades} />
    </section>
  );
}

// ---------- Alert Override Rate ----------

const ALERT_LABELS: Record<BehaviorAlertType, string> = {
  tilt: "Tilt alerts",
  overtrading: "Overtrading alerts",
  streak: "Win-streak alerts",
  time: "Weak-hour alerts",
};

function AlertOverrideSection({ trades }: { trades: Trade[] }) {
  const stats = useMemo(() => computeOverrideStats(trades), [trades]);
  const rows = (Object.keys(stats) as BehaviorAlertType[]).filter(
    (k) => stats[k].overrides > 0,
  );
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold font-heading">
          Alert Override Rate
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground font-data">
          No alert overrides logged yet. When you choose "Trade Anyway" on a
          behavioral alert, the outcome will be tracked here.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((k) => {
            const { overrides, losses, lossRate } = stats[k];
            const pct = lossRate != null ? Math.round(lossRate * 100) : 0;
            return (
              <li
                key={k}
                className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs"
              >
                <div className="font-data uppercase tracking-wider text-[10px] text-muted-foreground">
                  {ALERT_LABELS[k]}
                </div>
                <div className="mt-1 text-foreground/90">
                  You ignored {overrides} {overrides === 1 ? "time" : "times"} —
                  and lost {pct}% of those trades ({losses}/{overrides}).
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}