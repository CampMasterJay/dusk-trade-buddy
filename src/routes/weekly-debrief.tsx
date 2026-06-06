import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Activity,
  Scale,
  ChevronLeft,
  Archive,
  RefreshCw,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useUserSettings } from "@/hooks/useUserSettings";
import {
  generateWeeklyDebrief,
  listWeeklyDebriefs,
} from "@/lib/api/weeklyDebrief.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/weekly-debrief")({
  head: () => ({
    meta: [
      { title: "Weekly Debrief — EdgeTrader" },
      { name: "description", content: "AI-generated weekly trading debrief." },
    ],
  }),
  component: WeeklyDebriefPage,
});

type Debrief = {
  id: string;
  week_start: string;
  week_end: string;
  performance_summary: string;
  top_strength: string;
  top_weakness: string;
  pattern_analysis: string;
  rule_violations: string;
  next_week_focus: string;
  position_sizing_recommendation: string;
  source_stats: Record<string, unknown> | null;
  created_at: string;
};

function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(mon), end: iso(sun) };
}

function WeeklyDebriefPage() {
  const { settings } = useUserSettings();
  const balance = Number(settings?.current_balance ?? 0);

  const week = useMemo(() => getCurrentWeekRange(), []);
  const generate = useServerFn(generateWeeklyDebrief);
  const list = useServerFn(listWeeklyDebriefs);

  const [current, setCurrent] = useState<Debrief | null>(null);
  const [history, setHistory] = useState<Debrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [emptyMsg, setEmptyMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    try {
      const res = await list();
      const all = (res.debriefs ?? []) as Debrief[];
      const cur = all.find((d) => d.week_start === week.start) ?? null;
      setCurrent(cur);
      setHistory(all.filter((d) => d.week_start !== week.start));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async (force = false) => {
    setGenerating(true);
    setError(null);
    setEmptyMsg(null);
    try {
      const res = await generate({ data: { weekStart: week.start, weekEnd: week.end, force } });
      if (res.empty) {
        setEmptyMsg(res.message ?? "No data this week.");
      } else if (res.error) {
        setError(res.error);
        toast.error(res.error);
      } else if (res.debrief) {
        setCurrent(res.debrief as Debrief);
        toast.success(res.cached ? "Loaded saved debrief" : "Debrief generated");
      }
      await loadHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppHeader balance={balance} />
      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-28 pt-4">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-heading text-xl font-semibold">Weekly Debrief</h1>
            <p className="text-xs text-muted-foreground">
              {week.start} → {week.end}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : current ? (
          <DebriefView debrief={current} onRegenerate={() => handleGenerate(true)} generating={generating} />
        ) : (
          <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <Brain className="mx-auto mb-2 size-8 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">No debrief yet for this week</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {emptyMsg ??
                "Generate an AI-powered review of your trades, journal entries, plan compliance and news-tagged trades."}
            </p>
            {error && <p className="mt-2 text-xs text-trade-red">{error}</p>}
            {!emptyMsg && (
              <Button onClick={() => handleGenerate(false)} disabled={generating} className="mt-4" size="lg">
                {generating ? (
                  <>
                    <LoadingSpinner /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate Debrief
                  </>
                )}
              </Button>
            )}
          </section>
        )}

        {/* History */}
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
            <Archive className="h-3 w-3" />
            Debrief History
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No past debriefs yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((d) => (
                <HistoryCard key={d.id} debrief={d} />
              ))}
            </div>
          )}
        </section>
      </main>
    </ProtectedRoute>
  );
}

