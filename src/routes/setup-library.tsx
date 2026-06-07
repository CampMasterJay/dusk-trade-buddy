import { useEffect, useMemo, useState, type ReactElement } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Zap,
  Activity,
  Flag,
  RefreshCw,
  Box,
  TrendingUp,
  Clock,
  Target as TargetIcon,
  Shield,
  Percent,
  Sun,
  CheckCircle2,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { getAllTrades, type Trade } from "@/lib/tradeService";
import {
  computeSetupHealth,
  STATUS_META,
  type SetupHealth,
} from "@/lib/setupHealth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/setup-library")({
  head: () => ({
    meta: [
      { title: "Setup Library — Reference Guide" },
      { name: "description", content: "Reference guide for 6 core day trading setups." },
    ],
  }),
  component: SetupLibraryPage,
});

type SetupDiagram = (props: { className?: string }) => ReactElement;

type Setup = {
  id: string;
  name: string;
  short: string;
  tag: string; // setup_tag value used in trades table
  icon: LucideIcon;
  timeframe: string;
  entry: string;
  stop: string;
  target: string;
  winRate: string;
  session: string;
  description: string;
  mistakes: string[];
  diagram: SetupDiagram;
};

// ---------- SVG diagrams ----------
const stroke = {
  axis: "hsl(var(--border))",
  candle: "hsl(var(--muted-foreground))",
  up: "#22c55e",
  down: "#f87171",
  level: "#f59e0b",
  vwap: "#60a5fa",
  entry: "#22c55e",
  stopLine: "#f87171",
  target: "#4ade80",
};

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 320 160"
      className={`block h-full w-full ${className ?? ""}`}
      role="img"
      aria-hidden
    >
      <rect x="0" y="0" width="320" height="160" fill="transparent" />
      {/* gridlines */}
      <g stroke={stroke.axis} strokeWidth="0.5" opacity="0.4">
        <line x1="0" y1="40" x2="320" y2="40" />
        <line x1="0" y1="80" x2="320" y2="80" />
        <line x1="0" y1="120" x2="320" y2="120" />
      </g>
      {children}
    </svg>
  );
}

function Candle({
  x,
  high,
  low,
  open,
  close,
  w = 6,
}: {
  x: number;
  high: number;
  low: number;
  open: number;
  close: number;
  w?: number;
}) {
  const up = close <= open; // SVG y is inverted; close<open means price went up visually
  const color = up ? stroke.up : stroke.down;
  const top = Math.min(open, close);
  const h = Math.max(1, Math.abs(open - close));
  return (
    <g>
      <line x1={x} x2={x} y1={high} y2={low} stroke={color} strokeWidth="1" />
      <rect x={x - w / 2} y={top} width={w} height={h} fill={color} />
    </g>
  );
}

const OrbDiagram: SetupDiagram = () => (
  <Frame>
    {/* opening range box */}
    <rect x="20" y="70" width="80" height="40" fill={stroke.level} fillOpacity="0.1" stroke={stroke.level} strokeDasharray="3 3" />
    <text x="22" y="66" fontSize="8" fill={stroke.level} fontFamily="monospace">OR HIGH</text>
    {/* range candles */}
    <Candle x={30} open={95} close={80} high={70} low={105} />
    <Candle x={45} open={85} close={95} high={75} low={108} />
    <Candle x={60} open={92} close={78} high={72} low={102} />
    <Candle x={75} open={80} close={90} high={73} low={100} />
    <Candle x={90} open={88} close={75} high={72} low={98} />
    {/* breakout */}
    <Candle x={115} open={75} close={55} high={50} low={80} />
    <Candle x={130} open={55} close={45} high={40} low={60} />
    <Candle x={145} open={45} close={35} high={30} low={50} />
    <Candle x={160} open={35} close={28} high={24} low={40} />
    {/* entry arrow */}
    <line x1="105" y1="70" x2="155" y2="35" stroke={stroke.entry} strokeWidth="1.5" markerEnd="url(#ah)" />
    <defs>
      <marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill={stroke.entry} />
      </marker>
    </defs>
    <text x="170" y="40" fontSize="8" fill={stroke.entry} fontFamily="monospace">BREAKOUT</text>
  </Frame>
);

