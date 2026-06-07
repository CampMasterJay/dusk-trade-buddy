import { useEffect, useState } from "react";
import { BarChart3, Loader2, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchOptionsStatRows,
  aggregateOptionsStats,
  type OptionsAggregateStats,
  type OptionsStatRow,
} from "@/lib/optionsStats";
import { cn } from "@/lib/utils";

function pct(n: number, d = 0) {
  return `${(n * 100).toFixed(d)}%`;
}

function judge(value: number, target: number, kind: "min" | "max"): "good" | "bad" | "neutral" {
  if (kind === "min") return value >= target ? "good" : "bad";
  return value <= target ? "good" : "bad";
}

function toneClass(t: "good" | "bad" | "neutral") {
  if (t === "good") return "text-emerald-400";
  if (t === "bad") return "text-rose-400";
  return "text-muted-foreground";
}

export function OptionsTradeStats() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OptionsStatRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchOptionsStatRows(user.id)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading options stats…
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Log a few options trades to unlock options-specific stats.
      </Card>
    );
  }

  const s = aggregateOptionsStats(rows);

  // Decide credit-vs-debit benchmark by majority
  const closed = rows.filter((r) =>
    ["Closed", "Expired", "Assigned"].includes(r.status),
  );
  const creditCount = closed.filter((r) => !r.is_debit).length;
  const debitCount = closed.filter((r) => r.is_debit).length;
  const wrTarget = creditCount >= debitCount ? 0.55 : 0.45;
  const wrBenchLabel = creditCount >= debitCount ? "credit ≥55%" : "debit ≥45%";

  const wrTone = judge(s.winRate, wrTarget, "min");
  const winnerTone = judge(s.avgWinnerPctOfMaxProfit, 0.4, "min");
  const loserTone = judge(s.avgLoserPctOfMaxRisk, 0.8, "max");

  const tiles: Array<{
    label: string;
    value: string;
    sub?: string;
    tone?: "good" | "bad" | "neutral";
  }> = [
    { label: "Total", value: String(s.totalTrades), sub: `${s.openTrades} open · ${s.closedTrades} closed` },
    { label: "Win Rate", value: pct(s.winRate), sub: `target ${wrBenchLabel}`, tone: wrTone },
    {
      label: "Avg Winner",
      value: pct(s.avgWinnerPctOfMaxProfit),
      sub: "of max profit · target ≥40%",
      tone: winnerTone,
    },
    {
      label: "Avg Loser",
      value: pct(s.avgLoserPctOfMaxRisk),
      sub: "of max risk · target ≤80%",
      tone: loserTone,
    },
    {
      label: "Avg DTE Entry",
      value: `${s.avgDteAtEntry.toFixed(0)}d`,
    },
    {
      label: "Avg DTE Exit",
      value: `${s.avgDteAtExit.toFixed(0)}d`,
      sub: "how early you close",
    },
    {
      label: "Avg IVR Entry",
      value: s.avgIvrAtEntry != null ? s.avgIvrAtEntry.toFixed(0) : "—",
      sub: s.avgIvrAtEntry != null
        ? s.avgIvrAtEntry > 50
          ? "elevated IV"
          : s.avgIvrAtEntry < 30
            ? "low IV"
            : "moderate IV"
        : undefined,
    },
    {
      label: "Theta Harvested",
      value: `+$${s.thetaHarvestedCredits.toFixed(0)}`,
      sub: "credit trades",
      tone: "good",
    },
    {
      label: "Theta Paid",
      value: `-$${s.thetaPaidDebits.toFixed(0)}`,
      sub: "debit trades",
      tone: "bad",
    },
  ];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Options Stats</h3>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border border-border p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t.label}
            </div>
            <div className={cn("font-mono text-sm mt-0.5", toneClass(t.tone ?? "neutral"))}>
              {t.value}
            </div>
            {t.sub && (
              <div className="text-[10px] text-muted-foreground mt-0.5">{t.sub}</div>
            )}
          </div>
        ))}
      </div>

      {(s.mostProfitableStrategy || s.highestWinRateStrategy) && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {s.mostProfitableStrategy && (
            <div className="rounded border border-primary/30 bg-primary/5 p-2">
              <div className="text-[10px] uppercase text-primary/80 flex items-center gap-1">
                <Target className="h-3 w-3" /> Most Profitable
              </div>
              <div className="font-mono mt-0.5">{s.mostProfitableStrategy.name}</div>
              <div
                className={cn(
                  "text-[10px] font-mono",
                  s.mostProfitableStrategy.netPnL >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {s.mostProfitableStrategy.netPnL >= 0 ? "+" : "-"}$
                {Math.abs(s.mostProfitableStrategy.netPnL).toFixed(0)}
              </div>
            </div>
          )}
          {s.highestWinRateStrategy && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
              <div className="text-[10px] uppercase text-emerald-300/80">
                Highest Win Rate
              </div>
              <div className="font-mono mt-0.5">{s.highestWinRateStrategy.name}</div>
              <div className="text-[10px] font-mono text-emerald-400">
                {pct(s.highestWinRateStrategy.winRate)} · {s.highestWinRateStrategy.n} trades
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border border-border/70 bg-muted/20 p-2 text-[11px] text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">Benchmarks:</span> Win
        rate &gt;55% for credit, &gt;45% for debit. Avg winner ≥40% of max
        profit (don't get greedy). Avg loser ≤80% of max risk (don't hold
        losers).
      </div>
    </Card>
  );
}