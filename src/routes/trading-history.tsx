import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Sparkles,
  Download,
  Trophy,
  Flame,
  TrendingUp,
  Loader2,
  X as XIcon,
  RotateCcw,
  History,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/hooks/useUserSettings";
import {
  listChallenges,
  challengeProfitPct,
  type ChallengeRow,
} from "@/lib/challengeArchive";
import {
  fetchSkillTrades,
  scoreSkills,
  type SkillScores,
} from "@/lib/skillProgression";
import { generateTraderProfile } from "@/lib/api/traderProfile.functions";

export const Route = createFileRoute("/trading-history")({
  head: () => ({
    meta: [
      { title: "My Trading History — Long-Term Performance Archive" },
      {
        name: "description",
        content:
          "Lifetime trading stats, challenge archive, skill progression radar, and AI trader profile.",
      },
    ],
  }),
  component: TradingHistoryPage,
});

function TradingHistoryPage() {
  return (
    <ProtectedRoute>
      <HistoryView />
    </ProtectedRoute>
  );
}

function HistoryView() {
  const { settings } = useUserSettings();
  const balance = Number(settings?.current_balance ?? settings?.starting_balance ?? 100);

  const [trades, setTrades] = useState<Awaited<ReturnType<typeof fetchSkillTrades>>>([]);
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSkillTrades(), listChallenges()])
      .then(([t, c]) => {
        if (cancelled) return;
        setTrades(t);
        setChallenges(c);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const lifetime = useMemo(() => computeLifetime(trades, balance), [trades, balance]);
  const currentScores = useMemo(
    () => scoreSkills(trades, Number(settings?.rr_ratio ?? 1.5)),
    [trades, settings?.rr_ratio],
  );
  const olderScores = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const older = trades.filter((t) => new Date(t.created_at).getTime() < cutoff);
    if (older.length < 5) return null;
    return scoreSkills(older, Number(settings?.rr_ratio ?? 1.5));
  }, [trades, settings?.rr_ratio]);

  const radarData = useMemo(() => {
    const keys = Object.keys(currentScores) as (keyof SkillScores)[];
    return keys.map((k) => ({
      axis: k,
      current: Math.round(currentScores[k]),
      previous: olderScores ? Math.round(olderScores[k]) : 0,
    }));
  }, [currentScores, olderScores]);

  const improving = olderScores
    ? Object.keys(currentScores).reduce(
        (sum, k) =>
          sum + (currentScores[k as keyof SkillScores] - olderScores[k as keyof SkillScores]),
        0,
      ) >= 0
    : true;

  return (
    <>
      <AppHeader balance={balance} />
      <div className="p-4 lg:p-6 pb-24 max-w-3xl mx-auto print:p-0">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" /> Export PDF
          </Button>
        </div>

        <h1 className="text-2xl font-bold font-heading mb-1">My Trading History</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your long-term performance archive across every challenge.
        </p>

        {loading ? (
          <div className="space-y-3">
            <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/20" />
            <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/20" />
          </div>
        ) : (
          <>
            <LifetimeStatsCard lifetime={lifetime} />
            <SkillRadarCard
              data={radarData}
              hasPrevious={!!olderScores}
              improving={improving}
            />
            <TraderProfileCard lifetime={lifetime} trades={trades} scores={currentScores} />
            <ChallengeArchiveCard items={challenges} />
          </>
        )}
      </div>
    </>
  );
}

// ---------- Lifetime Stats ----------

type Lifetime = ReturnType<typeof computeLifetime>;

function computeLifetime(
  trades: Awaited<ReturnType<typeof fetchSkillTrades>>,
  currentBalance: number,
) {
  const decided = trades.filter((t) => t.result === "Win" || t.result === "Loss");
  const wins = decided.filter((t) => t.result === "Win").length;
  const winRate = decided.length ? (wins / decided.length) * 100 : 0;
  const rs = decided.map((t) => Number(t.r_multiple ?? 0));
  const totalR = rs.reduce((a, b) => a + b, 0);
  const avgR = rs.length ? totalR / rs.length : 0;
  const pnls = trades.map((t) => Number(t.pnl ?? 0));
  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const ev = pnls.length ? netPnl / pnls.length : 0;
  const days = new Set(trades.map((t) => t.date)).size;
  const bestSingleR = rs.length ? Math.max(...rs) : 0;

  // Longest win streak
  let cur = 0,
    longest = 0;
  for (const t of decided) {
    if (t.result === "Win") {
      cur += 1;
      longest = Math.max(longest, cur);
    } else {
      cur = 0;
    }
  }

  // Peak balance estimate (running sum from 0 baseline)
  let running = 0;
  let peak = currentBalance;
  const sorted = [...trades].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const t of sorted) {
    running += Number(t.pnl ?? 0);
    if (running > peak) peak = running;
  }
  peak = Math.max(peak, currentBalance);

  return {
    totalTrades: trades.length,
    daysTraded: days,
    winRate,
    avgR,
    totalR,
    netPnl,
    ev,
    peakBalance: peak,
    longestWinStreak: longest,
    bestSingleR,
  };
}

