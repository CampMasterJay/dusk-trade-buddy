import { useEffect, useMemo, useState } from "react";
import { Loader2, Grid3x3, Clock, Gauge, Hourglass, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchOptionsStatRows,
  isClosed,
  daysBetween,
  type OptionsStatRow,
} from "@/lib/optionsStats";
import { cn } from "@/lib/utils";

// ---------- Regime helpers ----------

type Regime = "Trending" | "Ranging" | "High Vol" | "Low Vol";
const REGIME_COLS: Regime[] = ["Trending", "Ranging", "High Vol", "Low Vol"];

function normalizeRegime(raw: string | null | undefined): Regime | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("trend")) return "Trending";
  if (s.includes("range") || s.includes("chop") || s.includes("consolidat")) return "Ranging";
  if (s.includes("high") && s.includes("vol")) return "High Vol";
  if (s.includes("low") && s.includes("vol")) return "Low Vol";
  if (s.includes("vol expansion") || s.includes("expansion")) return "High Vol";
  if (s.includes("vol contraction") || s.includes("contraction") || s.includes("calm"))
    return "Low Vol";
  return null;
}

// ---------- DTE & IVR buckets ----------

const DTE_BUCKETS: Array<{ key: string; min: number; max: number }> = [
  { key: "0 DTE", min: 0, max: 0 },
  { key: "1–7", min: 1, max: 7 },
  { key: "8–14", min: 8, max: 14 },
  { key: "15–30", min: 15, max: 30 },
  { key: "31+", min: 31, max: Infinity },
];

const IVR_BUCKETS: Array<{ key: string; min: number; max: number }> = [
  { key: "0–25", min: 0, max: 25 },
  { key: "25–50", min: 25, max: 50 },
  { key: "50–75", min: 50, max: 75 },
  { key: "75–100", min: 75, max: 100.0001 },
];

type Bucket = { wins: number; total: number; pnl: number };

function emptyBucket(): Bucket {
  return { wins: 0, total: 0, pnl: 0 };
}

function pctStr(b: Bucket): string {
  if (b.total === 0) return "—";
  return `${Math.round((b.wins / b.total) * 100)}%`;
}

function wrTone(b: Bucket): string {
  if (b.total === 0) return "bg-muted/20 text-muted-foreground border-border/60";
  const wr = b.wins / b.total;
  if (wr >= 0.6) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (wr >= 0.45) return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  return "bg-rose-500/15 text-rose-300 border-rose-500/40";
}

