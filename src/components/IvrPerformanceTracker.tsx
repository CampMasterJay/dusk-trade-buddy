import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Row = {
  iv_rank_at_entry: number | null;
  net_pnl: number | null;
  status: string;
  strategy_type: string;
  is_debit: boolean;
};

type BucketStats = {
  label: string;
  range: string;
  trades: number;
  wins: number;
  winRate: number;
  avgPnl: number;
};

function bucketize(ivr: number): "low" | "mid-low" | "mid-high" | "high" {
  if (ivr < 25) return "low";
  if (ivr < 50) return "mid-low";
  if (ivr < 75) return "mid-high";
  return "high";
}

export function IvrPerformanceTracker() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("options_trades")
      .select("iv_rank_at_entry, net_pnl, status, strategy_type, is_debit")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .then(({ data }: { data: Row[] | null }) => {
        if (!cancelled) {
          setRows(data ?? []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const closed = rows.filter(
      (r) =>
        r.iv_rank_at_entry != null &&
        r.net_pnl != null &&
        (r.status === "Closed" || r.status === "Expired" || r.status === "Assigned"),
    );
    if (closed.length === 0) return { buckets: [] as BucketStats[], highVsLow: null, total: 0 };

    const bucketDefs: Array<{ key: ReturnType<typeof bucketize>; label: string; range: string }> = [
      { key: "low", label: "Q1", range: "0–25" },
      { key: "mid-low", label: "Q2", range: "25–50" },
      { key: "mid-high", label: "Q3", range: "50–75" },
      { key: "high", label: "Q4", range: "75–100" },
    ];

    const buckets: BucketStats[] = bucketDefs.map(({ key, label, range }) => {
      const inB = closed.filter((r) => bucketize(r.iv_rank_at_entry!) === key);
      const wins = inB.filter((r) => (r.net_pnl ?? 0) > 0).length;
      const total = inB.length;
      const avgPnl =
        total > 0 ? inB.reduce((s, r) => s + (r.net_pnl ?? 0), 0) / total : 0;
      return {
        label,
        range,
        trades: total,
        wins,
        winRate: total > 0 ? (wins / total) * 100 : 0,
        avgPnl,
      };
    });

    // High (>50) vs Low (<30) win rate compare
    const high = closed.filter((r) => (r.iv_rank_at_entry ?? 0) > 50);
    const low = closed.filter((r) => (r.iv_rank_at_entry ?? 0) < 30);
    const highWR =
      high.length > 0 ? (high.filter((r) => (r.net_pnl ?? 0) > 0).length / high.length) * 100 : null;
    const lowWR =
      low.length > 0 ? (low.filter((r) => (r.net_pnl ?? 0) > 0).length / low.length) * 100 : null;

    const highSellingCount = high.filter((r) => !r.is_debit).length;
    const lowBuyingCount = low.filter((r) => r.is_debit).length;

    return {
      buckets,
      highVsLow: { highWR, lowWR, highCount: high.length, lowCount: low.length, highSellingCount, lowBuyingCount },
      total: closed.length,
    };
  }, [rows]);

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading IVR stats…
      </Card>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Log a few closed options trades with IV Rank to unlock IVR performance breakdown.
      </Card>
    );
  }

  const insight = (() => {
    const h = stats.highVsLow;
    if (!h || h.highWR == null || h.lowWR == null) return null;
    const diff = h.highWR - h.lowWR;
    if (Math.abs(diff) < 10) return null;
    const better = diff > 0 ? "high" : "low";
    const directionalNote =
      better === "high"
        ? `Confirm you're SELLING premium when IVR > 50 — ${h.highSellingCount}/${h.highCount} of those trades were credit strategies.`
        : `Confirm you're BUYING premium when IVR < 30 — ${h.lowBuyingCount}/${h.lowCount} of those trades were debit strategies.`;
    return `Your win rate is ${Math.abs(diff).toFixed(0)}% higher when IVR ${
      better === "high" ? "> 50" : "< 30"
    }. ${directionalNote}`;
  })();

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">IVR Performance ({stats.total} closed)</h3>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {stats.buckets.map((b) => (
          <div key={b.label} className="rounded-md border border-border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">IVR {b.range}</div>
            <div className="font-mono text-sm mt-0.5">
              {b.trades > 0 ? `${b.winRate.toFixed(0)}%` : "—"}
            </div>
            <div
              className={cn(
                "text-[10px] mt-0.5",
                b.avgPnl >= 0 ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {b.trades > 0
                ? `${b.avgPnl >= 0 ? "+" : ""}$${b.avgPnl.toFixed(0)} avg`
                : "no trades"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{b.trades} trades</div>
          </div>
        ))}
      </div>

      {stats.highVsLow && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
            <div className="uppercase text-[10px] text-amber-300/80">IVR &gt; 50 (sell premium)</div>
            <div className="font-mono">
              {stats.highVsLow.highWR != null
                ? `${stats.highVsLow.highWR.toFixed(0)}% WR · ${stats.highVsLow.highCount} trades`
                : "No trades yet"}
            </div>
          </div>
          <div className="rounded border border-sky-500/30 bg-sky-500/5 p-2">
            <div className="uppercase text-[10px] text-sky-300/80">IVR &lt; 30 (buy premium)</div>
            <div className="font-mono">
              {stats.highVsLow.lowWR != null
                ? `${stats.highVsLow.lowWR.toFixed(0)}% WR · ${stats.highVsLow.lowCount} trades`
                : "No trades yet"}
            </div>
          </div>
        </div>
      )}

      {insight && (
        <div className="rounded-md border border-primary/30 bg-primary/5 text-primary p-2 text-xs">
          {insight}
        </div>
      )}
    </Card>
  );
}