function LifetimeStatsCard({ lifetime }: { lifetime: Lifetime }) {
  const items: { label: string; value: string; tone?: "green" | "red" }[] = [
    { label: "Trading days", value: String(lifetime.daysTraded) },
    { label: "All-time win rate", value: `${lifetime.winRate.toFixed(1)}%` },
    { label: "Avg EV / trade", value: fmtMoney(lifetime.ev), tone: lifetime.ev >= 0 ? "green" : "red" },
    { label: "Total R earned", value: `${lifetime.totalR >= 0 ? "+" : ""}${lifetime.totalR.toFixed(1)}R`, tone: lifetime.totalR >= 0 ? "green" : "red" },
    { label: "Net P&L", value: fmtMoney(lifetime.netPnl), tone: lifetime.netPnl >= 0 ? "green" : "red" },
    { label: "Peak balance", value: fmtMoney(lifetime.peakBalance) },
    { label: "Longest win streak", value: `${lifetime.longestWinStreak}` },
    { label: "Best single trade", value: `${lifetime.bestSingleR.toFixed(2)}R` },
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold font-heading">Lifetime Stats</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {it.label}
            </div>
            <div
              className={cn(
                "mt-1 font-data text-base font-bold",
                it.tone === "green" && "text-trade-green",
                it.tone === "red" && "text-trade-red",
              )}
            >
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "" : "-";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

// ---------- Skill Radar ----------

function SkillRadarCard({
  data,
  hasPrevious,
  improving,
}: {
  data: { axis: string; current: number; previous: number }[];
  hasPrevious: boolean;
  improving: boolean;
}) {
  const fill = hasPrevious
    ? improving
      ? "color-mix(in oklab, var(--trade-green) 35%, transparent)"
      : "color-mix(in oklab, var(--trade-red) 35%, transparent)"
    : "color-mix(in oklab, var(--primary) 30%, transparent)";
  const stroke = hasPrevious
    ? improving
      ? "var(--trade-green)"
      : "var(--trade-red)"
    : "var(--primary)";

  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold font-heading">Skill Progression</h2>
        </div>
        {hasPrevious && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              improving
                ? "bg-trade-green/15 text-trade-green"
                : "bg-trade-red/15 text-trade-red",
            )}
          >
            {improving ? "Improving" : "Declining"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {hasPrevious
          ? "Comparing your current skill profile to 30 days ago."
          : "Build trade history to unlock the 30-day comparison."}
      </p>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
            />
            {hasPrevious && (
              <Radar
                name="30 days ago"
                dataKey="previous"
                stroke="var(--muted-foreground)"
                fill="color-mix(in oklab, var(--muted-foreground) 15%, transparent)"
                strokeDasharray="4 4"
              />
            )}
            <Radar name="Current" dataKey="current" stroke={stroke} fill={fill} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ---------- Trader Profile (AI) ----------

function TraderProfileCard({
  lifetime,
  trades,
  scores,
}: {
  lifetime: Lifetime;
  trades: Awaited<ReturnType<typeof fetchSkillTrades>>;
  scores: SkillScores;
}) {
  const callProfile = useServerFn(generateTraderProfile);
  const [profile, setProfile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onGenerate() {
    if (lifetime.totalTrades < 20) {
      toast.info("Log at least 20 trades to generate a profile.");
      return;
    }
    setBusy(true);
    try {
      // Aggregate
      const regMap = new Map<string, { w: number; n: number }>();
      const setMap = new Map<string, { pnl: number; n: number }>();
      const hrMap = new Map<number, { w: number; n: number }>();
      for (const t of trades) {
        if (t.market_regime) {
          const r = regMap.get(t.market_regime) ?? { w: 0, n: 0 };
          r.n += 1;
          if (t.result === "Win") r.w += 1;
          regMap.set(t.market_regime, r);
        }
      }
      const topRegimes = [...regMap.entries()].map(([regime, v]) => ({
        regime,
        trades: v.n,
        winRate: v.n ? v.w / v.n : 0,
      }));

      // Use trade data only (no setup/hour in fetchSkillTrades); query loosely from trades again
      const res = await callProfile({
        data: {
          lifetime: {
            totalTrades: lifetime.totalTrades,
            winRate: lifetime.winRate / 100,
            avgR: lifetime.avgR,
            netPnl: lifetime.netPnl,
            bestSingleR: lifetime.bestSingleR,
            longestWinStreak: lifetime.longestWinStreak,
            daysTraded: lifetime.daysTraded,
          },
          topRegimes,
          topSetups: [...setMap.entries()].map(([setup, v]) => ({
            setup,
            trades: v.n,
            pnl: v.pnl,
          })),
          hourBuckets: [...hrMap.entries()].map(([hour, v]) => ({
            hour,
            trades: v.n,
            winRate: v.n ? v.w / v.n : 0,
          })),
          skillScores: scores,
        },
      });
      if (res.ok) {
        setProfile(res.profile);
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold font-heading">Trader Profile Summary</h2>
        </div>
        <Button size="sm" onClick={onGenerate} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {profile ? "Regenerate" : "Generate"}
        </Button>
      </div>
      {profile ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {profile}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          AI-generated summary of your trading style, strongest market conditions, and where to
          improve next.
        </p>
      )}
    </section>
  );
}

// ---------- Enhanced Challenge Archive ----------

function ChallengeArchiveCard({ items }: { items: ChallengeRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold font-heading">Challenge History</h2>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No archived challenges yet. They'll appear here as you complete or reset challenges.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const profitPct = challengeProfitPct(c);
            return (
              <div
                key={c.id}
                className="rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <OutcomeBadge outcome={c.outcome} />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(c.started_at).toLocaleDateString()} →{" "}
                      {new Date(c.ended_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "shrink-0 text-right font-data text-sm font-semibold",
                      profitPct >= 0 ? "text-trade-green" : "text-trade-red",
                    )}
                  >
                    {profitPct >= 0 ? "+" : ""}
                    {profitPct.toFixed(1)}%
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                  <Mini label="Start" value={`$${Number(c.starting_balance).toFixed(0)}`} />
                  <Mini label="End" value={`$${Number(c.final_balance).toFixed(0)}`} />
                  <Mini label="Trades" value={String(c.total_trades)} />
                  <Mini label="Win %" value={`${Number(c.win_rate).toFixed(0)}%`} />
                </div>
                {(c.starting_playbook ||
                  c.ending_playbook ||
                  c.edge_health_trend ||
                  c.most_used_regime ||
                  c.most_profitable_setup ||
                  c.biggest_behavioral_issue) && (
                  <div className="mt-3 grid gap-1.5 border-t border-border/40 pt-3 text-[11px]">
                    {c.starting_playbook && (
                      <Detail
                        label="Playbook"
                        value={`${c.starting_playbook} → ${c.ending_playbook ?? "—"}`}
                      />
                    )}
                    {c.edge_health_trend && (
                      <Detail label="Edge trend" value={c.edge_health_trend} />
                    )}
                    {c.most_used_regime && (
                      <Detail label="Top regime" value={c.most_used_regime} />
                    )}
                    {c.most_profitable_setup && (
                      <Detail label="Top setup" value={c.most_profitable_setup} />
                    )}
                    {c.biggest_behavioral_issue && (
                      <Detail label="Biggest issue" value={c.biggest_behavioral_issue} tone="red" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OutcomeBadge({ outcome }: { outcome: ChallengeRow["outcome"] }) {
  const map = {
    Won: { cls: "bg-trade-green/15 text-trade-green", Icon: Trophy },
    Lost: { cls: "bg-trade-red/15 text-trade-red", Icon: XIcon },
    Reset: { cls: "bg-muted/40 text-muted-foreground", Icon: RotateCcw },
  } as const;
  const { cls, Icon } = map[outcome];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        cls,
      )}
    >
      <Icon className="size-3" />
      {outcome}
    </span>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-data text-xs font-semibold">{value}</div>
    </div>
  );
}

function Detail({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xs font-medium",
          tone === "red" ? "text-trade-red" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// kept for potential future use
export const _flameIcon = Flame;