export function OptionsBehaviorAnalytics() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OptionsStatRow[] | null>(null);
  const [regimes, setRegimes] = useState<Map<string, Regime> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchOptionsStatRows(user.id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("daily_game_plans")
        .select("plan_date, market_regime")
        .eq("user_id", user.id),
    ])
      .then(([r, plans]) => {
        if (cancelled) return;
        setRows(r);
        const map = new Map<string, Regime>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (plans?.data ?? []) as any[]) {
          const n = normalizeRegime(p.market_regime);
          if (n) map.set(p.plan_date, n);
        }
        setRegimes(map);
      })
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const closed = useMemo(() => (rows ?? []).filter(isClosed), [rows]);

  // ---------- Strategy × Regime matrix ----------
  const matrix = useMemo(() => {
    const m = new Map<string, Map<Regime, Bucket>>();
    for (const r of closed) {
      const strat = r.strategy_type || "Other";
      const reg = regimes?.get(r.trade_date);
      if (!reg) continue;
      let row = m.get(strat);
      if (!row) {
        row = new Map<Regime, Bucket>();
        m.set(strat, row);
      }
      const b = row.get(reg) ?? emptyBucket();
      b.total += 1;
      if ((r.net_pnl ?? 0) > 0) b.wins += 1;
      b.pnl += r.net_pnl ?? 0;
      row.set(reg, b);
    }
    return m;
  }, [closed, regimes]);

  // ---------- DTE buckets ----------
  const dteBuckets = useMemo(() => {
    const map = new Map<string, Bucket>();
    for (const b of DTE_BUCKETS) map.set(b.key, emptyBucket());
    for (const r of closed) {
      const dte = Number(r.dte_at_entry);
      if (!isFinite(dte)) continue;
      const def = DTE_BUCKETS.find((d) => dte >= d.min && dte <= d.max);
      if (!def) continue;
      const b = map.get(def.key)!;
      b.total += 1;
      if ((r.net_pnl ?? 0) > 0) b.wins += 1;
      b.pnl += r.net_pnl ?? 0;
    }
    return map;
  }, [closed]);

  // ---------- IVR buckets ----------
  const ivrBuckets = useMemo(() => {
    const map = new Map<string, Bucket>();
    for (const b of IVR_BUCKETS) map.set(b.key, emptyBucket());
    for (const r of closed) {
      const ivr = Number(r.iv_rank_at_entry);
      if (!isFinite(ivr)) continue;
      const def = IVR_BUCKETS.find((d) => ivr >= d.min && ivr < d.max);
      if (!def) continue;
      const b = map.get(def.key)!;
      b.total += 1;
      if ((r.net_pnl ?? 0) > 0) b.wins += 1;
      b.pnl += r.net_pnl ?? 0;
    }
    return map;
  }, [closed]);

  // ---------- Early exit analysis ----------
  // For winning closed trades, estimate $ left on table per contract = max_profit/contracts - net_pnl/contracts
  const earlyExit = useMemo(() => {
    const wins = closed.filter((r) => (r.net_pnl ?? 0) > 0);
    const perContract: number[] = [];
    for (const r of wins) {
      const mp = Number(r.max_profit);
      const np = Number(r.net_pnl);
      const c = Math.max(1, Number(r.leg1_contracts) || 1);
      if (!isFinite(mp) || mp <= 0 || !isFinite(np)) continue;
      const left = (mp - np) / c;
      if (left > 0) perContract.push(left);
    }
    if (perContract.length === 0) return null;
    const avg = perContract.reduce((s, v) => s + v, 0) / perContract.length;
    return { avgLeft: avg, n: perContract.length };
  }, [closed]);

  // ---------- Theta / planned-exit DTE analysis (credit spreads) ----------
  const thetaHold = useMemo(() => {
    const credits = closed.filter((r) => !r.is_debit);
    const overshoots: number[] = [];
    for (const r of credits) {
      const dteIn = Number(r.dte_at_entry);
      const planned = Number(r.planned_exit_dte);
      const held = daysBetween(r.trade_date, r.updated_at);
      if (!isFinite(dteIn) || !isFinite(planned)) continue;
      // planned exit DTE = DTE remaining at which you intended to close
      const dteAtActualExit = Math.max(0, dteIn - held);
      // Overshoot = how many DTE past the plan (positive = held too long)
      const overshoot = planned - dteAtActualExit;
      if (isFinite(overshoot)) overshoots.push(overshoot);
    }
    if (overshoots.length === 0) return null;
    const avg = overshoots.reduce((s, v) => s + v, 0) / overshoots.length;
    return { avgPastPlan: avg, n: overshoots.length };
  }, [closed]);

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading options behavior…
      </Card>
    );
  }

  if (closed.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Close a few options trades to unlock options-specific behavioral analytics.
      </Card>
    );
  }

  const strategyNames = Array.from(matrix.keys()).sort();

  return (
    <div className="space-y-4">
      {/* Strategy × Regime Matrix */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Grid3x3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Strategy × Regime Win Rate</h3>
        </div>
        {strategyNames.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Tag your daily game plans with a market regime to see this matrix.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-1.5 pr-2 font-normal">Strategy</th>
                  {REGIME_COLS.map((c) => (
                    <th key={c} className="text-center py-1.5 px-1 font-normal">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {strategyNames.map((s) => (
                  <tr key={s} className="border-t border-border/40">
                    <td className="py-1.5 pr-2 font-mono">{s}</td>
                    {REGIME_COLS.map((c) => {
                      const b = matrix.get(s)?.get(c) ?? emptyBucket();
                      return (
                        <td key={c} className="px-1 py-1">
                          <div
                            className={cn(
                              "rounded border px-1.5 py-1 text-center font-mono",
                              wrTone(b),
                            )}
                            title={`${b.wins}/${b.total} wins`}
                          >
                            <div className="text-[11px]">{pctStr(b)}</div>
                            <div className="text-[9px] opacity-70">n={b.total}</div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Iron Condors win in <span className="text-foreground">Ranging</span>{" "}
          markets. Long options (calls/puts) win in{" "}
          <span className="text-foreground">Trending</span> markets. Match
          strategy to regime.
        </p>
      </Card>

      {/* DTE Performance */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Win Rate by DTE at Entry</h3>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {DTE_BUCKETS.map((d) => {
            const b = dteBuckets.get(d.key)!;
            return (
              <div
                key={d.key}
                className={cn("rounded border p-2 text-center", wrTone(b))}
              >
                <div className="text-[10px] uppercase tracking-wider opacity-80">
                  {d.key}
                </div>
                <div className="font-mono text-sm mt-0.5">{pctStr(b)}</div>
                <div className="text-[10px] opacity-70">n={b.total}</div>
              </div>
            );
          })}
        </div>
        <DteInsight buckets={dteBuckets} />
      </Card>

      {/* IVR Performance */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Win Rate by IV Rank at Entry</h3>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {IVR_BUCKETS.map((d) => {
            const b = ivrBuckets.get(d.key)!;
            return (
              <div
                key={d.key}
                className={cn("rounded border p-2 text-center", wrTone(b))}
              >
                <div className="text-[10px] uppercase tracking-wider opacity-80">
                  IVR {d.key}
                </div>
                <div className="font-mono text-sm mt-0.5">{pctStr(b)}</div>
                <div className="text-[10px] opacity-70">n={b.total}</div>
              </div>
            );
          })}
        </div>
        <IvrInsight rows={closed} />
      </Card>

      {/* Early Exit Analysis */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Early Exit Analysis</h3>
        </div>
        {earlyExit ? (
          <>
            <p className="text-sm font-mono">
              You left an average of{" "}
              <span className="text-amber-300">
                ${earlyExit.avgLeft.toFixed(0)}
              </span>{" "}
              per contract on the table by closing early.
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Based on {earlyExit.n} winning trades. Note: closing at a profit
              target (e.g. 50%) is the correct rule — this data confirms the
              cost of the discipline, not a mistake.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Need closed winning trades with max-profit recorded to compute.
          </p>
        )}
      </Card>

      {/* Theta / planned exit hold */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Hourglass className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Theta Management</h3>
        </div>
        {thetaHold ? (
          thetaHold.avgPastPlan > 0 ? (
            <p className="text-sm font-mono text-rose-300">
              You hold credit spreads an average of{" "}
              <span className="font-semibold">
                {thetaHold.avgPastPlan.toFixed(1)} DTE past
              </span>{" "}
              your planned exit — this increases gamma risk.
            </p>
          ) : (
            <p className="text-sm font-mono text-emerald-300">
              You close credit spreads on average{" "}
              {Math.abs(thetaHold.avgPastPlan).toFixed(1)} DTE earlier than
              planned — disciplined.
            </p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            Set planned_exit_dte on credit spreads to track theta discipline.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Based on {thetaHold?.n ?? 0} credit trade(s).
        </p>
      </Card>
    </div>
  );
}

function DteInsight({ buckets }: { buckets: Map<string, Bucket> }) {
  const zero = buckets.get("0 DTE")!;
  const week = buckets.get("8–14")!;
  if (zero.total < 3 && week.total < 3) return null;
  const z = zero.total > 0 ? Math.round((zero.wins / zero.total) * 100) : null;
  const w = week.total > 0 ? Math.round((week.wins / week.total) * 100) : null;
  if (z == null || w == null) return null;
  return (
    <p className="text-[11px] text-muted-foreground leading-relaxed">
      You win <span className="text-foreground">{z}%</span> on 0DTE vs{" "}
      <span className="text-foreground">{w}%</span> on 8–14 DTE trades.
    </p>
  );
}

function IvrInsight({ rows }: { rows: OptionsStatRow[] }) {
  // Specifically check credit spreads at high IVR
  const credits = rows.filter(
    (r) =>
      !r.is_debit &&
      (r.strategy_type?.toLowerCase().includes("spread") ||
        r.strategy_type?.toLowerCase().includes("condor")),
  );
  const hi = credits.filter((r) => Number(r.iv_rank_at_entry) >= 50);
  if (hi.length < 3) return null;
  const wins = hi.filter((r) => (r.net_pnl ?? 0) > 0).length;
  const wr = Math.round((wins / hi.length) * 100);
  return (
    <p className="text-[11px] text-muted-foreground leading-relaxed">
      Your credit spreads win <span className="text-foreground">{wr}%</span>{" "}
      when IVR ≥ 50 ({hi.length} trades) — confirm you're selling when IV is
      elevated.
    </p>
  );
}