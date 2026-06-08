import { useEffect, useState } from "react";
import { Loader2, Plus, CircleDot, Clock, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";
import { OptionsTradeSheet } from "@/components/OptionsTradeSheet";
import {
  fetchOptionsDashboardSummary,
  type OptionsDashboardSummary,
} from "@/lib/optionsRolling";
import { cn } from "@/lib/utils";

function fmt$(n: number, signed = false): string {
  const sign = signed ? (n >= 0 ? "+" : "-") : "";
  const v = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  return `${sign}${v}`;
}

export function OptionsDashboardSection({ onLogged }: { onLogged?: () => void }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<OptionsDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchOptionsDashboardSummary(user.id)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setSummary(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.id, reloadKey]);

  const refresh = () => {
    setReloadKey((k) => k + 1);
    onLogged?.();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider font-data">
            Options
          </h3>
        </div>
        <OptionsTradeSheet
          onLogged={refresh}
          trigger={
            <button
              type="button"
              data-tour="new-options-fab"
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-data px-2.5 py-1 rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition"
            >
              <Plus className="h-3 w-3" />
              New Options Trade
            </button>
          }
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading options…
        </div>
      ) : !summary ? (
        <div className="text-xs text-muted-foreground">Unable to load options data.</div>
      ) : summary.openPositions === 0 && summary.todayRealizedPnl === 0 ? (
        <div className="text-xs text-muted-foreground">
          No open options positions. Tap "New Options Trade" to log one.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Open" value={String(summary.openPositions)} />
            <Stat
              label="Today P&L"
              value={fmt$(summary.todayRealizedPnl, true)}
              tone={
                summary.todayRealizedPnl > 0
                  ? "text-emerald-400"
                  : summary.todayRealizedPnl < 0
                    ? "text-rose-400"
                    : undefined
              }
            />
            <Stat
              label="Daily Theta"
              value={`${fmt$(summary.netThetaPerDay, true)}/d`}
              tone={summary.netThetaPerDay < 0 ? "text-rose-400" : "text-emerald-400"}
            />
            <Stat
              label="Next Expiry"
              value={
                summary.nextExpiration
                  ? `${summary.nextExpiration.underlying} · ${summary.nextExpiration.dte}d`
                  : "—"
              }
              tone={
                summary.nextExpiration && summary.nextExpiration.dte <= 1
                  ? "text-amber-400"
                  : undefined
              }
            />
          </div>

          {summary.nextExpiration && summary.nextExpiration.dte <= 1 && (
            <div className="flex gap-2 items-start text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 p-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                {summary.nextExpiration.underlying} expires in {summary.nextExpiration.dte}{" "}
                day{summary.nextExpiration.dte === 1 ? "" : "s"} — manage gamma risk.
              </span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-data flex items-center gap-1">
        {label === "Next Expiry" && <Clock className="h-3 w-3" />}
        {label}
      </div>
      <div className={cn("font-mono text-sm mt-0.5 tabular-nums", tone)}>{value}</div>
    </div>
  );
}