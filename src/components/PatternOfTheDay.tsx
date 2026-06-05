import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, Check } from "lucide-react";

type Pattern = {
  id: string;
  name: string;
  short: string;
  conditions: string;
  checklist: [string, string, string];
  Diagram: (p: { className?: string }) => JSX.Element;
};

// Order is the rotation order: index = day-of-week mod 6 (Sun=0 → ORB).
const PATTERNS: Pattern[] = [
  {
    id: "orb",
    name: "Opening Range Breakout",
    short: "ORB",
    conditions:
      "Trending pre-market with clear bias, range size in line with average true range, and volume expansion on the break.",
    checklist: [
      "Range built in first 15–30 min with a clean high/low",
      "Break closes beyond range on rising volume",
      "Stop fits inside daily risk cap",
    ],
    Diagram: OrbSvg,
  },
  {
    id: "vwap-reclaim",
    name: "VWAP Reclaim",
    short: "VWAP",
    conditions:
      "Choppy open that loses VWAP, then reclaims it cleanly with a strong close back through. Best 10:00–11:30 ET.",
    checklist: [
      "Failed breakdown / breakout before the reclaim",
      "Reclaim candle closes decisively through VWAP",
      "Macro trend supports reclaim direction",
    ],
    Diagram: VwapSvg,
  },
  {
    id: "flag",
    name: "Bull / Bear Flag",
    short: "FLAG",
    conditions:
      "Sharp impulsive pole on volume, followed by a tight low-volume drift against the move. Avoid deep, choppy flags.",
    checklist: [
      "Pole moved on visible volume expansion",
      "Flag retraces less than 50% of the pole",
      "Breakout candle closes beyond the flag boundary",
    ],
    Diagram: FlagSvg,
  },
  {
    id: "break-retest",
    name: "Break & Retest",
    short: "B&R",
    conditions:
      "Well-defined level breaks, then price pulls back to retest it as new support/resistance with a rejection candle.",
    checklist: [
      "Level was tested 2+ times before the break",
      "Pullback respects the level (wick, not body)",
      "Rejection candle closes away from level",
    ],
    Diagram: BreakRetestSvg,
  },
  {
    id: "inside-bar",
    name: "Inside Bar Breakout",
    short: "IB",
    conditions:
      "Tight inside bar after a strong directional candle near a key level. Lower-volatility sessions favor cleaner setups.",
    checklist: [
      "Inside bar prints near support/resistance",
      "Mother bar is in the direction of HTF trend",
      "Break of inside bar on a strong close",
    ],
    Diagram: InsideBarSvg,
  },
  {
    id: "trend-pullback",
    name: "Trend Continuation Pullback",
    short: "PULLBACK",
    conditions:
      "Clear trend on higher timeframe, pullback to a moving average or prior structure, then continuation candle.",
    checklist: [
      "HTF trend obvious (higher highs / lower lows)",
      "Pullback into prior structure / 20EMA",
      "Continuation candle closes with trend",
    ],
    Diagram: PullbackSvg,
  },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PatternOfTheDay() {
  const { pattern, dayLabel } = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    return {
      pattern: PATTERNS[dow % PATTERNS.length],
      dayLabel: WEEKDAY_LABELS[dow],
    };
  }, []);

  const Diagram = pattern.Diagram;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Pattern of the Day · {dayLabel}
        </div>
        <span className="rounded-full border border-trade-green/40 bg-trade-green/10 px-2 py-0.5 text-[10px] font-data uppercase tracking-wider text-trade-green">
          {pattern.short}
        </span>
      </div>

      <div className="grid grid-cols-[88px_1fr] gap-3">
        <div className="rounded-lg border border-border bg-background p-2">
          <Diagram className="h-full w-full" />
        </div>
        <div className="min-w-0">
          <div className="font-heading text-base font-semibold text-foreground">
            {pattern.name}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-data uppercase tracking-wider text-[10px] text-foreground">
              Best conditions ·{" "}
            </span>
            {pattern.conditions}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {pattern.checklist.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-trade-green" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <Link
        to="/setup-library"
        hash={pattern.id}
        className="mt-3 inline-flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs font-data uppercase tracking-wider text-muted-foreground transition hover:border-trade-green/40 hover:text-trade-green"
      >
        Full pattern in Setup Library
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

/* -------- Compact SVG diagrams (88×88 viewport) -------- */

const C = {
  up: "var(--trade-green)",
  down: "var(--trade-red)",
  level: "var(--trade-amber, #f59e0b)",
  vwap: "#60a5fa",
  muted: "rgba(255,255,255,0.25)",
};

function Box({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 100 80" className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="potdArrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 z" fill={C.up} />
        </marker>
      </defs>
      {children}
    </svg>
  );
}

function OrbSvg({ className }: { className?: string }) {
  return (
    <Box className={className}>
      <line x1="0" y1="30" x2="100" y2="30" stroke={C.level} strokeDasharray="3 2" strokeWidth="1" />
      <line x1="0" y1="55" x2="100" y2="55" stroke={C.level} strokeDasharray="3 2" strokeWidth="1" />
      <rect x="10" y="32" width="6" height="20" fill={C.muted} />
      <rect x="20" y="36" width="6" height="14" fill={C.muted} />
      <rect x="30" y="34" width="6" height="18" fill={C.muted} />
      <rect x="44" y="20" width="6" height="22" fill={C.up} />
      <rect x="54" y="12" width="6" height="20" fill={C.up} />
      <rect x="64" y="8" width="6" height="16" fill={C.up} />
      <line x1="42" y1="42" x2="80" y2="8" stroke={C.up} strokeWidth="1" markerEnd="url(#potdArrow)" />
    </Box>
  );
}

function VwapSvg({ className }: { className?: string }) {
  return (
    <Box className={className}>
      <line x1="0" y1="42" x2="100" y2="38" stroke={C.vwap} strokeWidth="1.2" />
      <path d="M5 30 L20 50 L35 60 L48 52 L60 35 L78 22 L95 18" fill="none" stroke={C.up} strokeWidth="1.4" />
      <circle cx="48" cy="52" r="2.5" fill={C.down} />
      <circle cx="60" cy="35" r="2.5" fill={C.up} />
      <text x="60" y="72" fontSize="7" fill={C.up} fontFamily="monospace">RECLAIM</text>
    </Box>
  );
}

function FlagSvg({ className }: { className?: string }) {
  return (
    <Box className={className}>
      <line x1="10" y1="70" x2="40" y2="20" stroke={C.up} strokeWidth="2" />
      <line x1="40" y1="20" x2="70" y2="32" stroke={C.muted} strokeWidth="1" />
      <line x1="40" y1="30" x2="70" y2="42" stroke={C.muted} strokeWidth="1" />
      <rect x="40" y="20" width="30" height="22" fill="none" stroke={C.level} strokeDasharray="2 2" />
      <line x1="70" y1="30" x2="95" y2="8" stroke={C.up} strokeWidth="1.4" markerEnd="url(#potdArrow)" />
    </Box>
  );
}

function BreakRetestSvg({ className }: { className?: string }) {
  return (
    <Box className={className}>
      <line x1="0" y1="42" x2="100" y2="42" stroke={C.level} strokeWidth="1.2" />
      <path d="M5 60 L20 55 L30 48 L42 30 L55 45 L70 38 L90 18" fill="none" stroke={C.up} strokeWidth="1.4" />
      <circle cx="55" cy="45" r="2.5" fill={C.level} />
      <text x="3" y="38" fontSize="6" fill={C.level} fontFamily="monospace">LEVEL</text>
    </Box>
  );
}

function InsideBarSvg({ className }: { className?: string }) {
  return (
    <Box className={className}>
      <rect x="20" y="14" width="14" height="44" fill={C.up} />
      <rect x="40" y="26" width="10" height="22" fill={C.muted} stroke={C.level} />
      <line x1="45" y1="48" x2="45" y2="55" stroke={C.muted} />
      <line x1="45" y1="18" x2="45" y2="26" stroke={C.muted} />
      <line x1="50" y1="26" x2="85" y2="10" stroke={C.up} strokeWidth="1.4" markerEnd="url(#potdArrow)" />
    </Box>
  );
}

function PullbackSvg({ className }: { className?: string }) {
  return (
    <Box className={className}>
      <path d="M5 70 L20 55 L30 60 L45 40 L55 48 L70 25 L80 32 L95 10" fill="none" stroke={C.up} strokeWidth="1.4" />
      <circle cx="55" cy="48" r="2.5" fill={C.level} />
      <circle cx="80" cy="32" r="2.5" fill={C.level} />
      <text x="48" y="65" fontSize="7" fill={C.level} fontFamily="monospace">PB</text>
    </Box>
  );
}