import { useEffect, useState } from "react";
import { Loader2, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchOptionsStatRows,
  attributePnL,
  isClosed,
  type OptionsStatRow,
} from "@/lib/optionsStats";
import { cn } from "@/lib/utils";

function fmt$(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

function pctOf(part: number, total: number): string {
  if (!isFinite(total) || total === 0) return "—";
  return `${((part / total) * 100).toFixed(0)}%`;
}

function Bar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const max = Math.max(1, Math.abs(total));
  const width = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="w-14 shrink-0 text-muted-foreground">{label}</div>
      <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      <div
        className={cn(
          "w-20 shrink-0 text-right font-mono",
          value > 0 && "text-emerald-400",
          value < 0 && "text-rose-400",
        )}
      >
        {fmt$(value)}
      </div>
    </div>
  );
}

export function OptionsPnLAttribution({ limit = 10 }: { limit?: number }) {
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
        <Loader2 className="h-4 w-4 animate-spin" /> Loading attribution…
      </Card>
    );
  }

  const closed = (rows ?? [])
    .filter(isClosed)
    .sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, limit);

  if (closed.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Close some options trades to see P&L attribution (direction vs theta vs vega).
      </Card>
    );
  }

  // Aggregate totals across closed trades
  let totDir = 0;
  let totTheta = 0;
  let totVega = 0;
  for (const r of closed) {
    const a = attributePnL(r);
    if (!a) continue;
    totDir += a.directionPnL;
    totTheta += a.thetaPnL;
    totVega += a.vegaPnL;
  }
  const grandTotal = Math.abs(totDir) + Math.abs(totTheta) + Math.abs(totVega);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">P&L Attribution</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">
          last {closed.length}
        </span>
      </div>

      <div className="rounded-md border border-border p-3 space-y-1.5">
        <div className="text-[10px] uppercase text-muted-foreground mb-1">
          Where your P&L comes from
        </div>
        <Bar label="Direction" value={totDir} total={grandTotal} color="hsl(217 91% 60%)" />
        <Bar label="Theta" value={totTheta} total={grandTotal} color="hsl(48 96% 53%)" />
        <Bar label="Vega" value={totVega} total={grandTotal} color="hsl(280 90% 60%)" />
        <div className="text-[10px] text-muted-foreground pt-1">
          Are you making money on direction, time, or volatility?
        </div>
      </div>

      <div className="space-y-1.5">
        {closed.map((r) => {
          const a = attributePnL(r);
          if (!a) return null;
          const total = r.net_pnl ?? 0;
          return (
            <div key={r.id} className="rounded-md border border-border p-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{r.underlying}</span>
                  <span className="text-muted-foreground text-[11px]">{r.strategy_type}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {a.daysHeld}d held
                  </span>
                </div>
                <span
                  className={cn(
                    "font-mono",
                    total > 0 ? "text-emerald-400" : total < 0 ? "text-rose-400" : "",
                  )}
                >
                  {fmt$(total)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <AttrPill label="Δ Dir" value={a.directionPnL} pct={pctOf(a.directionPnL, total)} />
                <AttrPill label="Θ Theta" value={a.thetaPnL} pct={pctOf(a.thetaPnL, total)} />
                <AttrPill label="V Vega" value={a.vegaPnL} pct={pctOf(a.vegaPnL, total)} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AttrPill({ label, value, pct }: { label: string; value: number; pct: string }) {
  return (
    <div
      className={cn(
        "rounded border px-1.5 py-1 font-mono flex items-center justify-between gap-1",
        value > 0 && "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
        value < 0 && "border-rose-500/30 bg-rose-500/5 text-rose-400",
        value === 0 && "border-border text-muted-foreground",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span>
        {value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(0)}
        <span className="text-muted-foreground ml-1">({pct})</span>
      </span>
    </div>
  );
}