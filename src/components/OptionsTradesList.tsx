import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ivrBucket } from "@/lib/ivrGuidance";

type OptRow = {
  id: string;
  trade_date: string;
  underlying: string;
  strategy_type: string;
  status: string;
  is_debit: boolean;
  net_pnl: number | null;
  iv_rank_at_entry: number | null;
  leg1_contracts: number;
};

function IvrBadge({ ivr }: { ivr: number | null }) {
  if (ivr == null) return <span className="text-[10px] text-muted-foreground">IVR —</span>;
  const b = ivrBucket(ivr);
  const tone =
    b === "high"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
      : b === "low"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
        : "border-border bg-muted/30 text-muted-foreground";
  return (
    <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", tone)}>
      IVR {ivr.toFixed(0)}
    </span>
  );
}

export function OptionsTradesList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OptRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("options_trades")
      .select(
        "id, trade_date, underlying, strategy_type, status, is_debit, net_pnl, iv_rank_at_entry, leg1_contracts",
      )
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("trade_date", { ascending: false })
      .limit(25)
      .then(({ data }: { data: OptRow[] | null }) => {
        if (!cancelled) {
          setRows(data ?? []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading options trades…
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No options trades logged yet. Tap "Options Trade" to add one.
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pnl = r.net_pnl ?? 0;
        const pnlColor =
          r.status === "Open"
            ? "text-muted-foreground"
            : pnl > 0
              ? "text-emerald-400"
              : pnl < 0
                ? "text-rose-400"
                : "text-muted-foreground";
        return (
          <Card key={r.id} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-sm">{r.underlying}</span>
                  <span className="text-xs text-muted-foreground">{r.strategy_type}</span>
                  <IvrBadge ivr={r.iv_rank_at_entry} />
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                      r.is_debit
                        ? "border-sky-500/30 text-sky-300"
                        : "border-amber-500/30 text-amber-300",
                    )}
                  >
                    {r.is_debit ? "Debit" : "Credit"}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {r.trade_date} · {r.leg1_contracts}c · {r.status}
                </div>
              </div>
              <div className={cn("font-mono text-sm shrink-0", pnlColor)}>
                {r.status === "Open"
                  ? "—"
                  : `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(0)}`}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}