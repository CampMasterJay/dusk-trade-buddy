import { useMemo } from "react";
import { Activity, TrendingUp, TrendingDown, Minus, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Trade } from "@/lib/tradeService";
import {
  allRollingStats,
  edgeHealth,
  rollingStats,
  toneForCell,
  type CellTone,
  type RollingMetrics,
  type RollingWindow,
} from "@/lib/rollingStats";
import { cn } from "@/lib/utils";

function fmtPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}
function fmtR(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}
function fmtUSD(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
function windowLabel(w: RollingWindow) {
  return w === "all" ? "All-Time" : `Last ${w}`;
}

function toneClass(tone: CellTone) {
  if (tone === "green") return "text-trade-green";
  if (tone === "red") return "text-trade-red";
  return "text-muted-foreground";
}

interface Props {
  trades: Trade[];
}

export function RollingPerformance({ trades }: Props) {
  const rows = useMemo(() => allRollingStats(trades), [trades]);
  const baseline = rows[rows.length - 1]; // all-time

  const metricRows: {
    label: string;
    pick: (m: RollingMetrics) => number;
    format: (n: number) => string;
  }[] = [
    { label: "Win Rate", pick: (m) => m.winRate, format: fmtPct },
    { label: "Avg R", pick: (m) => m.avgR, format: fmtR },
    { label: "EV/Trade", pick: (m) => m.ev, format: fmtUSD },
    { label: "Net P&L", pick: (m) => m.netPnl, format: fmtUSD },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        <Activity className="h-3 w-3" />
        Rolling Performance
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-data">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-normal">Metric</th>
              {rows.map((r) => (
                <th key={String(r.window)} className="px-2 py-1.5 text-right font-normal">
                  {windowLabel(r.window)}
                  <div className="text-[9px] text-muted-foreground/70 normal-case tracking-normal">
                    n={r.sample}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((mr) => (
              <tr key={mr.label} className="border-t border-border/60">
                <td className="px-2 py-2 text-muted-foreground">{mr.label}</td>
                {rows.map((r) => {
                  const v = mr.pick(r);
                  const base = mr.pick(baseline);
                  const isBaseline = r.window === "all";
                  const tone: CellTone = isBaseline ? "neutral" : toneForCell(v, base);
                  return (
                    <td
                      key={String(r.window)}
                      className={cn(
                        "px-2 py-2 text-right font-semibold tabular-nums",
                        toneClass(tone),
                      )}
                    >
                      {r.sample === 0 ? "—" : mr.format(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-trade-green" /> Outperforms all-time
        </span>
        <span className="inline-flex items-center gap-1">
          <Minus className="h-3 w-3" /> Within 5%
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingDown className="h-3 w-3 text-trade-red" /> Underperforms
        </span>
      </div>
    </section>
  );
}

export function EdgeHealthScore({
  trades,
  compact = false,
}: {
  trades: Trade[];
  compact?: boolean;
}) {
  const eh = useMemo(() => edgeHealth(trades), [trades]);

  const toneStyles: Record<typeof eh.tone, string> = {
    green: "border-trade-green/40 bg-trade-green/10 text-trade-green",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    red: "border-trade-red/40 bg-trade-red/10 text-trade-red",
    muted: "border-border bg-muted/30 text-muted-foreground",
  };

  const Icon =
    eh.tone === "red"
      ? ShieldAlert
      : eh.tone === "amber"
        ? ShieldAlert
        : eh.tone === "green"
          ? ShieldCheck
          : Activity;

  const last20 = rollingStats(trades, 20);

  return (
    <section
      className={cn(
        "rounded-xl border p-3",
        toneStyles[eh.tone],
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <div>
            <div className="text-[10px] font-data uppercase tracking-[2px] opacity-80">
              Edge Health
            </div>
            <div className="font-data text-base font-bold uppercase tracking-wider">
              {eh.status}
            </div>
          </div>
        </div>
        <div className="text-right font-data">
          <div className="text-[10px] uppercase tracking-wider opacity-80">
            Last 20 vs All-Time
          </div>
          <div className="text-sm font-semibold tabular-nums">
            {(last20.winRate * 100).toFixed(0)}% vs {(eh.baseline * 100).toFixed(0)}%
            {eh.status !== "INSUFFICIENT DATA" && (
              <span className="ml-1 text-[11px] opacity-80">
                ({eh.deltaPct >= 0 ? "+" : ""}
                {eh.deltaPct.toFixed(1)}pp)
              </span>
            )}
          </div>
        </div>
      </div>
      {!compact && (
        <p className="mt-2 text-xs leading-snug opacity-90">{eh.message}</p>
      )}
    </section>
  );
}