const VwapDiagram: SetupDiagram = () => (
  <Frame>
    {/* vwap curve */}
    <path
      d="M10,60 C60,65 110,75 160,80 C210,85 260,82 310,78"
      stroke={stroke.vwap}
      strokeWidth="1.5"
      fill="none"
      strokeDasharray="2 2"
    />
    <text x="10" y="55" fontSize="8" fill={stroke.vwap} fontFamily="monospace">VWAP</text>
    {/* price dips below */}
    <Candle x={40} open={70} close={95} high={65} low={110} />
    <Candle x={60} open={95} close={110} high={88} low={120} />
    <Candle x={80} open={108} close={100} high={95} low={118} />
    {/* reclaim */}
    <Candle x={110} open={100} close={80} high={75} low={105} />
    <Candle x={130} open={80} close={65} high={60} low={85} />
    <Candle x={155} open={65} close={50} high={45} low={70} />
    <Candle x={180} open={50} close={40} high={35} low={55} />
    <circle cx="115" cy="80" r="6" fill="none" stroke={stroke.entry} strokeWidth="1.5" />
    <text x="125" y="78" fontSize="8" fill={stroke.entry} fontFamily="monospace">RECLAIM</text>
  </Frame>
);

const FlagDiagram: SetupDiagram = () => (
  <Frame>
    {/* pole */}
    <Candle x={30} open={120} close={95} high={88} low={125} />
    <Candle x={45} open={95} close={70} high={65} low={100} />
    <Candle x={60} open={70} close={45} high={40} low={75} />
    {/* flag consolidation */}
    <Candle x={85} open={50} close={60} high={45} low={68} />
    <Candle x={100} open={60} close={55} high={50} low={68} />
    <Candle x={115} open={55} close={65} high={50} low={72} />
    <Candle x={130} open={65} close={60} high={55} low={75} />
    {/* flag channel lines */}
    <line x1="75" y1="45" x2="145" y2="60" stroke={stroke.level} strokeDasharray="3 3" />
    <line x1="75" y1="72" x2="145" y2="80" stroke={stroke.level} strokeDasharray="3 3" />
    {/* breakout */}
    <Candle x={160} open={62} close={45} high={38} low={66} />
    <Candle x={180} open={45} close={28} high={22} low={50} />
    <Candle x={200} open={28} close={18} high={14} low={32} />
    <text x="150" y="25" fontSize="8" fill={stroke.entry} fontFamily="monospace">CONTINUATION</text>
  </Frame>
);

const BreakRetestDiagram: SetupDiagram = () => (
  <Frame>
    {/* resistance level */}
    <line x1="10" y1="80" x2="310" y2="80" stroke={stroke.level} strokeDasharray="3 3" />
    <text x="12" y="76" fontSize="8" fill={stroke.level} fontFamily="monospace">LEVEL</text>
    {/* approach */}
    <Candle x={30} open={110} close={100} high={95} low={115} />
    <Candle x={50} open={100} close={92} high={88} low={108} />
    <Candle x={70} open={92} close={85} high={82} low={98} />
    {/* break */}
    <Candle x={95} open={85} close={62} high={58} low={90} />
    <Candle x={115} open={62} close={55} high={52} low={68} />
    {/* retest */}
    <Candle x={140} open={55} close={70} high={52} low={78} />
    <Candle x={160} open={70} close={78} high={68} low={82} />
    {/* continuation */}
    <Candle x={185} open={78} close={60} high={55} low={82} />
    <Candle x={205} open={60} close={45} high={40} low={65} />
    <Candle x={225} open={45} close={32} high={28} low={50} />
    <circle cx="160" cy="78" r="7" fill="none" stroke={stroke.entry} strokeWidth="1.5" />
    <text x="170" y="100" fontSize="8" fill={stroke.entry} fontFamily="monospace">RETEST ENTRY</text>
  </Frame>
);

