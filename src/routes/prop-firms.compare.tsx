import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Trophy,
  TrendingUp,
  Loader2,
  Sparkles,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { computeTradeStats } from "@/lib/tradeStats";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/prop-firms/compare")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Compare Prop Firms" },
      {
        name: "description",
        content:
          "Side-by-side comparison of major prop firms using your actual win rate, average R, and trading cadence.",
      },
    ],
  }),
  component: PropFirmsComparePage,
});

type Firm = {
  id: string;
  firm_name: string;
  account_size: number;
  monthly_fee: number | null;
  profit_target_pct: number | null;
  profit_target_amount: number | null;
  max_daily_loss_pct: number | null;
  max_daily_loss_amount: number | null;
  max_drawdown_pct: number | null;
  max_drawdown_amount: number | null;
  drawdown_type: string;
  payout_split_pct: number | null;
  payout_frequency: string | null;
  website_url: string | null;
};

type UserPerf = {
  totalTrades: number;
  winRate: number; // 0..1
  avgRWin: number; // average R on wins
  avgRLoss: number; // average R on losses (negative)
  expectancyR: number; // expected R per trade
  tradesPerDay: number;
  monthlyProfitPct: number; // % of starting balance per ~21 trading days
  startingBalance: number;
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function PropFirmsComparePage() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [perf, setPerf] = useState<UserPerf | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [firmsRes, tradesRes] = await Promise.all([
        supabase
          .from("prop_firms")
          .select("*")
          .eq("is_active", true)
          .order("firm_name")
          .order("account_size"),
        supabase
          .from("trades")
          .select("date, result, pnl, r_multiple")
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .order("date", { ascending: false })
          .limit(500),
      ]);
      if (cancelled) return;
      setFirms((firmsRes.data ?? []) as Firm[]);

      const trades = tradesRes.data ?? [];
      const stats = computeTradeStats(trades);
      const winsR = trades
        .filter((t) => t.result === "Win")
        .map((t) => Number(t.r_multiple) || 0);
      const lossesR = trades
        .filter((t) => t.result === "Loss")
        .map((t) => Number(t.r_multiple) || 0);
      const avgRWin =
        winsR.length > 0 ? winsR.reduce((a, b) => a + b, 0) / winsR.length : 0;
      const avgRLoss =
        lossesR.length > 0
          ? lossesR.reduce((a, b) => a + b, 0) / lossesR.length
          : -1;
      const decided = winsR.length + lossesR.length;
      const expectancyR =
        decided > 0
          ? (winsR.length / decided) * avgRWin +
            (lossesR.length / decided) * avgRLoss
          : 0;

      const uniqDates = new Set(trades.map((t) => t.date));
      const tradesPerDay =
        uniqDates.size > 0 ? trades.length / uniqDates.size : 0;

      const startingBalance = Number(settings?.current_balance ?? 100);
      const monthlyProfitPct =
        startingBalance > 0 && uniqDates.size > 0
          ? // 21 trading days/month projection on personal account
            (stats.totalPnl / startingBalance) * (21 / uniqDates.size) * 100
          : 0;

      setPerf({
        totalTrades: stats.totalTrades,
        winRate: stats.winRate,
        avgRWin,
        avgRLoss,
        expectancyR,
        tradesPerDay,
        monthlyProfitPct,
        startingBalance,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, settings?.current_balance]);

  const rows = useMemo(() => {
    if (!perf) return [];
    return firms.map((f) => buildFirmRow(f, perf));
  }, [firms, perf]);

  const bestRow = useMemo(() => {
    if (rows.length === 0) return null;
    const candidates = rows.filter(
      (r) => Number.isFinite(r.monthlyNet) && r.timeToPassDays != null,
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, r) =>
      r.monthlyNet > best.monthlyNet ? r : best,
    );
  }, [rows]);

  return (
    <ProtectedRoute>
      <AppHeader balance={Number(settings?.current_balance ?? 100)} />
      <div className="p-4 lg:p-6 pb-24 max-w-6xl mx-auto">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
              <Link to="/prop-firms">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to Tracker
              </Link>
            </Button>
            <h1 className="text-2xl font-bold font-heading flex items-center gap-2">
              <Building2 className="h-6 w-6 text-trade-blue" />
              Compare Prop Firms
            </h1>
            <p className="text-sm text-muted-foreground">
              Ranked by projected monthly take-home using your actual trading
              stats.
            </p>
          </div>
        </div>

        {loading || !perf ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Crunching your stats…
          </div>
        ) : perf.totalTrades < 5 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Log at least 5 trades to unlock personalized firm comparisons.
            </CardContent>
          </Card>
        ) : (
          <>
            <PerfBanner perf={perf} />
            <ComparisonTable rows={rows} bestId={bestRow?.firm.id ?? null} />
            <ScaleLadder perf={perf} firms={firms} />
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}

