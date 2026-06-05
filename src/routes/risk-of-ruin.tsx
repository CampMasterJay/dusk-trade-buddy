import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getTradeStats } from "@/lib/tradeService";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/risk-of-ruin")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Risk of Ruin" },
      { name: "description", content: "Simulate your risk of ruin and find a safer max risk per trade." },
      { property: "og:title", content: "EdgeTrader — Risk of Ruin" },
      { property: "og:description", content: "Simulate your risk of ruin and find a safer max risk." },
    ],
  }),
  component: RiskOfRuinRoute,
});

function RiskOfRuinRoute() {
  return (
    <ProtectedRoute>
      <RiskOfRuinScreen />
    </ProtectedRoute>
  );
}

// Mulberry32 deterministic PRNG so curves are reproducible per render.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RUIN_THRESHOLD = 0.5; // 50% drawdown = ruin (prop-style)

/**
 * Simulate `paths` equity curves of `trades` length using fixed-fractional risk.
 * Returns the fraction of paths that hit the ruin threshold and optionally
 * the first `keepPaths` curves for visualization.
 */
function simulate({
  winRate,
  riskPct,
  rWin,
  trades,
  paths,
  seed,
  keepPaths = 0,
}: {
  winRate: number; // 0..1
  riskPct: number; // e.g. 15 means 15%
  rWin: number; // R multiple on wins
  trades: number;
  paths: number;
  seed: number;
  keepPaths?: number;
}) {
  const rng = mulberry32(seed);
  const f = riskPct / 100;
  let ruined = 0;
  const curves: number[][] = [];
  for (let p = 0; p < paths; p++) {
    let bal = 1;
    let peak = 1;
    let pathRuined = false;
    const series: number[] = keepPaths > p ? [1] : [];
    for (let i = 0; i < trades; i++) {
      const r = rng();
      if (r < winRate) bal *= 1 + f * rWin;
      else bal *= 1 - f;
      if (bal > peak) peak = bal;
      if (!pathRuined && bal / peak <= RUIN_THRESHOLD) {
        pathRuined = true;
      }
      if (keepPaths > p) series.push(bal);
    }
    if (pathRuined) ruined += 1;
    if (keepPaths > p) curves.push(series);
  }
  return { rorPct: (ruined / paths) * 100, curves };
}

function safeMaxRisk({
  winRate,
  rWin,
  trades,
  seed,
}: {
  winRate: number;
  rWin: number;
  trades: number;
  seed: number;
}): number | null {
  // Bisection: find the largest risk% where RoR < 5% (resolution 0.1%)
  let lo = 0.1;
  let hi = 25;
  // Quick check: is 0.1% already too risky?
  const lowSim = simulate({
    winRate,
    riskPct: lo,
    rWin,
    trades,
    paths: 800,
    seed,
  });
  if (lowSim.rorPct >= 5) return null;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const { rorPct } = simulate({
      winRate,
      riskPct: mid,
      rWin,
      trades,
      paths: 800,
      seed,
    });
    if (rorPct < 5) lo = mid;
    else hi = mid;
  }
  return Math.max(0.1, Math.round(lo * 10) / 10);
}

function RiskOfRuinScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useUserSettings();
  const currentBalance = Number(settings?.current_balance ?? 100);

  const [winRate, setWinRate] = useState<number>(50);
  const [rWin, setRWin] = useState<number>(Number(settings?.rr_ratio ?? 1.5));
  const [riskPct, setRiskPct] = useState<number>(Number(settings?.risk_pct ?? 15));
  const [tradeCount, setTradeCount] = useState<number>(100);
  const [loading, setLoading] = useState(true);

  // Prefill: pull win rate from stats, the rest from settings.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    getTradeStats(userId).then((res) => {
      if (!active) return;
      if (res.data && res.data.totalTrades >= 3) {
        setWinRate(Math.round(res.data.winRate * 100));
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    setRWin(Number(settings?.rr_ratio ?? 1.5));
    setRiskPct(Number(settings?.risk_pct ?? 15));
  }, [settings?.rr_ratio, settings?.risk_pct]);

  // Validate inputs into safe numbers.
  const wr = clamp(winRate, 1, 99) / 100;
  const r = clamp(rWin, 0.1, 10);
  const rp = clamp(riskPct, 0.1, 50);
  const n = clamp(Math.round(tradeCount), 10, 1000);

  const seed = 42;

  const sim = useMemo(
    () =>
      simulate({
        winRate: wr,
        riskPct: rp,
        rWin: r,
        trades: n,
        paths: 2000,
        seed,
        keepPaths: 10,
      }),
    [wr, rp, r, n],
  );

  const recommended = useMemo(
    () => safeMaxRisk({ winRate: wr, rWin: r, trades: n, seed: seed + 1 }),
    [wr, r, n],
  );

  const zone: "green" | "yellow" | "red" =
    sim.rorPct < 5 ? "green" : sim.rorPct <= 20 ? "yellow" : "red";

  // Chart data: transpose curves into { i, p1, p2, ... }
  const chartData = useMemo(() => {
    const rows: Record<string, number>[] = [];
    const maxLen = Math.max(0, ...sim.curves.map((c) => c.length));
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, number> = { i };
      sim.curves.forEach((curve, idx) => {
        if (curve[i] != null) row[`p${idx}`] = curve[i];
      });
      rows.push(row);
    }
    return rows;
  }, [sim.curves]);

  const curveColors = [
    "var(--trade-green)",
    "var(--trade-amber)",
    "var(--trade-red)",
    "#60a5fa",
    "#a78bfa",
    "#f472b6",
    "#34d399",
    "#fbbf24",
    "#fb7185",
    "#22d3ee",
  ];

  return (
    <>
      <AppHeader balance={currentBalance} />
      <div className="px-4 pt-4 pb-24 lg:px-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/trade-log"
            className="inline-flex items-center gap-1 text-xs font-data uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Trade Log
          </Link>
        </div>

        <header className="mb-5">
          <h1 className="text-2xl font-bold font-heading">Risk of Ruin</h1>
          <p className="text-xs text-muted-foreground font-data uppercase tracking-wider mt-1">
            Simulate how often your strategy blows up the account
          </p>
        </header>

        {loading ? (
          <div className="py-16 flex justify-center">
            <LoadingSpinner label="Loading inputs..." />
          </div>
        ) : (
          <>
            {/* Inputs */}
            <section className="rounded-2xl border border-border bg-card p-4 mb-5">
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label="Win rate %"
                  value={winRate}
                  onChange={setWinRate}
                  step={1}
                  min={1}
                  max={99}
                  suffix="%"
                />
                <InputField
                  label="Avg R on wins"
                  value={rWin}
                  onChange={setRWin}
                  step={0.1}
                  min={0.1}
                  max={10}
                  suffix="R"
                />
                <InputField
                  label="Risk per trade %"
                  value={riskPct}
                  onChange={setRiskPct}
                  step={0.5}
                  min={0.1}
                  max={50}
                  suffix="%"
                />
                <InputField
                  label="Trades to simulate"
                  value={tradeCount}
                  onChange={setTradeCount}
                  step={10}
                  min={10}
                  max={1000}
                />
              </div>
            </section>

            {/* Result */}
            <ResultCard
              ror={sim.rorPct}
              zone={zone}
              recommended={recommended}
              currentRisk={rp}
            />

            {/* Equity curves */}
            <section className="mt-5 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
                  Monte Carlo · 10 equity curves
                </div>
                <div className="text-[10px] text-muted-foreground font-data">
                  Ruin = {Math.round((1 - RUIN_THRESHOLD) * 100)}% drawdown
                </div>
              </div>
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="i"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                      labelFormatter={(l) => `Trade ${l}`}
                    />
                    <ReferenceLine
                      y={1}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="3 3"
                    />
                    <ReferenceLine
                      y={RUIN_THRESHOLD}
                      stroke="var(--trade-red)"
                      strokeDasharray="6 4"
                      label={{
                        value: "Ruin threshold",
                        fill: "var(--trade-red)",
                        fontSize: 10,
                        position: "insideBottomRight",
                      }}
                    />
                    {sim.curves.map((_, idx) => (
                      <Line
                        key={idx}
                        type="monotone"
                        dataKey={`p${idx}`}
                        stroke={curveColors[idx % curveColors.length]}
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                        strokeOpacity={0.85}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Explanation */}
            <section className="mt-5 rounded-2xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data mb-2">
                What this means
              </div>
              <p className="text-sm text-foreground font-data leading-relaxed">
                We simulated <strong>{n}</strong> trades, <strong>2,000</strong>{" "}
                times, using your{" "}
                <strong>{Math.round(wr * 100)}%</strong> win rate, a{" "}
                <strong>{r.toFixed(2)}R</strong> reward on winners, and{" "}
                <strong>{rp.toFixed(1)}%</strong> risk per trade.{" "}
                <strong>{sim.rorPct.toFixed(1)}%</strong> of those runs hit a{" "}
                {Math.round((1 - RUIN_THRESHOLD) * 100)}% drawdown — that's your
                risk of ruin.
              </p>
              <p className="text-sm text-muted-foreground font-data leading-relaxed mt-3">
                {zone === "green" && (
                  <>
                    You're in the <span className="text-trade-green font-semibold">safe zone</span>. Even
                    with normal losing streaks, your account is very unlikely to
                    blow up at this size.
                  </>
                )}
                {zone === "yellow" && (
                  <>
                    You're in the <span className="text-trade-amber font-semibold">caution zone</span>. A
                    rough patch of losses could do real damage. Consider sizing
                    down or improving your edge.
                  </>
                )}
                {zone === "red" && (
                  <>
                    You're in the <span className="text-trade-red font-semibold">danger zone</span>. Your
                    size relative to your edge means a normal losing streak is
                    likely to ruin the account. Cut risk now.
                  </>
                )}
                {recommended != null ? (
                  <>
                    {" "}To keep risk of ruin under <strong>5%</strong>, drop risk
                    per trade to about{" "}
                    <span className="text-trade-green font-semibold">
                      {recommended.toFixed(1)}%
                    </span>{" "}
                    or lower.
                  </>
                ) : (
                  <>
                    {" "}With these win rate and reward inputs, no risk size keeps
                    RoR under 5%. Improve your edge before scaling.
                  </>
                )}
              </p>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function ResultCard({
  ror,
  zone,
  recommended,
  currentRisk,
}: {
  ror: number;
  zone: "green" | "yellow" | "red";
  recommended: number | null;
  currentRisk: number;
}) {
  const color =
    zone === "green"
      ? "text-trade-green"
      : zone === "yellow"
        ? "text-trade-amber"
        : "text-trade-red";
  const border =
    zone === "green"
      ? "border-trade-green/40"
      : zone === "yellow"
        ? "border-trade-amber/40"
        : "border-trade-red/40";
  const bg =
    zone === "green"
      ? "bg-trade-green/5"
      : zone === "yellow"
        ? "bg-trade-amber/5"
        : "bg-trade-red/5";
  const glow =
    zone === "green"
      ? "0 0 24px rgba(0, 255, 170, 0.25)"
      : zone === "yellow"
        ? "0 0 24px rgba(255, 191, 0, 0.20)"
        : "0 0 24px rgba(255, 70, 70, 0.25)";
  const Icon = zone === "green" ? ShieldCheck : zone === "yellow" ? ShieldAlert : ShieldX;
  const label = zone === "green" ? "Safe" : zone === "yellow" ? "Caution" : "Danger";

  return (
    <section
      className={cn("rounded-2xl border p-5", border, bg)}
      style={{ boxShadow: glow }}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
          Risk of Ruin
        </div>
        <div className={cn("inline-flex items-center gap-1.5 text-xs font-data uppercase tracking-wider", color)}>
          <Icon className="h-4 w-4" />
          {label} zone
        </div>
      </div>
      <div className={cn("mt-2 font-data text-5xl font-bold tracking-tight", color)}>
        {ror.toFixed(1)}%
      </div>

      {/* Zone bar */}
      <div className="mt-4">
        <div className="relative h-2 w-full rounded-full overflow-hidden bg-secondary">
          <div className="absolute inset-y-0 left-0 w-[20%] bg-trade-green/40" />
          <div className="absolute inset-y-0 left-[20%] w-[60%] bg-trade-amber/40" />
          <div className="absolute inset-y-0 left-[80%] w-[20%] bg-trade-red/40" />
          <div
            className="absolute top-[-3px] h-4 w-1 rounded-full bg-foreground"
            style={{ left: `calc(${Math.min(100, ror)}% - 2px)` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          <span className="text-trade-green">Safe &lt;5%</span>
          <span className="text-trade-amber">Caution 5–20%</span>
          <span className="text-trade-red">Danger &gt;20%</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
            Current risk
          </div>
          <div className="mt-1 font-data text-lg font-semibold text-foreground">
            {currentRisk.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-trade-green/30 bg-trade-green/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
            Recommended max
          </div>
          <div className="mt-1 font-data text-lg font-semibold text-trade-green">
            {recommended != null ? `${recommended.toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>
    </section>
  );
}

function InputField({
  label,
  value,
  onChange,
  step,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {label}
      </Label>
      <div className="relative">
        <Input
          type="number"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(Number.isFinite(v) ? v : 0);
          }}
          className="font-data pr-8"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-data pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}