import { useMemo } from "react";
import { AlertTriangle, ShieldAlert, TrendingDown, Flame, Calendar } from "lucide-react";
import type { Trade } from "@/lib/tradeService";
import { computeDrawdown } from "@/lib/drawdown";
import { cn } from "@/lib/utils";

interface Props {
  trades: Trade[];
  startingBalance: number;
}

export function DrawdownTracker({ trades, startingBalance }: Props) {
  const d = useMemo(
    () => computeDrawdown(trades, startingBalance),
    [trades, startingBalance],
  );

  const ddColor = (pct: number) =>
    pct >= 30 ? "text-trade-red" : pct >= 20 ? "text-trade-amber" : "text-foreground";
  const lossColor = (n: number) =>
    n >= 5 ? "text-trade-red" : n >= 3 ? "text-trade-amber" : "text-foreground";

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-4",
        d.level === "red" && "border-trade-red/50",
        d.level === "yellow" && "border-trade-amber/50",
        d.level === "none" && "border-border",
      )}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Drawdown Tracker
          </h2>
        </div>
        <span className="text-[10px] font-data text-muted-foreground">
          Peak ${d.peak.toFixed(0)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          label="Current DD"
          value={`${d.currentDdPct.toFixed(1)}%`}
          colorClass={ddColor(d.currentDdPct)}
        />
        <Tile
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
          label="Max DD"
          value={`${d.maxDdPct.toFixed(1)}%`}
          colorClass={ddColor(d.maxDdPct)}
        />
        <Tile
          icon={<Flame className="h-3.5 w-3.5" />}
          label="Loss Streak"
          value={
            d.consecutiveLosses > 0
              ? `${d.consecutiveLosses}L`
              : "—"
          }
          colorClass={lossColor(d.consecutiveLosses)}
        />
        <Tile
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Days Since Win Day"
          value={
            d.daysSinceWinningDay == null
              ? "—"
              : d.daysSinceWinningDay === 0
                ? "Today"
                : `${d.daysSinceWinningDay}d`
          }
          colorClass={
            (d.daysSinceWinningDay ?? 0) >= 5
              ? "text-trade-amber"
              : "text-foreground"
          }
        />
      </div>

      {d.level !== "none" && (
        <div
          className={cn(
            "mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs leading-snug",
            d.level === "red"
              ? "border-trade-red/40 bg-trade-red/10 text-trade-red"
              : "border-trade-amber/40 bg-trade-amber/10 text-trade-amber",
          )}
        >
          {d.level === "red" ? (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <div className="font-data uppercase tracking-wider text-[10px] font-semibold">
              {d.alertTitle} · {d.triggers.join(" · ")}
            </div>
            <div className="mt-0.5 font-data">{d.alertMessage}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function Tile({
  icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 font-data text-lg font-semibold", colorClass)}>
        {value}
      </div>
    </div>
  );
}