// ---------- calculations ----------

type FirmRow = {
  firm: Firm;
  profitTarget: number;
  monthlyFee: number;
  payoutSplit: number; // 0..1
  /** Trader's avg $ per trade on this firm's account size (using their R-expectancy and a 1% per-trade risk model). */
  evPerTrade: number;
  timeToPassDays: number | null;
  /** Net $/month after fee + split, assuming continued performance after passing. */
  monthlyNet: number;
};

function buildFirmRow(firm: Firm, perf: UserPerf): FirmRow {
  const profitTarget =
    Number(firm.profit_target_amount) ||
    (firm.profit_target_pct != null
      ? Number(firm.account_size) * (Number(firm.profit_target_pct) / 100)
      : 0);
  const monthlyFee = Number(firm.monthly_fee) || 0;
  const payoutSplit = (Number(firm.payout_split_pct) || 100) / 100;

  // Assume trader risks 1% of account per trade on the prop account.
  const riskPerTrade = Number(firm.account_size) * 0.01;
  const evPerTrade = perf.expectancyR * riskPerTrade;

  const dailyEv = evPerTrade * perf.tradesPerDay;
  const timeToPassDays =
    profitTarget > 0 && dailyEv > 0 ? Math.ceil(profitTarget / dailyEv) : null;

  // Monthly net assumes 21 trading days at the same EV, take payout split, subtract monthly fee.
  const grossMonthly = dailyEv * 21;
  const monthlyNet = grossMonthly * payoutSplit - monthlyFee;

  return {
    firm,
    profitTarget,
    monthlyFee,
    payoutSplit,
    evPerTrade,
    timeToPassDays,
    monthlyNet,
  };
}

// ---------- UI ----------

