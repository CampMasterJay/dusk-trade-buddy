import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function fmtUSD(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export interface ProjectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  targetBalance: number;
  riskPct: number;
  rrRatio: number;
  winRate?: number; // 0..1
}

interface Row {
  win: number;
  balance: number;
  risk: number;
  winTarget: number;
  pctToGoal: number;
  crossed: boolean;
}

export function ProjectionModal({
  open,
  onOpenChange,
  currentBalance,
  targetBalance,
  riskPct,
  rrRatio,
  winRate,
}: ProjectionModalProps) {
  const { rows, winsNeeded, hitTarget } = useMemo(() => {
    const rows: Row[] = [];
    let balance = currentBalance;
    let hitTarget = false;
    let winsNeeded = 0;
    const max = 30;
    // Row 0: current position
    rows.push({
      win: 0,
      balance,
      risk: (balance * riskPct) / 100,
      winTarget: ((balance * riskPct) / 100) * rrRatio,
      pctToGoal: Math.min(100, (balance / targetBalance) * 100),
      crossed: balance >= targetBalance,
    });
    for (let i = 1; i <= max; i++) {
      const risk = (balance * riskPct) / 100;
      const win = risk * rrRatio;
      const prev = balance;
      balance = balance + win;
      const crossed = prev < targetBalance && balance >= targetBalance;
      rows.push({
        win: i,
        balance,
        risk: (balance * riskPct) / 100,
        winTarget: ((balance * riskPct) / 100) * rrRatio,
        pctToGoal: Math.min(100, (balance / targetBalance) * 100),
        crossed,
      });
      if (!hitTarget && balance >= targetBalance) {
        hitTarget = true;
        winsNeeded = i;
      }
      if (balance >= targetBalance) break;
    }
    if (!hitTarget) winsNeeded = max;
    return { rows, winsNeeded, hitTarget };
  }, [currentBalance, targetBalance, riskPct, rrRatio]);

  const chartData = rows.map((r) => ({ win: r.win, balance: r.balance }));
  const currentDot = [{ win: 0, balance: currentBalance }];

  const wrPct = winRate != null ? (winRate * 100).toFixed(0) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <DialogTitle className="font-heading text-lg">Projection</DialogTitle>
          <DialogDescription className="font-data text-xs">
            Compounding curve from {fmtUSD(currentBalance, 0)} → {fmtUSD(targetBalance, 0)} at {riskPct}% risk · {rrRatio}R
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Chart */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data mb-2">
              Compounding Curve
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="win"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    label={{ value: "Wins", position: "insideBottom", offset: -2, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `$${Math.round(v)}`}
                    domain={["dataMin", (dataMax: number) => Math.max(dataMax, targetBalance) * 1.05]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => fmtUSD(v)}
                    labelFormatter={(l) => `Win #${l}`}
                  />
                  <ReferenceLine
                    y={targetBalance}
                    stroke="var(--trade-green)"
                    strokeDasharray="6 4"
                    label={{ value: `Target ${fmtUSD(targetBalance, 0)}`, fill: "var(--trade-green)", fontSize: 10, position: "insideTopRight" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="var(--trade-green)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Scatter data={currentDot} fill="var(--trade-green)" shape="circle" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Summary */}
          <section className="rounded-2xl border border-trade-green/30 bg-trade-green/5 p-4">
            <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
              Summary
            </div>
            <p className="mt-2 font-data text-sm text-foreground">
              At your current settings, you need{" "}
              <span className="font-semibold text-trade-green">
                {hitTarget ? winsNeeded : `${winsNeeded}+`}
              </span>{" "}
              more winning trade{winsNeeded === 1 ? "" : "s"}
              {wrPct ? (
                <>
                  {" "}at a{" "}
                  <span className="font-semibold">{wrPct}%</span> win rate
                </>
              ) : null}{" "}
              to hit your target of {fmtUSD(targetBalance, 0)}.
              {!hitTarget && " (Target not reached within 30 trades.)"}
            </p>
          </section>

          {/* Table */}
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 text-xs uppercase tracking-[2px] text-muted-foreground font-data border-b border-border">
              Projection Table
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-data">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-4 py-2">Win #</th>
                    <th className="text-right px-4 py-2">Balance</th>
                    <th className="text-right px-4 py-2">Risk $</th>
                    <th className="text-right px-4 py-2">Win Target $</th>
                    <th className="text-right px-4 py-2">% to Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const reachedRow = r.balance >= targetBalance;
                    const highlight = r.crossed || (r.win === 0 && reachedRow);
                    return (
                      <tr
                        key={r.win}
                        className={`border-t border-border ${
                          highlight
                            ? "bg-trade-green/15 text-trade-green"
                            : reachedRow
                              ? "text-trade-green/80"
                              : ""
                        }`}
                      >
                        <td className="px-4 py-2">{r.win}</td>
                        <td className="px-4 py-2 text-right">{fmtUSD(r.balance)}</td>
                        <td className="px-4 py-2 text-right">{fmtUSD(r.risk)}</td>
                        <td className="px-4 py-2 text-right">{fmtUSD(r.winTarget)}</td>
                        <td className="px-4 py-2 text-right">{r.pctToGoal.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}