function DebriefView({
  debrief,
  onRegenerate,
  generating,
}: {
  debrief: Debrief;
  onRegenerate: () => void;
  generating: boolean;
}) {
  const stats = (debrief.source_stats ?? {}) as Record<string, number | string | null>;
  return (
    <div className="space-y-3">
      {stats && Object.keys(stats).length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <StatTile label="Trades" value={String(stats.total_trades ?? 0)} />
          <StatTile
            label="Win rate"
            value={`${stats.win_rate_pct ?? 0}%`}
            tone={Number(stats.win_rate_pct ?? 0) >= 50 ? "text-trade-green" : "text-trade-red"}
          />
          <StatTile
            label="Net P&L"
            value={`${Number(stats.total_pnl ?? 0) >= 0 ? "+" : ""}${stats.total_pnl ?? 0}`}
            tone={Number(stats.total_pnl ?? 0) >= 0 ? "text-trade-green" : "text-trade-red"}
          />
          <StatTile label="Total R" value={String(stats.total_r ?? 0)} />
        </div>
      )}

      <Section icon={Brain} label="Performance Summary" body={debrief.performance_summary} />
      <Section
        icon={TrendingUp}
        label="Top Strength"
        body={debrief.top_strength}
        accent="border-trade-green/40 bg-trade-green/5"
      />
      <Section
        icon={TrendingDown}
        label="Top Weakness"
        body={debrief.top_weakness}
        accent="border-trade-red/40 bg-trade-red/5"
      />
      <Section icon={Activity} label="Pattern Analysis" body={debrief.pattern_analysis} />
      <Section
        icon={AlertTriangle}
        label="Rule Violations"
        body={debrief.rule_violations}
        accent="border-amber-500/40 bg-amber-500/5"
      />
      <Section
        icon={Target}
        label="Next Week Focus"
        body={debrief.next_week_focus}
        accent="border-primary/40 bg-primary/5"
      />
      <Section
        icon={Scale}
        label="Position Sizing Recommendation"
        body={debrief.position_sizing_recommendation}
      />

      <Button onClick={onRegenerate} disabled={generating} variant="outline" className="w-full" size="sm">
        <RefreshCw className={cn("h-4 w-4", generating && "animate-spin")} />
        {generating ? "Regenerating…" : "Regenerate debrief"}
      </Button>
    </div>
  );
}

function Section({
  icon: Icon,
  label,
  body,
  accent,
}: {
  icon: typeof Brain;
  label: string;
  body: string;
  accent?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", accent)}>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{body}</p>
    </section>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2 text-center">
      <div className={cn("font-data text-base tabular-nums", tone ?? "text-foreground")}>{value}</div>
      <div className="mt-0.5 text-[10px] font-data uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function HistoryCard({ debrief }: { debrief: Debrief }) {
  const [open, setOpen] = useState(false);
  const stats = (debrief.source_stats ?? {}) as Record<string, number | string | null>;
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div>
          <div className="font-data text-sm tabular-nums">
            {debrief.week_start} → {debrief.week_end}
          </div>
          <div className="mt-0.5 text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            {stats.total_trades ?? 0} trades · {stats.win_rate_pct ?? 0}% WR ·{" "}
            <span
              className={cn(
                Number(stats.total_pnl ?? 0) >= 0 ? "text-trade-green" : "text-trade-red",
              )}
            >
              {Number(stats.total_pnl ?? 0) >= 0 ? "+" : ""}
              {stats.total_pnl ?? 0}
            </span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "View"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          <Section icon={Brain} label="Performance Summary" body={debrief.performance_summary} />
          <Section icon={TrendingUp} label="Top Strength" body={debrief.top_strength} accent="border-trade-green/40 bg-trade-green/5" />
          <Section icon={TrendingDown} label="Top Weakness" body={debrief.top_weakness} accent="border-trade-red/40 bg-trade-red/5" />
          <Section icon={Activity} label="Pattern Analysis" body={debrief.pattern_analysis} />
          <Section icon={AlertTriangle} label="Rule Violations" body={debrief.rule_violations} accent="border-amber-500/40 bg-amber-500/5" />
          <Section icon={Target} label="Next Week Focus" body={debrief.next_week_focus} accent="border-primary/40 bg-primary/5" />
          <Section icon={Scale} label="Position Sizing" body={debrief.position_sizing_recommendation} />
        </div>
      )}
    </div>
  );
}