const InsideBarDiagram: SetupDiagram = () => (
  <Frame>
    {/* mother bar */}
    <Candle x={80} open={110} close={50} high={40} low={120} w={14} />
    <text x="100" y="38" fontSize="8" fill={stroke.candle} fontFamily="monospace">MOTHER</text>
    {/* inside bars */}
    <Candle x={110} open={70} close={85} high={60} low={95} w={8} />
    <Candle x={128} open={85} close={75} high={65} low={95} w={8} />
    <Candle x={146} open={75} close={82} high={62} low={92} w={8} />
    <text x="115" y="118" fontSize="8" fill={stroke.level} fontFamily="monospace">INSIDE</text>
    {/* breakout */}
    <Candle x={175} open={70} close={48} high={42} low={75} />
    <Candle x={195} open={48} close={32} high={28} low={55} />
    <Candle x={215} open={32} close={22} high={18} low={38} />
    <line x1="60" y1="40" x2="240" y2="40" stroke={stroke.entry} strokeDasharray="2 2" />
    <text x="245" y="44" fontSize="8" fill={stroke.entry} fontFamily="monospace">BREAK</text>
  </Frame>
);

const PullbackDiagram: SetupDiagram = () => (
  <Frame>
    {/* trend line */}
    <line x1="10" y1="140" x2="310" y2="20" stroke={stroke.up} strokeDasharray="3 3" opacity="0.6" />
    {/* impulse 1 */}
    <Candle x={30} open={140} close={120} high={115} low={145} />
    <Candle x={45} open={120} close={105} high={100} low={125} />
    {/* pullback */}
    <Candle x={65} open={105} close={115} high={102} low={120} />
    <Candle x={80} open={115} close={120} high={110} low={125} />
    {/* continuation */}
    <Candle x={105} open={115} close={92} high={88} low={120} />
    <Candle x={125} open={92} close={78} high={72} low={96} />
    {/* pullback 2 */}
    <Candle x={150} open={78} close={88} high={75} low={92} />
    <Candle x={170} open={88} close={92} high={82} low={96} />
    {/* continuation */}
    <Candle x={195} open={88} close={65} high={60} low={92} />
    <Candle x={215} open={65} close={48} high={42} low={68} />
    <Candle x={235} open={48} close={32} high={28} low={52} />
    <circle cx="80" cy="120" r="6" fill="none" stroke={stroke.entry} strokeWidth="1.5" />
    <circle cx="170" cy="92" r="6" fill="none" stroke={stroke.entry} strokeWidth="1.5" />
    <text x="200" y="135" fontSize="8" fill={stroke.entry} fontFamily="monospace">BUY DIPS</text>
  </Frame>
);

