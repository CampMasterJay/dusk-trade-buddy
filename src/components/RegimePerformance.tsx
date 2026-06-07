import { useEffect, useMemo, useState } from "react";
import { Sparkles, Activity, AlertCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import type { Trade } from "@/lib/tradeService";
import {
  MARKET_REGIMES,
  REGIME_GUIDANCE,
  type MarketRegime,
} from "@/lib/marketRegime";
import { generateRegimeInsight } from "@/lib/api/regimeInsight.functions";
import { cn } from "@/lib/utils";

interface Props {
  trades: Trade[];
}

interface RegimeRow {
  regime: MarketRegime;
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgR: number | null;
  netPnl: number;
  bestSetup: { tag: string; wr: number; n: number } | null;
  worstSetup: { tag: string; wr: number; n: number } | null;
}

function computeRegimeRows(trades: Trade[]): RegimeRow[] {
  return MARKET_REGIMES.map((regime) => {
    const inRegime = trades.filter(
      (t) =>
        (t as { market_regime?: string | null }).market_regime === regime,
    );
    const wl = inRegime.filter(
      (t) => t.result === "Win" || t.result === "Loss",
    );
    const wins = wl.filter((t) => t.result === "Win").length;
    const losses = wl.filter((t) => t.result === "Loss").length;
    const winRate = wl.length ? wins / wl.length : null;
    const rs = inRegime
      .map((t) => Number(t.r_multiple))
      .filter((n) => Number.isFinite(n));
    const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    const netPnl = inRegime.reduce((s, t) => s + Number(t.pnl ?? 0), 0);

    // Group by setup_tag within regime
    const bySetup = new Map<string, { wins: number; total: number }>();
    for (const t of wl) {
      const tag = (t as { setup_tag?: string | null }).setup_tag;
      if (!tag) continue;
      const e = bySetup.get(tag) ?? { wins: 0, total: 0 };
      e.total++;
      if (t.result === "Win") e.wins++;
      bySetup.set(tag, e);
    }
    const setupStats = Array.from(bySetup.entries())
      .filter(([, v]) => v.total >= 3)
      .map(([tag, v]) => ({ tag, wr: v.wins / v.total, n: v.total }));
    setupStats.sort((a, b) => b.wr - a.wr);
    const bestSetup = setupStats[0] ?? null;
    const worstSetup =
      setupStats.length > 1 ? setupStats[setupStats.length - 1] : null;

    return {
      regime,
      count: inRegime.length,
      wins,
      losses,
      winRate,
      avgR,
      netPnl,
      bestSetup,
      worstSetup,
    };
  });
}

const CONFIDENCE_THRESHOLD = 20;

function fmtMoney(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

function fmtPct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function RegimePerformance({ trades }: Props) {
  const rows = useMemo(() => computeRegimeRows(trades), [trades]);
  const totalTaggedTrades = useMemo(
    () => rows.reduce((s, r) => s + r.count, 0),
    [rows],
  );

  const [insights, setInsights] = useState<string[]>([]);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const genInsight = useServerFn(generateRegimeInsight);

  const summary = useMemo(() => {
    const parts = rows
      .filter((r) => r.count > 0)
      .map((r) => {
        const setupBits = [];
        if (r.bestSetup)
          setupBits.push(
            `best setup ${r.bestSetup.tag} ${Math.round(
              r.bestSetup.wr * 100,
            )}% (n=${r.bestSetup.n})`,
          );
        if (r.worstSetup)
          setupBits.push(
            `worst setup ${r.worstSetup.tag} ${Math.round(
              r.worstSetup.wr * 100,
            )}% (n=${r.worstSetup.n})`,
          );
        return `${r.regime}: ${r.count} trades, WR ${fmtPct(r.winRate)}, avgR ${
          r.avgR != null ? r.avgR.toFixed(2) : "—"
        }, netPnL ${fmtMoney(r.netPnl)}${
          setupBits.length ? "; " + setupBits.join(", ") : ""
        }.`;
      });
    return parts.join("\n");
  }, [rows]);

  useEffect(() => {
    if (totalTaggedTrades < 5 || !summary) {
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
        setInsightError(e instanceof Error ? e.message : "Insight error");
      })
      .finally(() => {
        if (!cancelled) setLoadingInsights(false);
      });
    return () => {
      cancelled = true;
    };
  }, [summary, totalTaggedTrades, genInsight]);

  if (totalTaggedTrades === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        <Activity className="mx-auto mb-2 h-5 w-5 opacity-50" />
        Log trades with a market regime on your Game Plan to see this
        breakdown.
      </section>
    );
  }

  const totalPnl = rows.reduce((s, r) => s + r.netPnl, 0);

  return (
    <section className="space-y-4">
      {/* Insights */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold font-heading">
            Regime Insights
          </h3>
        </div>
        {loadingInsights && (
          <p className="text-xs text-muted-foreground font-data">
            Analyzing your regime performance…
          </p>
        )}
        {!loadingInsights && insights.length === 0 && !insightError && (
          <p className="text-xs text-muted-foreground font-data">
            Log more trades across regimes to surface AI insights.
          </p>
        )}
        {insightError && (
          <p className="text-xs text-trade-red font-data">{insightError}</p>
        )}
        <div className="mt-2 space-y-2">
          {insights.map((i, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs leading-snug text-foreground/90"
            >
              {i}
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold font-heading">By Regime</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs font-data">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="py-2 pr-3">Regime</th>
                <th className="py-2 pr-3 text-right">Trades</th>
                <th className="py-2 pr-3 text-right">Win Rate</th>
                <th className="py-2 pr-3 text-right">Avg R</th>
                <th className="py-2 pr-3 text-right">Net P&amp;L</th>
                <th className="py-2 pr-3">Best Setup</th>
                <th className="py-2">Worst Setup</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lowConf = r.count < CONFIDENCE_THRESHOLD;
                const g = REGIME_GUIDANCE[r.regime];
                return (
                  <tr
                    key={r.regime}
                    className={cn(
                      "border-b border-border/30 last:border-b-0",
                      r.count === 0 && "opacity-40",
                    )}
                  >
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            g.color.split(" ")[1]?.replace("bg-", "bg-") ??
                              "bg-muted",
                          )}
                        />
                        <span className="font-medium">{r.regime}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        Based on {r.count} trade{r.count === 1 ? "" : "s"}
                        {lowConf && r.count > 0 && " · low confidence"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right">{r.count}</td>
                    <td className="py-2 pr-3 text-right">{fmtPct(r.winRate)}</td>
                    <td
                      className={cn(
                        "py-2 pr-3 text-right",
                        r.avgR != null && r.avgR > 0 && "text-trade-green",
                        r.avgR != null && r.avgR < 0 && "text-trade-red",
                      )}
                    >
                      {r.avgR != null ? r.avgR.toFixed(2) : "—"}
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 text-right",
                        r.netPnl > 0 && "text-trade-green",
                        r.netPnl < 0 && "text-trade-red",
                      )}
                    >
                      {fmtMoney(r.netPnl)}
                    </td>
                    <td className="py-2 pr-3">
                      {r.bestSetup
                        ? `${r.bestSetup.tag} (${Math.round(r.bestSetup.wr * 100)}%)`
                        : "—"}
                    </td>
                    <td className="py-2">
                      {r.worstSetup
                        ? `${r.worstSetup.tag} (${Math.round(r.worstSetup.wr * 100)}%)`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Requires {CONFIDENCE_THRESHOLD}+ trades per regime for high-confidence
          conclusions.
        </p>
      </div>

      {/* Frequency + P&L exposure */}
      <div className="grid gap-4 sm:grid-cols-2">
        <RegimeFrequencyChart rows={rows} total={totalTaggedTrades} />
        <RegimePnlChart rows={rows} totalAbsPnl={Math.max(1, Math.abs(totalPnl))} />
      </div>
    </section>
  );
}

// --- Charts (simple SVG, no external deps) ---

const REGIME_COLOR_HEX: Record<MarketRegime, string> = {
  "Trending Up": "hsl(142 76% 45%)",
  "Trending Down": "hsl(0 84% 60%)",
  Ranging: "hsl(38 92% 50%)",
  "High Volatility": "hsl(20 90% 55%)",
  "News-Driven": "hsl(270 70% 65%)",
  "Low Volatility": "hsl(200 80% 60%)",
};

function RegimeFrequencyChart({
  rows,
  total,
}: {
  rows: RegimeRow[];
  total: number;
}) {
  const active = rows.filter((r) => r.count > 0);
  let cumulative = 0;
  const slices = active.map((r) => {
    const startAngle = (cumulative / total) * Math.PI * 2;
    cumulative += r.count;
    const endAngle = (cumulative / total) * Math.PI * 2;
    return { ...r, startAngle, endAngle };
  });

  const cx = 60;
  const cy = 60;
  const radius = 50;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold font-heading">
        Regime Frequency
      </h3>
      <div className="flex items-center gap-4">
        <svg width={120} height={120} viewBox="0 0 120 120">
          {slices.length === 1 ? (
            <circle cx={cx} cy={cy} r={radius} fill={REGIME_COLOR_HEX[slices[0].regime]} />
          ) : (
            slices.map((s) => {
              const x1 = cx + radius * Math.sin(s.startAngle);
              const y1 = cy - radius * Math.cos(s.startAngle);
              const x2 = cx + radius * Math.sin(s.endAngle);
              const y2 = cy - radius * Math.cos(s.endAngle);
              const large = s.endAngle - s.startAngle > Math.PI ? 1 : 0;
              return (
                <path
                  key={s.regime}
                  d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`}
                  fill={REGIME_COLOR_HEX[s.regime]}
                />
              );
            })
          )}
        </svg>
        <ul className="flex-1 space-y-1 text-[11px] font-data">
          {active.map((r) => (
            <li key={r.regime} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: REGIME_COLOR_HEX[r.regime] }}
              />
              <span className="flex-1 truncate">{r.regime}</span>
              <span className="text-muted-foreground">
                {Math.round((r.count / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RegimePnlChart({
  rows,
  totalAbsPnl,
}: {
  rows: RegimeRow[];
  totalAbsPnl: number;
}) {
  const active = rows.filter((r) => r.count > 0);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold font-heading">
        P&amp;L Exposure
      </h3>
      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((r) => {
            const pct = Math.abs(r.netPnl) / totalAbsPnl;
            const positive = r.netPnl >= 0;
            return (
              <li key={r.regime} className="text-[11px] font-data">
                <div className="flex justify-between">
                  <span>{r.regime}</span>
                  <span
                    className={cn(
                      positive ? "text-trade-green" : "text-trade-red",
                    )}
                  >
                    {fmtMoney(r.netPnl)}
                  </span>
                </div>
                <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0",
                      positive ? "bg-trade-green" : "bg-trade-red",
                    )}
                    style={{ width: `${Math.max(2, pct * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {active.some((r) => r.count < CONFIDENCE_THRESHOLD) && (
        <p className="mt-3 flex items-start gap-1 text-[10px] text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          Some regimes still have fewer than {CONFIDENCE_THRESHOLD} trades —
          treat their P&amp;L as preliminary.
        </p>
      )}
    </div>
  );
}