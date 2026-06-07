import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PieChart as PieIcon,
  TrendingUp,
  LogOut,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { Trade } from "@/lib/tradeService";
import { generateExitInsight } from "@/lib/api/exitInsight.functions";

type Props = {
  trades: Trade[];
  tickValue?: number;
};

type ExitCategory = "Full Target" | "Early Exit" | "Let It Run" | "Scratch";

const CATEGORY_COLORS: Record<ExitCategory, string> = {
  "Full Target": "hsl(var(--trade-green))",
  "Early Exit": "hsl(var(--trade-amber))",
  "Let It Run": "hsl(var(--trade-blue))",
  Scratch: "hsl(var(--muted-foreground))",
};

const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function categorize(t: Trade): ExitCategory | null {
  const r = typeof t.r_multiple === "number" ? Number(t.r_multiple) : null;
  if (r == null) return null;

  // Derive target R from entry/stop/target
  let targetR: number | null = null;
  if (
    typeof t.entry === "number" &&
    typeof t.stop === "number" &&
    typeof t.target === "number"
  ) {
    const risk = Math.abs(Number(t.entry) - Number(t.stop));
    const reward = Math.abs(Number(t.target) - Number(t.entry));
    if (risk > 0) targetR = reward / risk;
  }

  if (t.result === "Loss") return null; // exits-from-stop covered in Stops tab
  if (Math.abs(r) < 0.1) return "Scratch";
  if (t.result !== "Win") return null;

  if (targetR == null) {
    // fallback: anything >= 0.9R counts as full target
    if (r >= 1.5) return "Let It Run";
    if (r >= 0.9) return "Full Target";
    return "Early Exit";
  }
  if (r >= targetR + 0.15) return "Let It Run";
  if (r >= targetR - 0.15) return "Full Target";
  return "Early Exit";
}

