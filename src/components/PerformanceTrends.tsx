import { useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import type { Trade } from "@/lib/tradeService";
import { rollingStats } from "@/lib/rollingStats";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_TRADES = 20;
const WINDOW = 20;

const COLORS = {
  green: "#00ffaa",
  red: "#f87171",
  amber: "#f59e0b",
  blue: "#60a5fa",
  axis: "rgba(255,255,255,0.4)",
  grid: "rgba(255,255,255,0.06)",
};

function sortChronological(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return da - db;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

interface RollingPoint {
  i: number; // trade number
  winRate: number | null; // %
  ev: number | null; // $
  regime: string | null;
  date: string;
}

function buildRollingSeries(trades: Trade[]): RollingPoint[] {
  const ordered = sortChronological(trades);
  return ordered.map((t, idx) => {
    if (idx + 1 < WINDOW) {
      return {
        i: idx + 1,
        winRate: null,
        ev: null,
        regime: (t as { market_regime?: string | null }).market_regime ?? null,
        date: t.date,
      };
    }
    const slice = ordered.slice(idx + 1 - WINDOW, idx + 1);
    // rollingStats expects newest-first; reverse the slice
    const m = rollingStats([...slice].reverse(), WINDOW);
    return {
      i: idx + 1,
      winRate: Math.round(m.winRate * 1000) / 10,
      ev: Math.round(m.ev * 100) / 100,
      regime: (t as { market_regime?: string | null }).market_regime ?? null,
      date: t.date,
    };
  });
}

interface RegimeChange {
  i: number;
  regime: string;
  winRate: number | null;
  ev: number | null;
}
function regimeChanges(series: RollingPoint[]): RegimeChange[] {
  const out: RegimeChange[] = [];
  let prev: string | null = null;
  for (const p of series) {
    if (p.regime && p.regime !== prev) {
      out.push({ i: p.i, regime: p.regime, winRate: p.winRate, ev: p.ev });
      prev = p.regime;
    }
  }
  // Skip the very first "change" (just the starting regime)
  return out.slice(1);
}

interface MonthlyPoint {
  month: string; // "2026-03"
  label: string; // "Mar"
  pnl: number;
  running: number;
}

function buildMonthly(trades: Trade[]): MonthlyPoint[] {
  const ordered = sortChronological(trades);
  const map = new Map<string, number>();
  for (const t of ordered) {
    const key = t.date.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + (Number(t.pnl) || 0));
  }
  const keys = Array.from(map.keys()).sort();
  let running = 0;
  return keys.map((k) => {
    const pnl = map.get(k) ?? 0;
    running += pnl;
    const [y, m] = k.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return {
      month: k,
      label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      pnl: Math.round(pnl * 100) / 100,
      running: Math.round(running * 100) / 100,
    };
  });
}

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface Props {
  trades: Trade[];
}

export function PerformanceTrends({ trades }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);

  const series = useMemo(() => buildRollingSeries(trades), [trades]);
  const changes = useMemo(() => regimeChanges(series), [series]);
  const monthly = useMemo(() => buildMonthly(trades), [trades]);

  const enough = trades.length >= MIN_TRADES;

  const handleExport = async () => {
    if (!containerRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: "#0b0b0f",
        scale: 2,
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `performance-trends-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("Charts exported");
    } catch (e) {
      console.error(e);
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (!enough) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 text-center">
        <div className="mb-1 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-data">
          <TrendingUp className="h-3 w-3" />
          Performance Trends
        </div>
        <p className="text-sm text-muted-foreground">
          Need {MIN_TRADES - trades.length} more trade
          {MIN_TRADES - trades.length === 1 ? "" : "s"} to display trends
          (have {trades.length}/{MIN_TRADES}).
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-data">
          <TrendingUp className="h-3 w-3" />
          Performance Trends
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
          className="h-8 gap-1.5 text-xs font-data uppercase tracking-wider"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? "Exporting…" : "Export PNG"}
        </Button>
      </div>

      <div ref={containerRef} className="space-y-3 bg-background p-1">
        <ChartCard
          title="Rolling 20-Trade Win Rate"
          subtitle="Green ≥65% target · Red ≤45% floor"
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={series}
              margin={{ top: 10, right: 12, left: -10, bottom: 0 }}
            >
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="i"
                stroke={COLORS.axis}
                tick={{ fontSize: 10 }}
                label={{
                  value: "Trade #",
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 10,
                  fill: COLORS.axis,
                }}
              />
              <YAxis
                domain={[0, 100]}
                stroke={COLORS.axis}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,15,20,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v) =>
                  v == null ? ["—", "Win Rate"] : [`${v}%`, "Win Rate"]
                }
                labelFormatter={(l) => `Trade #${l}`}
              />
              <ReferenceArea y1={65} y2={100} fill={COLORS.green} fillOpacity={0.06} />
              <ReferenceArea y1={0} y2={45} fill={COLORS.red} fillOpacity={0.06} />
              <ReferenceLine
                y={65}
                stroke={COLORS.green}
                strokeDasharray="4 4"
                strokeOpacity={0.7}
              />
              <ReferenceLine
                y={45}
                stroke={COLORS.red}
                strokeDasharray="4 4"
                strokeOpacity={0.7}
              />
              <Line
                type="monotone"
                dataKey="winRate"
                stroke={COLORS.blue}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              {changes.map((c) =>
                c.winRate != null ? (
                  <ReferenceDot
                    key={`wr-${c.i}`}
                    x={c.i}
                    y={c.winRate}
                    r={4}
                    fill={COLORS.amber}
                    stroke="#0b0b0f"
                  />
                ) : null,
              )}
            </LineChart>
          </ResponsiveContainer>
          {changes.length > 0 && (
            <RegimeLegend changes={changes} />
          )}
        </ChartCard>

        <ChartCard
          title="Rolling 20-Trade EV Per Trade"
          subtitle="Drops to 0 or below = edge breaking down"
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={series}
              margin={{ top: 10, right: 12, left: -5, bottom: 0 }}
            >
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="i"
                stroke={COLORS.axis}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                stroke={COLORS.axis}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => fmtUSD(Number(v))}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,15,20,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v) =>
                  v == null ? ["—", "EV/Trade"] : [fmtUSD(Number(v)), "EV/Trade"]
                }
                labelFormatter={(l) => `Trade #${l}`}
              />
              <ReferenceLine y={0} stroke={COLORS.red} strokeDasharray="4 4" strokeOpacity={0.7} />
              <Line
                type="monotone"
                dataKey="ev"
                stroke={COLORS.green}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              {changes.map((c) =>
                c.ev != null ? (
                  <ReferenceDot
                    key={`ev-${c.i}`}
                    x={c.i}
                    y={c.ev}
                    r={4}
                    fill={COLORS.amber}
                    stroke="#0b0b0f"
                  />
                ) : null,
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Monthly P&L"
          subtitle="Bars = month P&L · Line = running total"
        >
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={monthly}
              margin={{ top: 10, right: 12, left: -5, bottom: 0 }}
            >
              <defs>
                <linearGradient id="runningGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={COLORS.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={COLORS.axis}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                stroke={COLORS.axis}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => fmtUSD(Number(v))}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,15,20,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => [
                  fmtUSD(Number(v)),
                  name === "pnl" ? "Month P&L" : "Running",
                ]}
              />
              <ReferenceLine y={0} stroke={COLORS.axis} strokeOpacity={0.4} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {monthly.map((m, idx) => (
                  <RechartCell key={idx} fill={m.pnl >= 0 ? COLORS.green : COLORS.red} />
                ))}
              </Bar>
              <Area
                type="monotone"
                dataKey="running"
                stroke={COLORS.blue}
                fill="url(#runningGrad)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2">
        <div className="text-xs font-data font-semibold">{title}</div>
        {subtitle && (
          <div className="text-[10px] text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function RegimeLegend({ changes }: { changes: RegimeChange[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
      <span className="font-data uppercase tracking-wider">Regime shifts:</span>
      {changes.slice(0, 6).map((c) => (
        <span
          key={c.i}
          className={cn(
            "rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-400",
          )}
        >
          #{c.i} → {c.regime}
        </span>
      ))}
      {changes.length > 6 && (
        <span className="opacity-70">+{changes.length - 6} more</span>
      )}
    </div>
  );
}

// Recharts re-exports Cell; aliased to avoid collision with any local Cell.
import { Cell as RechartCell } from "recharts";