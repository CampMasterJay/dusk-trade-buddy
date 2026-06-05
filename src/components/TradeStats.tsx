import { type Trade, type TradeStats } from "@/lib/tradeService";
import { cn } from "@/lib/utils";

interface TradeStatsProps {
  stats: TradeStats | null;
  trades: Trade[];
}

function fmtUSD(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function calcStreak(trades: Trade[]): { type: "W" | "L" | null; count: number } {
  const ordered = [...trades]
    .filter((t) => t.result === "Win" || t.result === "Loss")
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return db - da;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  if (ordered.length === 0) return { type: null, count: 0 };
  const first = ordered[0].result === "Win" ? "W" : "L";
  let count = 0;
  for (const t of ordered) {
    const r = t.result === "Win" ? "W" : "L";
    if (r === first) count += 1;
    else break;
  }
  return { type: first, count };
}

export function TradeStats({ stats, trades }: TradeStatsProps) {
  const streak = calcStreak(trades);
  const s = stats;

  const winRatePct = (s?.winRate ?? 0) * 100;
  const lossRatePct = 100 - winRatePct;
  const avgWin = s?.avgWin ?? 0;
  const avgLoss = Math.abs(s?.avgLoss ?? 0);
  const ev = s?.ev ?? 0;

  const rows = [
    [
      { label: "Win Rate", value: `${winRatePct.toFixed(0)}%` },
      { label: "Total Trades", value: String(s?.totalTrades ?? 0) },
      {
        label: "Streak",
        value: streak.type ? `${streak.count}${streak.type}` : "—",
        accent: streak.type === "W" ? "green" : streak.type === "L" ? "red" : undefined,
      },
    ],
    [
      { label: "Avg Win", value: fmtUSD(avgWin), accent: "green" as const },
      { label: "Avg Loss", value: fmtUSD(s?.avgLoss ?? 0), accent: "red" as const },
      {
        label: "EV / Trade",
        value: fmtUSD(ev),
        accent: ev >= 0 ? ("green" as const) : ("red" as const),
      },
    ],
    [
      {
        label: "Total R",
        value: `${(s?.totalR ?? 0).toFixed(2)}R`,
        accent: (s?.totalR ?? 0) >= 0 ? ("green" as const) : ("red" as const),
      },
      { label: "Best Trade", value: fmtUSD(s?.largestWin ?? 0), accent: "green" as const },
      { label: "Worst Trade", value: fmtUSD(s?.largestLoss ?? 0), accent: "red" as const },
    ],
  ];

  return (
    <section className="space-y-3">
      <div className="grid gap-2">
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-2">
            {row.map((cell) => {
              const color =
                cell.accent === "green"
                  ? "text-trade-green"
                  : cell.accent === "red"
                    ? "text-trade-red"
                    : "text-foreground";
              return (
                <div
                  key={cell.label}
                  className="rounded-xl border border-border bg-card p-3 text-center"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
                    {cell.label}
                  </div>
                  <div className={cn("mt-1 font-data text-base font-semibold", color)}>
                    {cell.value}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* EV Formula */}
      <div
        className={cn(
          "rounded-xl border p-3 text-center font-data text-xs leading-relaxed",
          ev >= 0
            ? "border-trade-green/30 bg-trade-green/5 text-trade-green"
            : "border-trade-red/30 bg-trade-red/5 text-trade-red",
        )}
      >
        <div className="opacity-80">
          EV = (WinRate% × AvgWin) − (LossRate% × |AvgLoss|)
        </div>
        <div className="mt-0.5 font-semibold text-sm">
          EV = ({winRatePct.toFixed(0)}% × {fmtUSD(avgWin)}) − ({lossRatePct.toFixed(0)}% ×{" "}
          {fmtUSD(avgLoss)}) = {fmtUSD(ev)} per trade
        </div>
      </div>
    </section>
  );
}
