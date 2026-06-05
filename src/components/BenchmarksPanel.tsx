import { useMemo } from "react";
import { Target, CheckCircle2, XCircle } from "lucide-react";
import { type Trade } from "@/lib/tradeService";
import { cn } from "@/lib/utils";

interface Props {
  trades: Trade[];
}

type Row = {
  key: string;
  label: string;
  user: number; // normalized value used for chart (0..1, higher = better)
  userDisplay: string;
  target: number; // normalized target threshold
  targetDisplay: string;
  pass: boolean;
};

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function fmtUSD(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function computeRows(trades: Trade[]): Row[] {
  const decisive = trades.filter((t) => t.result === "Win" || t.result === "Loss");
  const wins = decisive.filter((t) => t.result === "Win");
  const winRate = decisive.length ? wins.length / decisive.length : 0;

  const rs = trades.map((t) => Number(t.r_multiple)).filter((n) => Number.isFinite(n));
  const avgR = rs.length ? rs.reduce((s, n) => s + n, 0) / rs.length : 0;

  const pnls = trades.map((t) => Number(t.pnl ?? 0)).filter((n) => Number.isFinite(n));
  const totalPnl = pnls.reduce((s, n) => s + n, 0);
  const evPerTrade = trades.length ? totalPnl / trades.length : 0;

  // Max consecutive losses (ordered by date asc)
  const ordered = [...trades].sort((a, b) => {
    const ad = new Date(a.date).getTime();
    const bd = new Date(b.date).getTime();
    return ad - bd;
  });
  let maxStreak = 0;
  let cur = 0;
  for (const t of ordered) {
    if (t.result === "Loss") {
      cur += 1;
      if (cur > maxStreak) maxStreak = cur;
    } else if (t.result === "Win") {
      cur = 0;
    }
  }

  // Avg trades/day across distinct trading days
  const dayKeys = new Set(trades.map((t) => String(t.date).slice(0, 10)));
  const tradesPerDay = dayKeys.size ? trades.length / dayKeys.size : 0;

  // A+ setups: checklist_score >= 4
  const aPlus = trades.filter((t) => Number(t.checklist_score ?? 0) >= 4);
  const aPlusDecisive = aPlus.filter((t) => t.result === "Win" || t.result === "Loss");
  const aPlusWinRate = aPlusDecisive.length
    ? aPlusDecisive.filter((t) => t.result === "Win").length / aPlusDecisive.length
    : 0;

  // Normalize each metric to 0..1 where 1 = fully meeting/exceeding target
  const norm = (val: number, target: number, cap = target * 2) => {
    if (cap <= 0) return 0;
    return Math.max(0, Math.min(1, val / cap));
  };

  return [
    {
      key: "winRate",
      label: "Win Rate",
      user: norm(winRate, 0.45, 0.9),
      userDisplay: fmtPct(winRate),
      target: norm(0.45, 0.45, 0.9),
      targetDisplay: "45%+",
      pass: winRate >= 0.45,
    },
    {
      key: "avgR",
      label: "Avg R",
      user: norm(Math.max(avgR, 0), 1.5, 3),
      userDisplay: `${avgR.toFixed(2)}R`,
      target: norm(1.5, 1.5, 3),
      targetDisplay: "1.5R+",
      pass: avgR >= 1.5,
    },
    {
      key: "ev",
      label: "EV / Trade",
      // Normalize: 0 EV = 0.5, anything positive scales up
      user: evPerTrade >= 0 ? 0.5 + Math.min(0.5, evPerTrade / 200) : Math.max(0, 0.5 + evPerTrade / 200),
      userDisplay: fmtUSD(evPerTrade),
      target: 0.5,
      targetDisplay: "Positive",
      pass: evPerTrade > 0,
    },
    {
      key: "streak",
      label: "Max Consec. Losses",
      // Inverted: fewer is better. 0 losses = 1.0, 5+ losses = 0
      user: Math.max(0, 1 - maxStreak / 5),
      userDisplay: String(maxStreak),
      target: 1 - 4 / 5, // threshold at <5
      targetDisplay: "<5",
      pass: maxStreak < 5,
    },
    {
      key: "perDay",
      label: "Avg Trades / Day",
      // Sweet spot 1-2. Outside that band reduces score.
      user: (() => {
        if (tradesPerDay <= 0) return 0;
        if (tradesPerDay >= 1 && tradesPerDay <= 2) return 1;
        if (tradesPerDay < 1) return tradesPerDay; // 0..1 ramp
        // > 2 — overtrading penalty
        return Math.max(0, 1 - (tradesPerDay - 2) / 4);
      })(),
      userDisplay: tradesPerDay.toFixed(1),
      target: 1,
      targetDisplay: "1–2",
      pass: tradesPerDay >= 1 && tradesPerDay <= 2,
    },
    {
      key: "aPlus",
      label: "Win Rate · A+ Setups",
      user: norm(aPlusWinRate, 0.6, 1),
      userDisplay: aPlusDecisive.length ? fmtPct(aPlusWinRate) : "—",
      target: 0.6,
      targetDisplay: "60%+",
      pass: aPlusDecisive.length > 0 && aPlusWinRate >= 0.6,
    },
  ];
}

function RadarChart({ rows }: { rows: Row[] }) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 110;
  const n = rows.length;

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, v: number) => {
    const a = angle(i);
    return [cx + Math.cos(a) * radius * v, cy + Math.sin(a) * radius * v] as const;
  };

  const rings = [0.25, 0.5, 0.75, 1];

  const userPath = rows
    .map((r, i) => {
      const [x, y] = point(i, Math.max(0.02, r.user));
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ") + " Z";

  const targetPath = rows
    .map((r, i) => {
      const [x, y] = point(i, r.target);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ") + " Z";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto max-w-sm mx-auto">
      {/* Grid rings */}
      {rings.map((r) => (
        <polygon
          key={r}
          points={rows
            .map((_, i) => {
              const [x, y] = point(i, r);
              return `${x.toFixed(2)},${y.toFixed(2)}`;
            })
            .join(" ")}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={1}
          opacity={0.6}
        />
      ))}
      {/* Axes */}
      {rows.map((_, i) => {
        const [x, y] = point(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="hsl(var(--border))"
            strokeWidth={1}
            opacity={0.5}
          />
        );
      })}
      {/* Target polygon (dashed) */}
      <path
        d={targetPath}
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      {/* User polygon — colored by overall pass rate */}
      <path
        d={userPath}
        fill="hsl(var(--primary) / 0.2)"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
      />
      {/* Vertices */}
      {rows.map((r, i) => {
        const [x, y] = point(i, Math.max(0.02, r.user));
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={4}
            fill={r.pass ? "hsl(142 76% 45%)" : "hsl(0 84% 60%)"}
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
          />
        );
      })}
      {/* Labels */}
      {rows.map((r, i) => {
        const a = angle(i);
        const lx = cx + Math.cos(a) * (radius + 28);
        const ly = cy + Math.sin(a) * (radius + 18);
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 10 }}
          >
            {r.label}
          </text>
        );
      })}
    </svg>
  );
}

export function BenchmarksPanel({ trades }: Props) {
  const rows = useMemo(() => computeRows(trades), [trades]);
  const passing = rows.filter((r) => r.pass).length;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">Challenge Benchmarks</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {passing}/{rows.length} targets met
        </span>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Metric</th>
                <th className="text-right px-3 py-2 font-medium">You</th>
                <th className="text-right px-3 py-2 font-medium">Target</th>
                <th className="text-center px-3 py-2 font-medium w-10">·</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">{r.label}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono tabular-nums",
                      r.pass ? "text-foreground" : "text-destructive",
                    )}
                  >
                    {r.userDisplay}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {r.targetDisplay}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.pass ? (
                      <CheckCircle2 className="h-4 w-4 inline text-[hsl(142_76%_45%)]" />
                    ) : (
                      <XCircle className="h-4 w-4 inline text-destructive" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-center justify-center">
          <RadarChart rows={rows} />
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-primary/30 border border-primary" />
              You
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 border-t border-dashed border-muted-foreground" />
              Target
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}