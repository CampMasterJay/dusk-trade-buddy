import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchOptionsStatRows,
  aggregateOptionsStats,
  type OptionsAggregateStats,
} from "@/lib/optionsStats";
import { cn } from "@/lib/utils";

function fmt$(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function DailyThetaCard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<OptionsAggregateStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchOptionsStatRows(user.id)
      .then((rows) => !cancelled && setStats(aggregateOptionsStats(rows)))
      .catch(() => !cancelled && setStats(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading theta…
      </Card>
    );
  }

  if (!stats || (stats.openTrades === 0 && stats.closedTrades === 0)) return null;

  const today = stats.todayThetaDecay;
  const cumulative = stats.cumulativeThetaAttribution;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Theta Decay</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Today's Theta
          </div>
          <div
            className={cn(
              "font-mono text-lg mt-1",
              today < 0 ? "text-rose-400" : today > 0 ? "text-emerald-400" : "text-foreground",
            )}
          >
            {fmt$(today)}/d
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {today < 0
              ? "your open positions lose this much today from time alone"
              : today > 0
                ? "your open credit positions earn this much today"
                : "no open positions"}
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Cumulative (closed)
          </div>
          <div
            className={cn(
              "font-mono text-lg mt-1",
              cumulative > 0 ? "text-emerald-400" : cumulative < 0 ? "text-rose-400" : "text-foreground",
            )}
          >
            {fmt$(cumulative)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            net theta attributed across closed trades
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5">
          <span className="text-muted-foreground">Harvested (credits): </span>
          <span className="font-mono text-emerald-400">
            +${stats.thetaHarvestedCredits.toFixed(0)}
          </span>
        </div>
        <div className="rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1.5">
          <span className="text-muted-foreground">Paid (debits): </span>
          <span className="font-mono text-rose-400">
            -${stats.thetaPaidDebits.toFixed(0)}
          </span>
        </div>
      </div>
    </Card>
  );
}