export function ExitAnalytics({ trades, tickValue = 5 }: Props) {
  const data = useMemo(() => {
    const active = trades.filter((t) => !t.deleted_at);

    // Categorize
    const buckets: Record<ExitCategory, Trade[]> = {
      "Full Target": [],
      "Early Exit": [],
      "Let It Run": [],
      Scratch: [],
    };
    let categorized = 0;
    for (const t of active) {
      const c = categorize(t);
      if (c) {
        buckets[c].push(t);
        categorized += 1;
      }
    }
    const pie = (Object.keys(buckets) as ExitCategory[]).map((k) => ({
      name: k,
      value: buckets[k].length,
      pct: categorized ? (buckets[k].length / categorized) * 100 : 0,
    }));

    // R left on table — winners with MFE
    const winnersWithMfe = active.filter(
      (t) =>
        t.result === "Win" &&
        typeof t.r_multiple === "number" &&
        typeof t.max_favorable_excursion_points === "number" &&
        typeof t.stop_distance_points === "number" &&
        Number(t.stop_distance_points) > 0,
    );
    const avgActualR =
      winnersWithMfe.reduce((s, t) => s + Number(t.r_multiple), 0) /
      (winnersWithMfe.length || 1);
    const avgMfeR =
      winnersWithMfe.reduce(
        (s, t) =>
          s +
          Number(t.max_favorable_excursion_points) /
            Number(t.stop_distance_points),
        0,
      ) / (winnersWithMfe.length || 1);
    const rLeft = Math.max(0, avgMfeR - avgActualR);
    const avgRisk =
      winnersWithMfe.reduce(
        (s, t) => s + Number(t.stop_distance_points) * tickValue,
        0,
      ) / (winnersWithMfe.length || 1);
    const dollarsLeftPerTrade = rLeft * avgRisk;

    // Early exit analysis
    const earlyExits = buckets["Early Exit"];
    const earlyWithMfe = earlyExits.filter(
      (t) =>
        typeof t.max_favorable_excursion_points === "number" &&
        typeof t.stop_distance_points === "number" &&
        Number(t.stop_distance_points) > 0,
    );
    let hitTargetAnyway = 0;
    let reversedAfter = 0;
    for (const t of earlyWithMfe) {
      const mfeR =
        Number(t.max_favorable_excursion_points) /
        Number(t.stop_distance_points);
      let targetR = 1.5;
      if (
        typeof t.entry === "number" &&
        typeof t.stop === "number" &&
        typeof t.target === "number"
      ) {
        const risk = Math.abs(Number(t.entry) - Number(t.stop));
        const reward = Math.abs(Number(t.target) - Number(t.entry));
        if (risk > 0) targetR = reward / risk;
      }
      if (mfeR >= targetR - 0.1) hitTargetAnyway += 1;
      else reversedAfter += 1;
    }
    const earlyCorrectPct = earlyWithMfe.length
      ? (reversedAfter / earlyWithMfe.length) * 100
      : 0;

    // Optimal exit suggestion (scale out)
    let scaleOutGain = 0;
    if (winnersWithMfe.length && avgMfeR > 1) {
      // Compare: current expectancy (avgActualR) vs 50% at 1R + 50% at min(2R, avgMfeR)
      const runR = Math.min(2, avgMfeR);
      const blended = 0.5 * 1 + 0.5 * runR;
      scaleOutGain = (blended - avgActualR) * avgRisk;
    }

    return {
      pie,
      categorized,
      buckets,
      winnersWithMfeCount: winnersWithMfe.length,
      avgActualR,
      avgMfeR,
      rLeft,
      dollarsLeftPerTrade,
      earlyExitsCount: earlyExits.length,
      earlyWithMfeCount: earlyWithMfe.length,
      hitTargetAnyway,
      reversedAfter,
      earlyCorrectPct,
      scaleOutGain,
    };
  }, [trades, tickValue]);

  // AI insights
  const [insights, setInsights] = useState<string[]>([]);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const genInsight = useServerFn(generateExitInsight);

  const summary = useMemo(() => {
    if (data.categorized < 5) return "";
    const parts: string[] = [];
    parts.push(
      `Exit mix (n=${data.categorized}): ${data.pie
        .filter((p) => p.value > 0)
        .map((p) => `${p.name} ${p.value} (${p.pct.toFixed(0)}%)`)
        .join(", ")}.`,
    );
    if (data.winnersWithMfeCount > 0) {
      parts.push(
        `Winners (n=${data.winnersWithMfeCount}): avg exit ${data.avgActualR.toFixed(
          2,
        )}R, avg MFE ${data.avgMfeR.toFixed(2)}R, leaving ${data.rLeft.toFixed(
          2,
        )}R (~${fmtUSD(data.dollarsLeftPerTrade)}) on the table per trade.`,
      );
    }
    if (data.earlyWithMfeCount > 0) {
      parts.push(
        `Early exits (n=${data.earlyWithMfeCount}): correct ${data.reversedAfter} times (${data.earlyCorrectPct.toFixed(
          0,
        )}%), would-have-hit-target ${data.hitTargetAnyway} times.`,
      );
    }
    return parts.join("\n");
  }, [data]);

  useEffect(() => {
    if (!summary) {
      setInsights([]);
      return;
    }
    let cancelled = false;
    setLoadingInsights(true);
    setInsightError(null);
    void genInsight({ data: { summary } })
      .then((res) => {
        if (cancelled) return;
        setInsights(res.insights);
        setInsightError(res.error ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setInsightError(e instanceof Error ? e.message : "AI insight failed");
      })
      .finally(() => {
        if (!cancelled) setLoadingInsights(false);
      });
    return () => {
      cancelled = true;
    };
  }, [summary, genInsight]);

  if (data.categorized === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No exit data yet. Log winning trades to unlock Exit Analytics.
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
            <PieIcon className="h-4 w-4 text-trade-blue" />
            Exit Quality Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.pie.filter((p) => p.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {data.pie.map((p) => (
                    <Cell key={p.name} fill={CATEGORY_COLORS[p.name as ExitCategory]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {data.pie.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center justify-between text-xs border-b border-border/50 pb-1"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full inline-block"
                      style={{ background: CATEGORY_COLORS[p.name as ExitCategory] }}
                    />
                    {p.name}
                  </div>
                  <div className="font-data">
                    {p.value} · {p.pct.toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: R left on table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-data flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-trade-green" />
            R Left on Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.winnersWithMfeCount === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              Log MFE on winning trades to calculate R left on the table.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Avg R achieved
                  </div>
                  <div className="text-xl font-data">{data.avgActualR.toFixed(2)}R</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Avg MFE
                  </div>
                  <div className="text-xl font-data text-trade-green">
                    {data.avgMfeR.toFixed(2)}R
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Left on table
                  </div>
                  <div className="text-xl font-data text-trade-amber">
                    {data.rLeft.toFixed(2)}R
                  </div>
                </div>
              </div>
              {data.rLeft > 0.2 && (
                <div className="rounded-md border border-trade-amber/40 bg-trade-amber/5 p-3 text-xs">
                  You exit at <span className="font-data">{data.avgActualR.toFixed(2)}R</span> but
                  price averages <span className="font-data">{data.avgMfeR.toFixed(2)}R</span> in
                  your favor — leaving roughly{" "}
                  <span className="font-data text-trade-amber">
                    {fmtUSD(data.dollarsLeftPerTrade)}
                  </span>{" "}
                  per trade unrealized.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Early exit analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-data flex items-center gap-2">
            <LogOut className="h-4 w-4 text-trade-amber" />
            Early Exit Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.earlyExitsCount === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              No early exits detected.
            </div>
          ) : data.earlyWithMfeCount === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              Log MFE on early-exit trades to grade them.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Hit target anyway
                  </div>
                  <div className="text-xl font-data text-trade-red">
                    {data.hitTargetAnyway}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Reversed — correct exit
                  </div>
                  <div className="text-xl font-data text-trade-green">
                    {data.reversedAfter}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Correct rate
                  </div>
                  <div className="text-xl font-data">
                    {data.earlyCorrectPct.toFixed(0)}%
                  </div>
                </div>
              </div>
              {data.earlyCorrectPct < 40 ? (
                <div className="flex items-start gap-2 rounded-md border border-trade-red/40 bg-trade-red/5 p-3 text-xs">
                  <AlertTriangle className="h-4 w-4 text-trade-red mt-0.5 shrink-0" />
                  <div>You are exiting too early — let trades breathe.</div>
                </div>
              ) : data.earlyCorrectPct > 70 ? (
                <div className="rounded-md border border-trade-green/40 bg-trade-green/5 p-3 text-xs">
                  Your early exits are well-timed — keep this skill.
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Mixed early-exit timing — review case-by-case.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Optimal exit recommendation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-data flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-trade-blue" />
            Optimal Exit Recommendation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.winnersWithMfeCount === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              Need MFE data to recommend an exit strategy.
            </div>
          ) : data.scaleOutGain <= 0 ? (
            <div className="text-xs text-muted-foreground">
              Your current exit timing is already near-optimal vs MFE data.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm">
                Consider scaling out:{" "}
                <Badge variant="outline" className="font-data">
                  50% at 1R
                </Badge>{" "}
                ·{" "}
                <Badge variant="outline" className="font-data">
                  50% run to {Math.min(2, data.avgMfeR).toFixed(1)}R
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Estimated improvement:{" "}
                <span className="font-data text-trade-green">
                  +{fmtUSD(data.scaleOutGain)} / trade
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI insights */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-data flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-trade-blue" />
            AI Coach Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!summary ? (
            <div className="text-xs text-muted-foreground">
              Log at least 5 categorized exits to unlock AI insights.
            </div>
          ) : loadingInsights ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing your exits…
            </div>
          ) : insightError ? (
            <div className="text-xs text-trade-red">{insightError}</div>
          ) : insights.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No insights generated.
            </div>
          ) : (
            <ul className="space-y-2">
              {insights.map((s, i) => (
                <li
                  key={i}
                  className="text-sm leading-relaxed border-l-2 border-trade-blue/60 pl-3"
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ExitAnalytics;