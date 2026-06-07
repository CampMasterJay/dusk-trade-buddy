import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { summarizeGreeks } from "@/lib/portfolioGreeks";

type Row = {
  id: string;
  underlying: string;
  strategy_type: string;
  direction_bias: string | null;
  is_debit: boolean;
  leg1_contracts: number;
  leg1_premium: number;
  leg1_action: string;
  leg2_premium: number | null;
  leg2_action: string | null;
  max_risk: number | null;
  max_profit: number | null;
  entry_delta: number | null;
  entry_gamma: number | null;
  entry_theta: number | null;
  entry_vega: number | null;
  underlying_price_at_entry: number | null;
  market_type: string;
};

function fmt$(n: number, signed = false): string {
  const v = Math.round(n);
  const sign = v >= 0 ? (signed ? "+" : "") : "−";
  return `${sign}$${Math.abs(v).toLocaleString("en-US")}`;
}

const MOVE_PCTS = [-10, -5, -3, 0, 3, 5, 10];

export function OptionsRiskDashboard() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const balance = Number(settings?.current_balance ?? 100);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("options_trades")
        .select(
          "id, underlying, strategy_type, direction_bias, is_debit, leg1_contracts, leg1_premium, leg1_action, leg2_premium, leg2_action, max_risk, max_profit, entry_delta, entry_gamma, entry_theta, entry_vega, underlying_price_at_entry, market_type",
        )
        .eq("user_id", user.id)
        .eq("status", "Open")
        .is("deleted_at", null);
      setRows((data ?? []) as Row[]);
    })();
  }, [user]);

  const summary = useMemo(() => {
    const list = rows ?? [];
    const maxLoss = list.reduce((a, r) => a + (Number(r.max_risk) || 0), 0);
    const maxWin = list.reduce(
      (a, r) => a + (isFinite(Number(r.max_profit)) ? Number(r.max_profit) || 0 : 0),
      0,
    );
    const bpr = list.reduce((a, r) => {
      // Credit spreads / undefined-risk: BPR ≈ max_risk; debit: BPR ≈ premium paid
      return a + (Number(r.max_risk) || 0);
    }, 0);
    const greeks = summarizeGreeks(list);
    const riskPct = balance > 0 ? (maxLoss / balance) * 100 : 0;

    // Correlation: group by underlying
    const byUnderlying = new Map<string, number>();
    for (const r of list) byUnderlying.set(r.underlying, (byUnderlying.get(r.underlying) ?? 0) + 1);
    const concentrations = Array.from(byUnderlying.entries()).filter(([, n]) => n >= 2);

    return { list, maxLoss, maxWin, bpr, greeks, riskPct, concentrations };
  }, [rows, balance]);

  const scenarios = useMemo(() => {
    if (!rows) return null;
    // Per-position scenario: ΔP/L ≈ delta·ΔS·100·contracts + 0.5·gamma·ΔS²·100·contracts
    // Where ΔS is dollar move in underlying (estimated from underlying_price_at_entry · pct).
    const movePnl = MOVE_PCTS.map((pct) => {
      let totalPnl = 0;
      for (const r of rows) {
        const contracts = Math.max(1, Number(r.leg1_contracts) || 1);
        const px = Number(r.underlying_price_at_entry) || 100;
        const ds = px * (pct / 100);
        const delta = Number(r.entry_delta) || 0;
        const gamma = Number(r.entry_gamma) || 0;
        const mult = r.market_type === "futures_option" ? 50 : 100;
        totalPnl += (delta * ds + 0.5 * gamma * ds * ds) * mult * contracts;
      }
      return { pct, pnl: totalPnl };
    });

    const ivPnl5 = rows.reduce((acc, r) => {
      const contracts = Math.max(1, Number(r.leg1_contracts) || 1);
      // vega is per 1 IV pt per share; ×100 ×contracts
      const mult = r.market_type === "futures_option" ? 50 : 100;
      return acc + (Number(r.entry_vega) || 0) * 5 * mult * contracts;
    }, 0);

    const theta7 = rows.reduce((acc, r) => {
      const contracts = Math.max(1, Number(r.leg1_contracts) || 1);
      const mult = r.market_type === "futures_option" ? 50 : 100;
      return acc + (Number(r.entry_theta) || 0) * 7 * mult * contracts;
    }, 0);

    return { movePnl, ivPnl5, theta7 };
  }, [rows]);

  if (!rows) {
    return (
      <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading risk dashboard…
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground text-center">
        No open options positions. Log a position to see portfolio risk.
      </Card>
    );
  }

  const status =
    summary.riskPct < 10
      ? { label: "Low risk", tone: "emerald", Icon: ShieldCheck, msg: "Comfortable risk budget." }
      : summary.riskPct <= 20
        ? {
            label: "Moderate risk",
            tone: "amber",
            Icon: ShieldAlert,
            msg: "Watch new entries — capital at risk is elevated.",
          }
        : {
            label: "High risk",
            tone: "rose",
            Icon: ShieldX,
            msg: "Consider reducing open positions before adding new ones.",
          };

  return (
    <div className="space-y-3">
      {/* Status banner */}
      <Card
        className={cn(
          "p-4 border-2",
          status.tone === "emerald" && "border-emerald-500/50 bg-emerald-500/5",
          status.tone === "amber" && "border-amber-500/50 bg-amber-500/5",
          status.tone === "rose" && "border-rose-500/60 bg-rose-500/10",
        )}
      >
        <div className="flex items-center gap-3">
          <status.Icon
            className={cn(
              "h-6 w-6 shrink-0",
              status.tone === "emerald" && "text-emerald-400",
              status.tone === "amber" && "text-amber-400",
              status.tone === "rose" && "text-rose-400",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider font-data text-muted-foreground">
              Overall risk status
            </div>
            <div
              className={cn(
                "text-lg font-semibold",
                status.tone === "emerald" && "text-emerald-400",
                status.tone === "amber" && "text-amber-400",
                status.tone === "rose" && "text-rose-400",
              )}
            >
              {status.label} · {summary.riskPct.toFixed(1)}% of account
            </div>
            <p className="text-xs text-muted-foreground">{status.msg}</p>
          </div>
        </div>
      </Card>

      {/* Portfolio summary */}
      <Card className="p-4 space-y-3">
        <h3 className="text-xs uppercase tracking-wider font-data text-muted-foreground">
          Portfolio risk summary
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Metric
            label="Max risk if all lose"
            value={fmt$(-summary.maxLoss, true)}
            sub={`${summary.riskPct.toFixed(1)}% of account`}
            tone="rose"
          />
          <Metric
            label="Max profit if all win"
            value={fmt$(summary.maxWin, true)}
            sub={
              balance > 0
                ? `${((summary.maxWin / balance) * 100).toFixed(1)}% of account`
                : undefined
            }
            tone="emerald"
          />
          <Metric
            label="Net delta exposure"
            value={summary.greeks.bias}
            sub={`Δ ${summary.greeks.netDelta >= 0 ? "+" : ""}${summary.greeks.netDelta.toFixed(2)}`}
            tone={
              summary.greeks.bias === "Bullish"
                ? "emerald"
                : summary.greeks.bias === "Bearish"
                  ? "rose"
                  : "muted"
            }
          />
          <Metric
            label="Daily theta"
            value={fmt$(summary.greeks.netTheta * 100, true) + "/day"}
            sub={summary.greeks.netTheta < 0 ? "Time decay against you" : "Time decay in your favor"}
            tone={summary.greeks.netTheta >= 0 ? "emerald" : "rose"}
          />
          <Metric
            label="Net vega"
            value={
              summary.greeks.netVega >= 0 ? "Long vol" : "Short vol"
            }
            sub={`${fmt$(summary.greeks.netVega * 100, true)} per 1 IV pt`}
            tone={summary.greeks.netVega >= 0 ? "emerald" : "amber"}
          />
          <Metric
            label="Open positions"
            value={`${summary.list.length}`}
            sub={`across ${new Set(summary.list.map((r) => r.underlying)).size} underlyings`}
            tone="muted"
          />
        </div>
      </Card>

      {/* Buying power */}
      <Card className="p-4 space-y-2">
        <h3 className="text-xs uppercase tracking-wider font-data text-muted-foreground">
          Buying power (approximate)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Metric label="Used" value={fmt$(summary.bpr)} tone="amber" />
          <Metric label="Account" value={fmt$(balance)} tone="muted" />
          <Metric
            label="Remaining for new trades"
            value={fmt$(Math.max(0, balance - summary.bpr))}
            tone={balance - summary.bpr > 0 ? "emerald" : "rose"}
          />
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          BPR estimated from defined-risk max loss. Verify with your broker — actual margin
          requirements differ by strategy and account type.
        </p>
      </Card>

      {/* Scenario analysis */}
      {scenarios && (
        <Card className="p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wider font-data text-muted-foreground">
            Scenario analysis
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left pb-1.5 pr-2">Underlying move</th>
                  {scenarios.movePnl.map((m) => (
                    <th key={m.pct} className="text-right pb-1.5 px-2 font-mono">
                      {m.pct > 0 ? "+" : ""}
                      {m.pct}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="py-2 pr-2 text-muted-foreground">Est. portfolio P&L</td>
                  {scenarios.movePnl.map((m) => (
                    <td
                      key={m.pct}
                      className={cn(
                        "py-2 px-2 font-mono text-right text-xs",
                        m.pnl > 0
                          ? "text-emerald-400"
                          : m.pnl < 0
                            ? "text-rose-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {fmt$(m.pnl, true)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border">
            <div className="text-xs">
              <span className="text-muted-foreground">If IV increases 5 points:</span>{" "}
              <span
                className={cn(
                  "font-mono font-semibold",
                  scenarios.ivPnl5 >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {fmt$(scenarios.ivPnl5, true)}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Hold 7 more days (theta):</span>{" "}
              <span
                className={cn(
                  "font-mono font-semibold",
                  scenarios.theta7 >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {fmt$(scenarios.theta7, true)}
              </span>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground italic">
            First-order estimate from delta/gamma at entry. Real P&L will differ as greeks
            evolve with price, time, and IV.
          </p>
        </Card>
      )}

      {/* Correlation warnings */}
      {summary.concentrations.length > 0 && (
        <Card className="p-4 space-y-2 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-2 text-amber-300 text-xs uppercase tracking-wider font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Correlation warning
          </div>
          <ul className="space-y-1 text-xs text-foreground">
            {summary.concentrations.map(([u, n]) => (
              <li key={u}>
                You have <span className="font-mono font-semibold">{n}</span> positions on{" "}
                <span className="font-mono font-semibold">{u}</span> — highly correlated. A
                sharp {u} move affects all positions simultaneously.
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Greeks warnings */}
      {summary.greeks.warnings.length > 0 && (
        <Card className="p-4 space-y-1 border-amber-500/40 bg-amber-500/5">
          <div className="text-xs uppercase tracking-wider font-semibold text-amber-300">
            Greeks alerts
          </div>
          <ul className="space-y-1 text-xs text-foreground">
            {summary.greeks.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "emerald" | "rose" | "amber" | "muted";
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-mono text-base font-semibold",
          tone === "emerald" && "text-emerald-400",
          tone === "rose" && "text-rose-400",
          tone === "amber" && "text-amber-300",
          tone === "muted" && "text-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{sub}</div>}
    </div>
  );
}