function PerfBanner({ perf }: { perf: UserPerf }) {
  return (
    <Card className="mb-4 border-trade-blue/40 bg-trade-blue/5">
      <CardContent className="py-3">
        <div className="flex items-center gap-2 text-[10px] font-data uppercase tracking-wider text-trade-blue mb-2">
          <Sparkles className="h-3.5 w-3.5" /> Your Performance Inputs
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <Stat label="Trades" value={perf.totalTrades.toString()} />
          <Stat label="Win rate" value={`${(perf.winRate * 100).toFixed(0)}%`} />
          <Stat
            label="Expectancy"
            value={`${perf.expectancyR >= 0 ? "+" : ""}${perf.expectancyR.toFixed(2)}R / trade`}
          />
          <Stat
            label="Trades / day"
            value={perf.tradesPerDay.toFixed(1)}
          />
          <Stat
            label="Monthly %"
            value={`${perf.monthlyProfitPct >= 0 ? "+" : ""}${perf.monthlyProfitPct.toFixed(1)}%`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonTable({
  rows,
  bestId,
}: {
  rows: FirmRow[];
  bestId: string | null;
}) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-trade-green" />
          Firm-by-Firm Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] font-data uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-2 px-3">Firm</th>
                <th className="text-right py-2 px-2">Size</th>
                <th className="text-right py-2 px-2">Fee</th>
                <th className="text-right py-2 px-2">Target</th>
                <th className="text-right py-2 px-2">Days to Pass*</th>
                <th className="text-right py-2 px-2">Monthly Net**</th>
                <th className="text-left py-2 px-3">Best For</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isBest = r.firm.id === bestId;
                return (
                  <tr
                    key={r.firm.id}
                    className={cn(
                      "border-b border-border/50",
                      isBest && "bg-trade-green/10",
                    )}
                  >
                    <td className="py-2 px-3">
                      <div className="font-medium flex items-center gap-1.5">
                        {r.firm.firm_name}
                        {isBest && (
                          <Badge className="bg-trade-green text-background hover:bg-trade-green text-[9px] py-0">
                            <Trophy className="h-2.5 w-2.5 mr-0.5" /> BEST
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.firm.drawdown_type.replace("_", " ")} ·{" "}
                        {(r.payoutSplit * 100).toFixed(0)}% split
                      </div>
                    </td>
                    <td className="text-right px-2 font-data">
                      {fmt(Number(r.firm.account_size))}
                    </td>
                    <td className="text-right px-2 font-data">
                      {r.monthlyFee > 0 ? fmt(r.monthlyFee) : "—"}
                    </td>
                    <td className="text-right px-2 font-data">
                      {fmt(r.profitTarget)}
                    </td>
                    <td className="text-right px-2 font-data">
                      {r.timeToPassDays != null ? `${r.timeToPassDays}d` : "—"}
                    </td>
                    <td
                      className={cn(
                        "text-right px-2 font-data font-bold",
                        r.monthlyNet > 0
                          ? "text-trade-green"
                          : r.monthlyNet < 0
                            ? "text-trade-red"
                            : "",
                      )}
                    >
                      {fmt(r.monthlyNet)}
                    </td>
                    <td className="px-3 text-[11px] text-muted-foreground">
                      {bestForLabel(r)}
                    </td>
                    <td className="px-2">
                      {r.firm.website_url ? (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={r.firm.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs"
                          >
                            Apply
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-muted-foreground px-3 py-2 border-t border-border">
          *Estimated trading days at your current expectancy ({" "}
          {rows[0] ? "" : ""}1% risk per trade ).
          **Monthly net = 21 trading days × EV × payout split − monthly fee.
          Assumes continued performance after passing.
        </div>
        {rows.length > 0 && bestId && (
          <div className="px-3 pb-3 text-xs">
            <span className="text-trade-green font-bold">Insight: </span>
            <span className="text-muted-foreground">
              At your {(rows[0] ? "" : "")}stats, you would hit{" "}
              {rows.find((r) => r.firm.id === bestId)?.firm.firm_name}'s{" "}
              {fmt(rows.find((r) => r.firm.id === bestId)?.profitTarget ?? 0)}{" "}
              target in approximately{" "}
              {rows.find((r) => r.firm.id === bestId)?.timeToPassDays} trading
              days — and net {" "}
              {fmt(rows.find((r) => r.firm.id === bestId)?.monthlyNet ?? 0)}/mo
              after.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function bestForLabel(r: FirmRow): string {
  if (r.firm.drawdown_type === "static") return "Stable rules, safer dd";
  if ((r.firm.profit_target_pct ?? 0) >= 8) return "Aggressive traders";
  if ((r.firm.monthly_fee ?? 0) <= 100) return "Low-cost entry";
  if ((r.payoutSplit ?? 0) >= 0.9) return "Max payout split";
  return "Balanced choice";
}

function ScaleLadder({
  perf,
  firms,
}: {
  perf: UserPerf;
  firms: Firm[];
}) {
  // Pick the cheapest/best firm per ladder rung by account size.
  const sizes = [25_000, 50_000, 100_000, 150_000];
  const rungs = sizes.map((size) => {
    const candidates = firms.filter((f) => Number(f.account_size) === size);
    const best = candidates.length
      ? candidates
          .map((f) => buildFirmRow(f, perf))
          .sort((a, b) => b.monthlyNet - a.monthlyNet)[0]
      : null;
    return { size, best };
  });

  const personalDays =
    perf.expectancyR > 0 && perf.tradesPerDay > 0
      ? Math.ceil(
          (perf.startingBalance * 0.5) /
            (perf.expectancyR * perf.startingBalance * 0.01 * perf.tradesPerDay),
        )
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-trade-blue" />
          Scale Ladder
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          Path from personal account to fully-funded — projected at your
          current stats.
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <LadderRow
          label="Personal account"
          size={perf.startingBalance}
          days={personalDays}
          monthly={
            (perf.monthlyProfitPct / 100) * perf.startingBalance
          }
          note="Build the proof-of-edge here. No fees, no split."
        />
        {rungs.map(({ size, best }) => (
          <LadderRow
            key={size}
            label={best ? `${best.firm.firm_name} ${fmt(size)}` : `${fmt(size)} (no firm)`}
            size={size}
            days={best?.timeToPassDays ?? null}
            monthly={best?.monthlyNet ?? 0}
            note={
              best
                ? `${best.firm.drawdown_type.replace("_", " ")} dd · ${(best.payoutSplit * 100).toFixed(0)}% split · ${fmt(best.monthlyFee)}/mo`
                : "No firm in DB for this size"
            }
          />
        ))}
        <div className="rounded-md border border-trade-green/30 bg-trade-green/5 p-3 mt-3">
          <div className="text-[10px] font-data uppercase tracking-wider text-trade-green mb-1">
            Cumulative Monthly Income (all rungs active)
          </div>
          <div className="text-2xl font-bold font-data text-trade-green">
            {fmt(
              (perf.monthlyProfitPct / 100) * perf.startingBalance +
                rungs.reduce(
                  (s, r) => s + Math.max(0, r.best?.monthlyNet ?? 0),
                  0,
                ),
            )}
            <span className="text-xs text-muted-foreground"> / month</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Assumes running all funded accounts concurrently at current
            expectancy.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LadderRow({
  label,
  size,
  days,
  monthly,
  note,
}: {
  label: string;
  size: number;
  days: number | null;
  monthly: number;
  note: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{label}</div>
        <div className="text-[11px] text-muted-foreground">{note}</div>
      </div>
      <div className="flex items-center gap-4 text-right">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Qualify in
          </div>
          <div className="font-data text-sm">
            {days != null ? `${days}d` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Monthly
          </div>
          <div
            className={cn(
              "font-data text-sm font-bold",
              monthly > 0
                ? "text-trade-green"
                : monthly < 0
                  ? "text-trade-red"
                  : "",
            )}
          >
            {fmt(monthly)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-data">{value}</div>
    </div>
  );
}