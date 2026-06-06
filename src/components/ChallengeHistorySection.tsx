import { useEffect, useState } from "react";
import { History, Trophy, X as XIcon, RotateCcw } from "lucide-react";
import {
  challengeProfitPct,
  listChallenges,
  type ChallengeRow,
} from "@/lib/challengeArchive";
import { cn } from "@/lib/utils";

export function ChallengeHistorySection() {
  const [items, setItems] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listChallenges()
        .then((rows) => {
          if (!cancelled) setItems(rows);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const onRefresh = () => load();
    window.addEventListener("edge:challenges-changed", onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("edge:challenges-changed", onRefresh);
    };
  }, []);

  const bestId =
    items.length > 0
      ? items.reduce((best, c) =>
          challengeProfitPct(c) > challengeProfitPct(best) ? c : best,
        ).id
      : null;

  const totals = items.reduce(
    (acc, c) => {
      acc.totalTrades += c.total_trades;
      acc.totalPnl += c.final_balance - c.starting_balance;
      return acc;
    },
    { totalTrades: 0, totalPnl: 0 },
  );
  const avgWinRate =
    items.length > 0
      ? items.reduce((s, c) => s + Number(c.win_rate), 0) / items.length
      : 0;

  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary"><History className="size-5" /></span>
        <h2 className="text-lg font-semibold font-heading">Challenge History</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {items.length === 0
          ? "No archived challenges yet. Your first one will appear here when you start a new challenge."
          : `${items.length} archived challenge${items.length === 1 ? "" : "s"}.`}
      </p>

      {loading ? (
        <div className="h-24 animate-pulse rounded-lg border border-border bg-muted/20" />
      ) : items.length === 0 ? null : (
        <>
          {/* Comparison summary */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Stat label="Total trades" value={String(totals.totalTrades)} />
            <Stat
              label="Avg win rate"
              value={`${avgWinRate.toFixed(1)}%`}
            />
            <Stat
              label="Net P&L"
              value={`${totals.totalPnl >= 0 ? "+" : ""}$${totals.totalPnl.toFixed(0)}`}
              tone={totals.totalPnl >= 0 ? "green" : "red"}
            />
          </div>

          <div className="space-y-2">
            {items.map((c) => {
              const profitPct = challengeProfitPct(c);
              const isBest = c.id === bestId && profitPct > 0;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "rounded-lg border p-3",
                    isBest
                      ? "border-trade-green/50 bg-trade-green/5"
                      : "border-border bg-background/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <OutcomeBadge outcome={c.outcome} />
                        {isBest && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-trade-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-trade-green">
                            <Trophy className="size-3" /> Best
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(c.started_at).toLocaleDateString()} —{" "}
                        {new Date(c.ended_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "shrink-0 text-right font-data text-sm font-semibold",
                        profitPct >= 0 ? "text-trade-green" : "text-trade-red",
                      )}
                    >
                      {profitPct >= 0 ? "+" : ""}
                      {profitPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                    <MiniStat label="Start" value={`$${Number(c.starting_balance).toFixed(0)}`} />
                    <MiniStat label="End" value={`$${Number(c.final_balance).toFixed(0)}`} />
                    <MiniStat label="Trades" value={String(c.total_trades)} />
                    <MiniStat label="Win %" value={`${Number(c.win_rate).toFixed(0)}%`} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function OutcomeBadge({ outcome }: { outcome: ChallengeRow["outcome"] }) {
  const map = {
    Won: {
      cls: "bg-trade-green/15 text-trade-green",
      Icon: Trophy,
    },
    Lost: {
      cls: "bg-trade-red/15 text-trade-red",
      Icon: XIcon,
    },
    Reset: {
      cls: "bg-muted/40 text-muted-foreground",
      Icon: RotateCcw,
    },
  } as const;
  const { cls, Icon } = map[outcome];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        cls,
      )}
    >
      <Icon className="size-3" />
      {outcome}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-data text-sm font-bold",
          tone === "green" && "text-trade-green",
          tone === "red" && "text-trade-red",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-data text-xs font-semibold">{value}</div>
    </div>
  );
}