const SETUPS: Setup[] = [
  {
    id: "orb",
    name: "Opening Range Breakout",
    short: "ORB",
    tag: "ORB",
    icon: Zap,
    timeframe: "5m / 15m (first 15–30m of session)",
    entry: "Buy/sell on a clean break and close beyond the opening range high/low with volume.",
    stop: "Place stop on the opposite side of the opening range (or last swing inside the range).",
    target: "First target = range height projected; trail rest with structure or VWAP.",
    winRate: "45–55%",
    session: "Cash open (first hour: 9:30–10:30 ET)",
    description:
      "Captures the directional resolution of the price range built during the opening minutes of the session. Works best on days with a clear pre-market bias and elevated volume.",
    mistakes: [
      "Chasing the first wick instead of waiting for a close beyond the range.",
      "Trading ORB on a tight, low-volume range — leads to chop and stop-outs.",
      "Ignoring HTF context — fading a strong trend day with a counter-trend ORB.",
    ],
    diagram: OrbDiagram,
  },
  {
    id: "vwap-reclaim",
    name: "VWAP Reclaim",
    short: "VWAP",
    tag: "VWAP Reclaim",
    icon: Activity,
    timeframe: "1m / 5m intraday",
    entry: "Enter on the first strong close back above (or below) VWAP after a failed breakdown/breakout.",
    stop: "Below (or above) the reclaim candle's low/high, or the swing that produced the failure.",
    target: "Prior session high/low, VWAP bands, or the next intraday liquidity pool.",
    winRate: "50–60%",
    session: "Mid-morning to early afternoon (10:00–14:00 ET)",
    description:
      "A failure-of-failure pattern: price loses VWAP, fails to follow through, then reclaims it. Strong mean-reversion edge when paired with a broader trend bias.",
    mistakes: [
      "Entering on the first cross instead of waiting for a confirmed reclaim close.",
      "Using VWAP reclaim on illiquid tickers where VWAP is meaningless.",
      "Ignoring the macro trend — reclaiming VWAP in a strong down day rarely lasts.",
    ],
    diagram: VwapDiagram,
  },
  {
    id: "flag",
    name: "Bull / Bear Flag",
    short: "FLAG",
    tag: "Flag",
    icon: Flag,
    timeframe: "5m / 15m for intraday, 1h for swing",
    entry: "Enter on the breakout of the flag channel in the direction of the pole.",
    stop: "Just beyond the opposite side of the flag (last swing inside the consolidation).",
    target: "Project the height of the pole from the breakout point (measured move).",
    winRate: "55–65%",
    session: "Any trending session; strongest in first 2 hours and power hour",
    description:
      "A sharp impulsive move (the pole) followed by a tight, low-volume consolidation against the move (the flag). Continuation pattern with a clean measured-move target.",
    mistakes: [
      "Entering deep flags that have retraced more than 50% of the pole.",
      "Forcing the pattern on choppy, overlapping candles — a flag needs clean structure.",
      "Skipping the volume check — breakout should expand on volume.",
    ],
    diagram: FlagDiagram,
  },
  {
    id: "break-retest",
    name: "Break and Retest",
    short: "B&R",
    tag: "B&R",
    icon: RefreshCw,
    timeframe: "15m / 1h for intraday swing levels",
    entry: "After a level breaks, enter on the retest as old resistance becomes new support (or vice versa).",
    stop: "Beyond the retested level, allowing a small buffer for noise.",
    target: "Next significant level of supply/demand on the same timeframe.",
    winRate: "55–65%",
    session: "Best after London/NY open once levels are well-defined",
    description:
      "Highest probability continuation entry — waits for the market to confirm a level flip before entering with tight, well-defined risk.",
    mistakes: [
      "Entering on the initial break instead of waiting for the retest.",
      "Calling every pullback a retest — the level must actually be tested.",
      "Holding through a failed retest instead of cutting fast.",
    ],
    diagram: BreakRetestDiagram,
  },
  {
    id: "inside-bar",
    name: "Inside Bar Breakout",
    short: "IB",
    tag: "Inside Bar",
    icon: Box,
    timeframe: "15m / 1h / Daily",
    entry: "Enter on the break of the inside-bar high/low in the direction of the mother bar.",
    stop: "Opposite side of the inside bar (tight) or the mother bar (wider).",
    target: "1.5–2x the mother bar range, or next structural level.",
    winRate: "45–55%",
    session: "Pre-news compressions and end-of-day setups for next-session breaks",
    description:
      "A volatility-contraction pattern: a small bar nested inside the prior bar's range signals indecision and a coming expansion in the direction of the dominant trend.",
    mistakes: [
      "Trading inside bars against a strong trend.",
      "Taking the trade on a fakeout wick — wait for a body close beyond the range.",
      "Using too tight a stop on a multi-day daily inside bar.",
    ],
    diagram: InsideBarDiagram,
  },
  {
    id: "trend-pullback",
    name: "Trend Continuation Pullback",
    short: "TCP",
    tag: "Other",
    icon: TrendingUp,
    timeframe: "5m / 15m / 1h",
    entry: "Buy a pullback to a moving average / prior structure inside an established trend; enter on bullish reversal candle.",
    stop: "Below the swing low of the pullback (or below the MA).",
    target: "Recent swing high; trail with the trend MA for runners.",
    winRate: "55–65%",
    session: "Any trending session — works best when HTF trend is aligned",
    description:
      "The bread-and-butter trend trade: wait for the market to take a breather inside a clean trend, then enter as the trend resumes. Highest expectancy when HTF and LTF align.",
    mistakes: [
      "Picking pullbacks in a range instead of a trend.",
      "Entering before a reversal trigger — knife-catching the pullback.",
      "Moving stop to break-even too quickly and getting shaken out.",
    ],
    diagram: PullbackDiagram,
  },
];

