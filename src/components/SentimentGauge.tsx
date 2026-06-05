import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMacroIndicators } from "@/lib/api/macroContext.functions";
import { ARTICLES } from "@/lib/newsData";
import { listChartAnalyses } from "@/lib/chartAnalysisService";
import { useAuth } from "@/components/AuthProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const REFRESH_MS = 15 * 60 * 1000;

type Zone =
  | "Extreme Fear"
  | "Fear"
  | "Neutral"
  | "Greed"
  | "Extreme Greed";

function zoneFor(score: number): Zone {
  if (score < 20) return "Extreme Fear";
  if (score < 40) return "Fear";
  if (score < 60) return "Neutral";
  if (score < 80) return "Greed";
  return "Extreme Greed";
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function vixToScore(vix: number | null): number | null {
  if (vix == null || !Number.isFinite(vix)) return null;
  // 10 → 100 (greed), 35 → 0 (fear)
  return clamp(100 - (vix - 10) * 4);
}

function newsToScore(): number | null {
  const recent = [...ARTICLES]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 10);
  if (recent.length === 0) return null;
  const sum = recent.reduce((acc, a) => {
    if (a.sentiment === "bullish") return acc + 1;
    if (a.sentiment === "bearish") return acc - 1;
    return acc;
  }, 0);
  const avg = sum / recent.length; // -1..1
  return clamp(50 + avg * 50);
}

function trendToScore(trend: string | null | undefined): number | null {
  if (!trend) return null;
  const t = trend.toLowerCase();
  if (t.includes("bull") || t.includes("up")) return 80;
  if (t.includes("bear") || t.includes("down")) return 20;
  if (t.includes("neutral") || t.includes("range") || t.includes("side"))
    return 50;
  return null;
}

export function SentimentGauge() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const fetchMacro = useServerFn(getMacroIndicators);

  const [vix, setVix] = useState<number | null>(null);
  const [trend, setTrend] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetchMacro();
        if (active && res.ok) setVix(res.data.vix);
      } catch {
        /* keep null, will fall back */
      }
      if (userId) {
        const { data } = await listChartAnalyses(userId);
        if (active && data && data.length > 0) {
          setTrend((data[0] as { trend?: string | null }).trend ?? null);
        }
      }
    };
    load();
    const id = setInterval(() => {
      setTick((t) => t + 1);
      load();
    }, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [fetchMacro, userId]);

  const { score, parts } = useMemo(() => {
    const v = vixToScore(vix);
    const n = newsToScore();
    const t = trendToScore(trend);
    const weighted: Array<[number, number]> = [];
    if (v != null) weighted.push([v, 0.5]);
    if (n != null) weighted.push([n, 0.3]);
    if (t != null) weighted.push([t, 0.2]);
    if (weighted.length === 0) return { score: 50, parts: { v, n, t } };
    const wSum = weighted.reduce((s, [, w]) => s + w, 0);
    const total = weighted.reduce((s, [val, w]) => s + val * w, 0);
    return { score: Math.round(total / wSum), parts: { v, n, t } };
    // tick triggers re-eval if needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vix, trend, tick]);

  const zone = zoneFor(score);
  const zoneColor =
    score < 20
      ? "text-trade-red"
      : score < 40
        ? "text-trade-amber"
        : score < 60
          ? "text-muted-foreground"
          : score < 80
            ? "text-trade-green"
            : "text-trade-green";

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
          Market Sentiment
        </div>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label="About sentiment gauge"
              >
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[240px] text-xs">
              Sentiment affects setup reliability. Trade smaller in Extreme
              Fear/Greed zones.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="mt-2 flex flex-col items-center">
        <GaugeSvg score={score} />
        <div className="-mt-4 text-center">
          <div className="font-data text-3xl font-bold tracking-tight text-foreground">
            {score}
          </div>
          <div className={`font-data text-sm ${zoneColor}`}>{zone}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Contribution label="VIX" value={parts.v} suffix={vix != null ? ` · ${vix.toFixed(1)}` : ""} />
        <Contribution label="News" value={parts.n} />
        <Contribution label="Trend" value={parts.t} suffix={trend ? ` · ${trend}` : ""} />
      </div>
    </section>
  );
}

function Contribution({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {label}
        {suffix}
      </div>
      <div className="mt-0.5 font-data text-sm font-semibold text-foreground">
        {value == null ? "—" : Math.round(value)}
      </div>
    </div>
  );
}

function GaugeSvg({ score }: { score: number }) {
  // Semicircle from 180° (left) to 0° (right). Needle angle in degrees.
  const angle = 180 - (clamp(score) / 100) * 180; // 180 at score=0, 0 at score=100
  const rad = (angle * Math.PI) / 180;
  const cx = 110;
  const cy = 110;
  const r = 90;
  const nx = cx + Math.cos(rad) * (r - 6);
  const ny = cy - Math.sin(rad) * (r - 6);

  // Build 5 colored arc segments
  const segments = [
    { from: 0, to: 20, color: "#ef4444" }, // red
    { from: 20, to: 40, color: "#f59e0b" }, // amber-dark
    { from: 40, to: 60, color: "#eab308" }, // yellow
    { from: 60, to: 80, color: "#84cc16" }, // lime
    { from: 80, to: 100, color: "#22c55e" }, // green
  ];

  const arcPath = (from: number, to: number) => {
    const a1 = ((180 - (from / 100) * 180) * Math.PI) / 180;
    const a2 = ((180 - (to / 100) * 180) * Math.PI) / 180;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy - Math.sin(a1) * r;
    const x2 = cx + Math.cos(a2) * r;
    const y2 = cy - Math.sin(a2) * r;
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  return (
    <svg
      viewBox="0 0 220 130"
      className="w-full max-w-[320px]"
      role="img"
      aria-label={`Sentiment score ${score} of 100`}
    >
      {segments.map((s) => (
        <path
          key={s.from}
          d={arcPath(s.from, s.to)}
          stroke={s.color}
          strokeWidth={14}
          strokeLinecap="butt"
          fill="none"
          opacity={0.9}
        />
      ))}
      {/* tick labels */}
      <text x={14} y={124} fontSize={8} fill="hsl(var(--muted-foreground))" className="font-data">
        Extreme Fear
      </text>
      <text x={cx} y={124} fontSize={8} fill="hsl(var(--muted-foreground))" textAnchor="middle" className="font-data">
        Neutral
      </text>
      <text x={206} y={124} fontSize={8} fill="hsl(var(--muted-foreground))" textAnchor="end" className="font-data">
        Extreme Greed
      </text>
      {/* needle */}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke="hsl(var(--foreground))"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={6} fill="hsl(var(--foreground))" />
    </svg>
  );
}