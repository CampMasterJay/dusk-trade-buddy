import { useEffect, useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  is_earnings_play: boolean;
  strategy_type: string | null;
  net_pnl: number | null;
  iv_before_earnings: number | null;
  iv_after_earnings: number | null;
  status: string;
};

function fmt$(n: number): string {
  const v = Math.round(n);
  const sign = v >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(v).toLocaleString("en-US")}`;
}

export function EarningsPlayStats() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("options_trades")
        .select("id,is_earnings_play,strategy_type,net_pnl,iv_before_earnings,iv_after_earnings,status")
        .eq("user_id", user.id)
        .eq("status", "Closed")
        .is("deleted_at", null);
      setRows((data ?? []) as Row[]);
    })();
  }, [user]);

  if (!rows) {
    return (
      <Card className="p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading earnings stats…
      </Card>
    );
  }

  const earnings = rows.filter((r) => r.is_earnings_play);
  const nonEarnings = rows.filter((r) => !r.is_earnings_play);

  const stat = (xs: Row[]) => {
    const wins = xs.filter((x) => (x.net_pnl ?? 0) > 0).length;
    const total = xs.length;
    const wr = total ? (wins / total) * 100 : 0;
    const totalPnl = xs.reduce((a, x) => a + (x.net_pnl ?? 0), 0);
    const avgPnl = total ? totalPnl / total : 0;
    return { total, wr, totalPnl, avgPnl };
  };

  const eStat = stat(earnings);
  const nStat = stat(nonEarnings);

  // Most profitable earnings strategy
  const byStrategy = new Map<string, number>();
  for (const r of earnings) {
    const k = r.strategy_type ?? "—";
    byStrategy.set(k, (byStrategy.get(k) ?? 0) + (r.net_pnl ?? 0));
  }
  const topStrategy = Array.from(byStrategy.entries()).sort((a, b) => b[1] - a[1])[0];

  // IV crush
  const withIv = earnings.filter(
    (r) => r.iv_before_earnings != null && r.iv_after_earnings != null,
  );
  const avgIvDrop =
    withIv.length > 0
      ? withIv.reduce(
          (a, r) =>
            a + (Number(r.iv_before_earnings) - Number(r.iv_after_earnings)),
          0,
        ) / withIv.length
      : null;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-400" />
        <h3 className="text-xs uppercase tracking-wider font-data text-muted-foreground">
          Earnings play performance
        </h3>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          {eStat.total} earnings · {nStat.total} non-earnings
        </span>
      </div>

      {eStat.total === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No earnings plays logged yet. Trades within 5 days of an entry in the earnings
          calendar are auto-tagged.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <div className="text-[10px] uppercase tracking-wider text-amber-300 mb-1">
                Earnings plays
              </div>
              <div className="text-sm font-mono">
                Win rate: <span className="font-semibold">{eStat.wr.toFixed(0)}%</span>
              </div>
              <div className="text-sm font-mono">
                Avg P&L:{" "}
                <span
                  className={cn(
                    "font-semibold",
                    eStat.avgPnl >= 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {fmt$(eStat.avgPnl)}
                </span>
              </div>
              <div className="text-[11px] font-mono text-muted-foreground mt-1">
                Total: {fmt$(eStat.totalPnl)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Non-earnings
              </div>
              <div className="text-sm font-mono">
                Win rate: <span className="font-semibold">{nStat.wr.toFixed(0)}%</span>
              </div>
              <div className="text-sm font-mono">
                Avg P&L:{" "}
                <span
                  className={cn(
                    "font-semibold",
                    nStat.avgPnl >= 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {fmt$(nStat.avgPnl)}
                </span>
              </div>
              <div className="text-[11px] font-mono text-muted-foreground mt-1">
                Total: {fmt$(nStat.totalPnl)}
              </div>
            </div>
          </div>

          {topStrategy && (
            <div className="text-xs text-muted-foreground">
              Most profitable earnings strategy:{" "}
              <span className="font-mono text-foreground">{topStrategy[0]}</span>{" "}
              ({fmt$(topStrategy[1])})
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            IV crush impact:{" "}
            {avgIvDrop != null ? (
              <span className="font-mono text-foreground">
                avg IV drop {avgIvDrop.toFixed(1)} pts post-earnings ({withIv.length} trades)
              </span>
            ) : (
              <span className="italic">
                Add IV before/after earnings on closed plays to track crush.
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}