function SetupLibraryPage() {
  const [selected, setSelected] = useState<Setup | null>(null);
  const { settings } = useUserSettings();
  const { user } = useAuth();
  const balance = Number(settings?.current_balance ?? settings?.starting_balance ?? 100);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // tag → last detected_at ISO string (most recent degradation log row)
  const [lastLogged, setLastLogged] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: tradesData }, { data: logRows }] = await Promise.all([
        getAllTrades(user.id),
        supabase
          .from("setup_health_log")
          .select("setup_type, detected_at")
          .eq("user_id", user.id)
          .order("detected_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setTrades(tradesData ?? []);
      const map: Record<string, string> = {};
      for (const row of logRows ?? []) {
        if (!map[row.setup_type]) map[row.setup_type] = row.detected_at;
      }
      setLastLogged(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const healthByTag = useMemo(() => {
    const map = new Map<string, SetupHealth>();
    for (const s of SETUPS) map.set(s.tag, computeSetupHealth(trades, s.tag));
    return map;
  }, [trades]);

  // Detect newly DEGRADING setups (no log within 7 days) and auto-log them.
  useEffect(() => {
    if (!user || trades.length === 0) return;
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const toLog: SetupHealth[] = [];
    healthByTag.forEach((h) => {
      if (h.status !== "DEGRADING") return;
      const last = lastLogged[h.setupTag];
      if (last && new Date(last).getTime() > sevenDaysAgo) return;
      toLog.push(h);
    });
    if (toLog.length === 0) return;
    (async () => {
      const rows = toLog.map((h) => ({
        user_id: user.id,
        setup_type: h.setupTag,
        all_time_win_rate: Number(h.allTimeWinRate.toFixed(4)),
        recent_win_rate: Number((h.last20WinRate ?? 0).toFixed(4)),
        recent_sample_size: 20,
        action_taken: "Reviewed" as const,
      }));
      const { data, error } = await supabase
        .from("setup_health_log")
        .insert(rows)
        .select("setup_type, detected_at");
      if (!error && data) {
        setLastLogged((prev) => {
          const next = { ...prev };
          for (const r of data) next[r.setup_type] = r.detected_at;
          return next;
        });
      }
    })();
  }, [healthByTag, lastLogged, trades.length, user?.id]);

  async function recordAction(tag: string, action: "Paused" | "Continued" | "Reviewed") {
    if (!user) return;
    const h = healthByTag.get(tag);
    if (!h) return;
    const { error } = await supabase.from("setup_health_log").insert({
      user_id: user.id,
      setup_type: tag,
      all_time_win_rate: Number(h.allTimeWinRate.toFixed(4)),
      recent_win_rate: Number((h.last20WinRate ?? 0).toFixed(4)),
      recent_sample_size: 20,
      action_taken: action,
    });
    if (error) {
      toast.error("Could not save action");
      return;
    }
    toast.success(`Marked ${tag} as ${action}`);
    setDismissed((prev) => new Set(prev).add(tag));
  }

  const degradingAlerts = useMemo(
    () =>
      SETUPS.filter((s) => {
        const h = healthByTag.get(s.tag);
        return h?.status === "DEGRADING" && !dismissed.has(s.tag);
      }),
    [healthByTag, dismissed],
  );

  return (
    <ProtectedRoute>
      <AppHeader balance={balance} />
      <div className="mx-auto max-w-3xl p-4 lg:p-6 space-y-5 pb-24">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/chart-analyzer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[10px] font-data uppercase tracking-wider hover:bg-accent"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </Link>
            <h1 className="text-sm font-bold font-data uppercase tracking-[4px]">
              Setup Library
            </h1>
          </div>
          <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            {SETUPS.length} setups
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Reference cards for the 6 core day-trading setups. Tap any card for the full breakdown.
        </p>

        {degradingAlerts.map((s) => {
          const h = healthByTag.get(s.tag)!;
          return (
            <div
              key={s.tag}
              className="rounded-xl border border-trade-red/40 bg-trade-red/10 p-3 text-xs"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-trade-red" />
                <div className="flex-1 space-y-2">
                  <div className="font-semibold text-trade-red">
                    ⚠️ SETUP ALERT: {s.name}
                  </div>
                  <p className="leading-relaxed text-foreground/90">
                    Your {s.short} setup win rate has dropped from{" "}
                    <span className="font-data font-semibold">
                      {(h.allTimeWinRate * 100).toFixed(0)}%
                    </span>{" "}
                    (all-time) to{" "}
                    <span className="font-data font-semibold">
                      {((h.last20WinRate ?? 0) * 100).toFixed(0)}%
                    </span>{" "}
                    (last 20 trades). Consider pausing this setup and reviewing
                    recent market conditions.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => recordAction(s.tag, "Paused")}
                      className="rounded-md border border-trade-red/40 bg-trade-red/15 px-2.5 py-1 text-[10px] font-data uppercase tracking-wider text-trade-red hover:bg-trade-red/25"
                    >
                      Pause
                    </button>
                    <button
                      onClick={() => recordAction(s.tag, "Reviewed")}
                      className="rounded-md border border-border bg-card px-2.5 py-1 text-[10px] font-data uppercase tracking-wider hover:bg-accent"
                    >
                      Reviewed
                    </button>
                    <button
                      onClick={() => recordAction(s.tag, "Continued")}
                      className="rounded-md border border-border bg-card px-2.5 py-1 text-[10px] font-data uppercase tracking-wider hover:bg-accent"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SETUPS.map((s) => (
            <SetupCard
              key={s.id}
              setup={s}
              health={healthByTag.get(s.tag)}
              onOpen={() => setSelected(s)}
            />
          ))}
        </div>
      </div>

      {selected && <SetupDetailModal setup={selected} onClose={() => setSelected(null)} />}
    </ProtectedRoute>
  );
}

function SetupCard({ setup, onOpen }: { setup: Setup; onOpen: () => void }) {
  const Icon = setup.icon;
  const Diagram = setup.diagram;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-trade-green/40 hover:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-trade-green/30 bg-trade-green/10 text-trade-green">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">{setup.name}</div>
            <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              {setup.short} · {setup.timeframe.split(" ")[0]}
            </div>
          </div>
        </div>
        <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-data text-muted-foreground">
          {setup.winRate}
        </span>
      </div>

      <div className="aspect-[2/1] overflow-hidden rounded-md border border-border bg-background">
        <Diagram />
      </div>

      <div className="space-y-1.5 text-xs">
        <Row icon={TargetIcon} label="Entry" value={setup.entry} />
        <Row icon={Shield} label="Stop" value={setup.stop} />
      </div>
    </button>
  );
}

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          {label}:
        </span>{" "}
        <span className="text-foreground">{value}</span>
      </div>
    </div>
  );
}

function SetupDetailModal({ setup, onClose }: { setup: Setup; onClose: () => void }) {
  const Icon = setup.icon;
  const Diagram = setup.diagram;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[10px] font-data uppercase tracking-wider hover:bg-accent"
          >
            <ArrowLeft className="h-3 w-3" />
            Close
          </button>
          <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            {setup.short}
          </span>
        </div>

        <div className="space-y-5 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-trade-green/30 bg-trade-green/10 text-trade-green">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-foreground">{setup.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{setup.description}</p>
            </div>
          </div>

          <div className="aspect-[2/1] overflow-hidden rounded-lg border border-border bg-background">
            <Diagram />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={Clock} label="Timeframe" value={setup.timeframe} />
            <Stat icon={Percent} label="Win Rate" value={setup.winRate} />
            <Stat icon={Sun} label="Best Session" value={setup.session} />
            <Stat icon={TargetIcon} label="Target" value={setup.target} />
          </div>

          <div className="space-y-3">
            <DetailRow icon={TargetIcon} color="text-trade-green" label="Entry Rule" value={setup.entry} />
            <DetailRow icon={Shield} color="text-trade-red" label="Stop Placement" value={setup.stop} />
            <DetailRow icon={TargetIcon} color="text-trade-green" label="Target Rule" value={setup.target} />
          </div>

          <div className="rounded-xl border border-trade-red/30 bg-trade-red/5 p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-trade-red" />
              <span className="text-[10px] font-data uppercase tracking-[2px] text-trade-red">
                Key Mistakes To Avoid
              </span>
            </div>
            <ul className="space-y-1.5 text-xs text-foreground">
              {setup.mistakes.map((m, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-trade-red" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-trade-green/30 bg-trade-green/5 p-3 text-xs">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-trade-green" />
              <span className="text-foreground">
                Best in: <span className="font-semibold">{setup.session}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="text-[9px] font-data uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1 text-[11px] text-foreground">{value}</div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-background p-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div>
        <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}