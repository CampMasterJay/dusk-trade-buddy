import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  TrendingDown,
  RefreshCcw,
  Crosshair,
  Layers,
  AlertTriangle,
} from "lucide-react";
import type { Trade } from "@/lib/tradeService";

type Props = {
  trades: Trade[];
  tickValue?: number; // $ per point
};

const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildHistogram(values: number[], binCount = 8) {
  if (!values.length) return [] as { bin: string; count: number; mid: number }[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ bin: min.toFixed(1), count: values.length, mid: min }];
  }
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => {
    const lo = min + i * width;
    const hi = lo + width;
    return { lo, hi, count: 0 };
  });
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count += 1;
  }
  return bins.map((b) => ({
    bin: `${b.lo.toFixed(1)}–${b.hi.toFixed(1)}`,
    count: b.count,
    mid: (b.lo + b.hi) / 2,
  }));
}

export function StopAnalytics({ trades, tickValue = 5 }: Props) {
  const data = useMemo(() => {
    const active = trades.filter((t) => !t.deleted_at);

    const withStopDist = active.filter(
      (t) => typeof t.stop_distance_points === "number" && t.stop_distance_points! > 0,
    );
    const winStops = withStopDist
      .filter((t) => t.result === "Win")
      .map((t) => Number(t.stop_distance_points));
    const lossStops = withStopDist
      .filter((t) => t.result === "Loss")
      .map((t) => Number(t.stop_distance_points));

    const avgWinStop = avg(winStops);
    const avgLossStop = avg(lossStops);

    // Stop-and-reverse
    const losses = active.filter((t) => t.result === "Loss");
    const reversed = losses.filter((t) => t.stop_and_reversed === true);
    const reverseRate = losses.length ? (reversed.length / losses.length) * 100 : 0;
    const pointsLost = reversed.reduce(
      (sum, t) => sum + (Number(t.stop_and_reverse_points) || 0),
      0,
    );
    const dollarsLost = pointsLost * tickValue;

    // MAE scatter
    const maePoints = active
      .filter(
        (t) =>
          typeof t.max_adverse_excursion_points === "number" &&
          typeof t.stop_distance_points === "number" &&
          t.stop_distance_points! > 0,
      )
      .map((t) => ({
        stop: Number(t.stop_distance_points),
        mae: Number(t.max_adverse_excursion_points),
        result: t.result,
      }));

    const exceededStop = maePoints.filter((p) => p.mae > p.stop).length;
    const exceededPct = maePoints.length
      ? (exceededStop / maePoints.length) * 100
      : 0;

    // Optimal stop: 80th percentile of MAE on winning trades
    const winMAEs = active
      .filter(
        (t) =>
          t.result === "Win" &&
          typeof t.max_adverse_excursion_points === "number" &&
          t.max_adverse_excursion_points! > 0,
      )
      .map((t) => Number(t.max_adverse_excursion_points))
      .sort((a, b) => a - b);
    let optimalStop = 0;
    if (winMAEs.length) {
      const idx = Math.min(
        winMAEs.length - 1,
        Math.floor(winMAEs.length * 0.8),
      );
      optimalStop = winMAEs[idx];
    }
    // How many stopped-out trades had MAE <= optimalStop (could've survived)
    const savable = losses.filter(
      (t) =>
        typeof t.max_adverse_excursion_points === "number" &&
        Number(t.max_adverse_excursion_points) <= optimalStop &&
        Number(t.stop_distance_points) < optimalStop,
    );
    const savedDollars =
      savable.reduce((sum, t) => sum + Math.abs(Number(t.pnl) || 0), 0);

    // By setup
    const bySetup = new Map<string, { stops: number; total: number; avgStop: number[]; avgMAE: number[] }>();
    for (const t of active) {
      const key = t.setup_tag || "Untagged";
      const entry = bySetup.get(key) ?? { stops: 0, total: 0, avgStop: [], avgMAE: [] };
      entry.total += 1;
      if (t.result === "Loss") entry.stops += 1;
      if (typeof t.stop_distance_points === "number")
        entry.avgStop.push(Number(t.stop_distance_points));
      if (typeof t.max_adverse_excursion_points === "number")
        entry.avgMAE.push(Number(t.max_adverse_excursion_points));
      bySetup.set(key, entry);
    }
    const setupRows = Array.from(bySetup.entries())
      .filter(([, v]) => v.total >= 2)
      .map(([setup, v]) => ({
        setup,
        stops: v.stops,
        stopRate: v.total ? (v.stops / v.total) * 100 : 0,
        avgStop: avg(v.avgStop),
        suggestedStop: avg(v.avgMAE) * 1.2, // 20% buffer over avg MAE
        total: v.total,
      }))
      .sort((a, b) => b.stopRate - a.stopRate);

    return {
      winHist: buildHistogram(winStops),
      lossHist: buildHistogram(lossStops),
      avgWinStop,
      avgLossStop,
      stopsTooTight: avgLossStop > 0 && avgWinStop > 0 && avgLossStop < avgWinStop * 0.85,
      losses: losses.length,
      reversed: reversed.length,
      reverseRate,
      pointsLost,
      dollarsLost,
      maePoints,
      exceededPct,
      optimalStop,
      savable: savable.length,
      savedDollars,
      setupRows,
      withStopDist: withStopDist.length,
      withMAE: maePoints.length,
    };
  }, [trades, tickValue]);

  if (data.withStopDist === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No stop data yet. Log trades with entry & stop to unlock Stop Analytics.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section 1: Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-data flex items-center gap-2">
            <Layers className="h-4 w-4 text-trade-blue" />
            Stop Distance Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Avg stop · Winners
              </div>
              <div className="text-xl font-data text-trade-green">
                {data.avgWinStop.toFixed(2)} pts
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Avg stop · Losers
              </div>
              <div className="text-xl font-data text-trade-red">
                {data.avgLossStop.toFixed(2)} pts
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-data uppercase tracking-wider text-trade-green mb-1">
                Winners
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.winHist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="bin" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="count" fill="hsl(var(--trade-green))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="text-xs font-data uppercase tracking-wider text-trade-red mb-1">
                Losers
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.lossHist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="bin" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="count" fill="hsl(var(--trade-red))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {data.stopsTooTight && (
            <div className="flex items-start gap-2 rounded-md border border-trade-red/40 bg-trade-red/5 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 text-trade-red mt-0.5 shrink-0" />
              <div>
                <div className="font-data uppercase tracking-wider text-trade-red mb-1">
                  Stops may be too tight
                </div>
                Losers had {data.avgLossStop.toFixed(2)}pt stops vs{" "}
                {data.avgWinStop.toFixed(2)}pt on winners. Price may be stopping
                you out before going to target.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Stop and reverse */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-data flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-trade-amber" />
            Stop-and-Reverse Rate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Reverse rate
              </div>
              <div
                className={`text-xl font-data ${
                  data.reverseRate > 30 ? "text-trade-red" : "text-foreground"
                }`}
              >
                {data.reverseRate.toFixed(0)}%
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Stopped → hit target
              </div>
              <div className="text-xl font-data">
                {data.reversed} / {data.losses}
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Est. P&L lost
              </div>
              <div className="text-xl font-data text-trade-red">
                {fmtUSD(data.dollarsLost)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {data.pointsLost.toFixed(1)} pts × ${tickValue}/pt
              </div>
            </div>
          </div>
          {data.reverseRate > 30 && (
            <div className="text-xs text-trade-red flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              Over 30% of your stops reverse — strong signal that stops are too tight.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: MAE vs Stop */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-data flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-trade-blue" />
            MAE vs Stop Distance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.withMAE === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">
              Log MAE on trades to unlock this scatter plot.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    dataKey="stop"
                    name="Stop"
                    tick={{ fontSize: 10 }}
                    label={{ value: "Stop (pts)", position: "insideBottom", offset: -5, fontSize: 10 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="mae"
                    name="MAE"
                    tick={{ fontSize: 10 }}
                    label={{ value: "MAE (pts)", angle: -90, position: "insideLeft", fontSize: 10 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
                  />
                  <ReferenceLine
                    segment={[
                      { x: 0, y: 0 },
                      { x: 100, y: 100 },
                    ]}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                  />
                  <Scatter data={data.maePoints}>
                    {data.maePoints.map((p, i) => (
                      <Cell
                        key={i}
                        fill={
                          p.result === "Win"
                            ? "hsl(var(--trade-green))"
                            : "hsl(var(--trade-red))"
                        }
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="mt-2 text-xs text-muted-foreground">
                {data.exceededPct.toFixed(0)}% of trades had MAE exceeding stop distance.
                {data.exceededPct > 40 && (
                  <span className="text-trade-red"> Stops likely too tight.</span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Optimal stop */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-data flex items-center gap-2">
            <Target className="h-4 w-4 text-trade-green" />
            Optimal Stop Calculator
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.optimalStop === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              Need MAE data on winning trades to calculate optimal stop.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-2xl font-data text-trade-green">
                {data.optimalStop.toFixed(2)} pts
              </div>
              <div className="text-xs text-muted-foreground">
                Based on the 80th-percentile MAE of your winning trades — a stop
                of this size would have survived most of the adverse moves your
                winners experienced.
              </div>
              {data.savable > 0 && (
                <div className="rounded-md border border-trade-green/40 bg-trade-green/5 p-3 text-xs">
                  Would have saved <span className="font-data text-trade-green">{data.savable}</span> stopped trades
                  worth approximately{" "}
                  <span className="font-data text-trade-green">{fmtUSD(data.savedDollars)}</span>.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: By setup */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-data flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-trade-red" />
            Stop Placement by Setup
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.setupRows.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              Tag setups on trades to see per-setup stop analysis.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(160, data.setupRows.length * 32)}>
                <BarChart data={data.setupRows} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
                  <YAxis type="category" dataKey="setup" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="stopRate" fill="hsl(var(--trade-red))" name="Stop-out %" />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {data.setupRows.slice(0, 5).map((r) => (
                  <div
                    key={r.setup}
                    className="flex items-center justify-between text-xs border-b border-border/50 pb-1"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {r.setup}
                      </Badge>
                      <span className="text-muted-foreground">
                        avg stop {r.avgStop.toFixed(1)}pt
                      </span>
                    </div>
                    <div className="font-data">
                      Suggested:{" "}
                      <span className="text-trade-green">
                        {r.suggestedStop > 0 ? `${r.suggestedStop.toFixed(1)} pt` : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                Suggested = avg MAE × 1.2 (20% buffer beyond typical adverse excursion).
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default StopAnalytics;