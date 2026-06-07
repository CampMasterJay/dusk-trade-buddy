import { useEffect, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Row = {
  net_pnl: number | null;
  entry_theta: number | null;
  leg1_contracts: number | null;
  is_debit: boolean;
  strategy_type: string;
};

function fmt$(n: number, signed = false): string {
  const sign = signed ? (n >= 0 ? "+" : "-") : "";
  return `${sign}${Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })}`;
}

export function OptionsWeeklyDebriefSection({
  weekStart,
  weekEnd,
}: {
  weekStart: string;
  weekEnd: string;
}) {
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
      .select("net_pnl, entry_theta, leg1_contracts, is_debit, strategy_type, status")
      .eq("user_id", user.id)
      .gte("trade_date", weekStart)
      .lte("trade_date", weekEnd)
      .eq("status", "Closed")
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
  }, [user?.id, weekStart, weekEnd]);

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading options summary…
      </section>
    );
  }

  if (!rows || rows.length === 0) {
    return null;
  }

  const wins = rows.filter((r) => Number(r.net_pnl ?? 0) > 0).length;
  const winRate = (wins / rows.length) * 100;
  const netPnl = rows.reduce((a, r) => a + Number(r.net_pnl ?? 0), 0);
  // Theta harvested: for credit positions held to expiration/close, approximate
  // as the absolute decay accumulated. Use entry_theta * contracts * 1 as a
  // per-trade baseline (best-effort; broker mark gives true number).
  const thetaHarvested = rows
    .filter((r) => !r.is_debit)
    .reduce(
      (a, r) => a + Math.abs(Number(r.entry_theta ?? 0)) * Math.max(1, Number(r.leg1_contracts ?? 1)),
      0,
    );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
        <Layers className="h-3 w-3" />
        Options This Week
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Tile label="Trades" value={String(rows.length)} />
        <Tile
          label="Win Rate"
          value={`${winRate.toFixed(0)}%`}
          tone={winRate >= 50 ? "text-trade-green" : "text-trade-red"}
        />
        <Tile
          label="Net P&L"
          value={fmt$(netPnl, true)}
          tone={netPnl >= 0 ? "text-trade-green" : "text-trade-red"}
        />
        <Tile
          label="Theta Harvested"
          value={fmt$(thetaHarvested)}
          tone="text-emerald-400"
        />
      </div>
    </section>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2 text-center">
      <div className={cn("font-data text-base tabular-nums", tone ?? "text-foreground")}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-data uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}