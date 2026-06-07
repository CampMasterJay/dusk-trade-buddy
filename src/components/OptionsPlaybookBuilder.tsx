import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Filter,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchOptionsStatRows,
  isClosed,
  type OptionsStatRow,
} from "@/lib/optionsStats";
import {
  discoverOptionsSetup,
  type DiscoveredOptionsSetup,
} from "@/lib/api/discoverOptionsSetup.functions";
import { cn } from "@/lib/utils";

// ---------- Types ----------

type OptionsFilters = {
  market: "options";
  underlyings: string[];
  strategies: string[];
  regimes: string[];
  ivrRange: [number, number];
  dteRange: [number, number];
  vixRange: [number, number];
  daysToAvoid: number[]; // 1=Mon..7=Sun
  checklistMin: number;
  direction: "Debit" | "Credit" | "Both";
};

const DEFAULT_OPT_FILTERS: OptionsFilters = {
  market: "options",
  underlyings: [],
  strategies: [],
  regimes: [],
  ivrRange: [0, 100],
  dteRange: [0, 90],
  vixRange: [10, 40],
  daysToAvoid: [],
  checklistMin: 0,
  direction: "Both",
};

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MIN_TRADES_FOR_RESULTS = 8;
const MIN_TRADES_FOR_DISCOVERY = 30;
const MAX_ENTRIES = 10;

type OptEntry = {
  id: string;
  name: string;
  notes: string | null;
  filters: OptionsFilters;
  trade_count: number;
  win_rate: number | null;
  avg_r: number | null;
  net_pnl: number | null;
  created_at: string;
  status: "Active" | "Testing" | "Retired";
  baseline_win_rate: number | null;
  baseline_avg_r: number | null;
  baseline_trade_count: number | null;
};

const STATUS_OPTIONS: Array<OptEntry["status"]> = ["Active", "Testing", "Retired"];

type EntryHealth = {
  status: "healthy" | "softening" | "degrading" | "insufficient";
  currentWinRate: number;
  currentCount: number;
  delta: number;
};

const HEALTH_META: Record<EntryHealth["status"], { dot: string; label: string; tone: string }> = {
  healthy:      { dot: "bg-trade-green",      label: "HEALTHY",      tone: "text-trade-green" },
  softening:    { dot: "bg-yellow-500",       label: "SOFTENING",    tone: "text-yellow-500" },
  degrading:    { dot: "bg-trade-red",        label: "DEGRADING",    tone: "text-trade-red" },
  insufficient: { dot: "bg-muted-foreground", label: "INSUFFICIENT", tone: "text-muted-foreground" },
};

function computeOptionsHealth(entry: OptEntry, current: OptionsStatRow[]): EntryHealth {
  const baseline = entry.baseline_win_rate ?? entry.win_rate ?? 0;
  const wins = current.filter((r) => (r.net_pnl ?? 0) > 0).length;
  const losses = current.filter((r) => (r.net_pnl ?? 0) < 0).length;
  const decided = wins + losses;
  const cur = decided > 0 ? wins / decided : 0;
  if (current.length < 8) {
    return { status: "insufficient", currentWinRate: cur, currentCount: current.length, delta: cur - baseline };
  }
  const delta = cur - baseline;
  if (cur < baseline * 0.8) return { status: "degrading", currentWinRate: cur, currentCount: current.length, delta };
  if (cur < baseline * 0.9) return { status: "softening", currentWinRate: cur, currentCount: current.length, delta };
  return { status: "healthy", currentWinRate: cur, currentCount: current.length, delta };
}

// ---------- Helpers ----------

function dowFromDate(d: string): number {
  // returns 1..7 (Mon..Sun)
  const dt = new Date(d + "T12:00:00Z");
  const js = dt.getUTCDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}

function normalizeRegime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("trend")) return "Trending";
  if (s.includes("range") || s.includes("chop")) return "Ranging";
  if (s.includes("high") && s.includes("vol")) return "High Vol";
  if (s.includes("low") && s.includes("vol")) return "Low Vol";
  return raw;
}

function confidenceLabel(n: number): "LOW" | "MEDIUM" | "HIGH" {
  if (n >= 18) return "HIGH";
  if (n >= 10) return "MEDIUM";
  return "LOW";
}

// ---------- Component ----------

export function OptionsPlaybookBuilder() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OptionsStatRow[]>([]);
  const [regimeMap, setRegimeMap] = useState<Map<string, string>>(new Map());
  const [vixMap, setVixMap] = useState<Map<string, number>>(new Map());
  const [entries, setEntries] = useState<OptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OptionsFilters>(DEFAULT_OPT_FILTERS);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchOptionsStatRows(user.id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("daily_game_plans")
        .select("plan_date, market_regime, vix")
        .eq("user_id", user.id),
      supabase
        .from("playbook_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ])
      .then(([opt, plans, ent]) => {
        if (cancelled) return;
        setRows(opt);
        const rmap = new Map<string, string>();
        const vmap = new Map<string, number>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (plans?.data ?? []) as any[]) {
          const r = normalizeRegime(p.market_regime);
          if (r) rmap.set(p.plan_date, r);
          if (p.vix != null && isFinite(Number(p.vix))) vmap.set(p.plan_date, Number(p.vix));
        }
        setRegimeMap(rmap);
        setVixMap(vmap);
        const all = (ent.data ?? []) as unknown as Array<OptEntry & { filters: { market?: string } }>;
        setEntries(all.filter((e) => e.filters?.market === "options"));
      })
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const opts = useMemo(() => {
    const u = new Set<string>();
    const s = new Set<string>();
    const r = new Set<string>();
    for (const row of rows) {
      if (row.underlying) u.add(row.underlying);
      if (row.strategy_type) s.add(row.strategy_type);
    }
    for (const v of regimeMap.values()) r.add(v);
    return {
      underlyings: Array.from(u).sort(),
      strategies: Array.from(s).sort(),
      regimes: Array.from(r).sort(),
    };
  }, [rows, regimeMap]);

  const closed = useMemo(() => rows.filter(isClosed), [rows]);

  const filtered = useMemo(
    () => applyOptionsFilters(closed, filters, regimeMap, vixMap),
    [closed, filters, regimeMap, vixMap],
  );

  const stats = useMemo(() => {
    const wins = filtered.filter((r) => (r.net_pnl ?? 0) > 0).length;
    const losses = filtered.filter((r) => (r.net_pnl ?? 0) < 0).length;
    const decided = wins + losses;
    const winRate = decided > 0 ? wins / decided : 0;
    const netPnl = filtered.reduce((s, r) => s + (r.net_pnl ?? 0), 0);
    const avgPnl = filtered.length > 0 ? netPnl / filtered.length : 0;
    const pctMax = filtered
      .map((r) => {
        const mp = Number(r.max_profit);
        const np = Number(r.net_pnl);
        if (!isFinite(mp) || mp <= 0 || !isFinite(np)) return null;
        return Math.min(1, np / mp);
      })
      .filter((v): v is number => v != null);
    const avgPctMax = pctMax.length > 0 ? pctMax.reduce((s, v) => s + v, 0) / pctMax.length : 0;
    return { count: filtered.length, wins, losses, winRate, avgPnl, netPnl, avgPctMax };
  }, [filtered]);

  const enough = stats.count >= MIN_TRADES_FOR_RESULTS;

  async function handleSave() {
    if (!user) return;
    if (!newName.trim()) return toast.error("Name this playbook entry first");
    if (!enough) return toast.error(`Need at least ${MIN_TRADES_FOR_RESULTS} matching trades`);
    if (entries.length >= MAX_ENTRIES)
      return toast.error(`Maximum ${MAX_ENTRIES} options entries. Retire one first.`);
    setSaving(true);
    const { data, error } = await supabase
      .from("playbook_entries")
      .insert({
        user_id: user.id,
        name: newName.trim(),
        filters: filters as never,
        trade_count: stats.count,
        win_rate: stats.winRate,
        avg_r: stats.avgPctMax, // reuse field for avg % of max profit
        net_pnl: stats.netPnl,
        baseline_win_rate: stats.winRate,
        baseline_avg_r: stats.avgPctMax,
        baseline_trade_count: stats.count,
        status: "Testing",
      })
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    setEntries((e) => [data as unknown as OptEntry, ...e]);
    setNewName("");
    toast.success("Saved options playbook entry (Testing)");
  }

  async function handleDelete(id: string) {
    const prev = entries;
    setEntries((e) => e.filter((x) => x.id !== id));
    const { error } = await supabase.from("playbook_entries").delete().eq("id", id);
    if (error) {
      setEntries(prev);
      toast.error(error.message);
    }
  }

  function loadEntry(e: OptEntry) {
    setFilters({ ...DEFAULT_OPT_FILTERS, ...e.filters, market: "options" });
    toast.success(`Loaded "${e.name}"`);
  }

  /* -------------------- AI Discovery -------------------- */

  const runDiscover = useServerFn(discoverOptionsSetup);
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveredOptionsSetup | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const tradesNeeded = Math.max(0, MIN_TRADES_FOR_DISCOVERY - closed.length);

  async function handleDiscover() {
    if (closed.length < MIN_TRADES_FOR_DISCOVERY) return;
    setDiscovering(true);
    setDiscoveryError(null);
    try {
      const payload = closed.slice(0, 200).map((r) => {
        const mp = Number(r.max_profit);
        const np = Number(r.net_pnl);
        const pctMax = isFinite(mp) && mp > 0 && isFinite(np) ? Math.min(1, np / mp) : null;
        return {
          underlying: r.underlying ?? null,
          strategy: r.strategy_type ?? null,
          isDebit: typeof r.is_debit === "boolean" ? r.is_debit : null,
          regime: regimeMap.get(r.trade_date) ?? null,
          ivr: r.iv_rank_at_entry != null ? Number(r.iv_rank_at_entry) : null,
          dte: r.dte_at_entry ?? null,
          vix: vixMap.get(r.trade_date) ?? null,
          dayOfWeek: dowFromDate(r.trade_date),
          checklistScore: null as number | null,
          result: (r.net_pnl ?? 0) > 0 ? "Win" : (r.net_pnl ?? 0) < 0 ? "Loss" : "Break",
          netPnl: r.net_pnl != null ? Number(r.net_pnl) : null,
          pctOfMaxProfit: pctMax,
        };
      });
      const res = await runDiscover({ data: { trades: payload } });
      if (res.ok) setDiscovery(res.data);
      else {
        setDiscoveryError(res.error);
        toast.error(res.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setDiscoveryError(msg);
      toast.error(msg);
    } finally {
      setDiscovering(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading options trades…
      </Card>
    );
  }

  if (closed.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Log and close some options trades to build an options playbook.
      </Card>
    );
  }

  const conditions = formatOptionConditions(filters);

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3 w-3" /> {closed.length} closed options trades
        </span>
      </div>

      {/* AI DISCOVERY */}
      <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 to-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-bold font-data uppercase tracking-wider">
              Find My A+ Options Setup
            </h2>
          </div>
          <button
            onClick={handleDiscover}
            disabled={discovering || closed.length < MIN_TRADES_FOR_DISCOVERY}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-data uppercase tracking-wider transition-colors",
              closed.length < MIN_TRADES_FOR_DISCOVERY
                ? "border border-border bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {discovering ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" /> Find My Best Setup
              </>
            )}
          </button>
        </div>
        {closed.length < MIN_TRADES_FOR_DISCOVERY ? (
          <p className="text-xs text-muted-foreground">
            AI scans your options trades for the highest-win-rate combo of
            strategy, regime, IVR, DTE, and underlying.{" "}
            <span className="font-data font-semibold text-foreground">
              {tradesNeeded} more closed trades needed
            </span>{" "}
            ({closed.length}/{MIN_TRADES_FOR_DISCOVERY}).
          </p>
        ) : !discovery && !discoveryError ? (
          <p className="text-xs text-muted-foreground">
            AI will scan your {Math.min(closed.length, 200)} most recent closed
            options trades.
          </p>
        ) : null}

        {discoveryError && (
          <div className="rounded-md border border-trade-red/40 bg-trade-red/10 p-2.5 text-[11px] text-trade-red">
            {discoveryError}
          </div>
        )}

        {discovery && (
          <div className="space-y-3">
            <div className="rounded-lg border border-trade-green/50 bg-trade-green/10 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-trade-green" />
                <span className="text-[9px] font-data uppercase tracking-wider text-trade-green">
                  Your A+ Options Setup
                </span>
              </div>
              <div className="text-sm font-bold">{discovery.topSetup.name}</div>
              <DiscoveryConditions conditions={discovery.topSetup.conditions} />
              <div className="grid grid-cols-4 gap-2">
                <MiniStat label="Trades" value={String(discovery.topSetup.tradeCount)} />
                <MiniStat
                  label="Win Rate"
                  value={`${(discovery.topSetup.winRate * 100).toFixed(0)}%`}
                  tone="good"
                />
                <MiniStat label="Avg P&L" value={`$${discovery.topSetup.avgPnl.toFixed(0)}`} tone="good" />
                <MiniStat
                  label="% Max"
                  value={`${(discovery.topSetup.avgPctOfMaxProfit * 100).toFixed(0)}%`}
                  tone="good"
                />
              </div>
              <p className="text-[11px] italic text-foreground/80">
                💡 {discovery.topSetup.insight}
              </p>
            </div>

            <div className="rounded-lg border border-trade-red/50 bg-trade-red/10 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-3.5 w-3.5 text-trade-red" />
                <span className="text-[9px] font-data uppercase tracking-wider text-trade-red">
                  Setup to Avoid
                </span>
              </div>
              <div className="text-sm font-bold">{discovery.worstSetup.name}</div>
              <DiscoveryConditions conditions={discovery.worstSetup.conditions} />
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Trades" value={String(discovery.worstSetup.tradeCount)} />
                <MiniStat
                  label="Win Rate"
                  value={`${(discovery.worstSetup.winRate * 100).toFixed(0)}%`}
                  tone="bad"
                />
              </div>
              <p className="text-[11px] italic text-foreground/80">
                ⚠ {discovery.worstSetup.recommendation}
              </p>
            </div>

            {discovery.keyInsights.length > 0 && (
              <div className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                <span className="text-[9px] font-data uppercase tracking-wider text-muted-foreground">
                  Key Insights
                </span>
                <ul className="space-y-1">
                  {discovery.keyInsights.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-[11px]">
                      <span className="text-primary shrink-0">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RESULTS */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            Live Results
          </span>
          <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            {stats.count} matching · {confidenceLabel(stats.count)} confidence
          </span>
        </div>
        {!enough ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Need at least {MIN_TRADES_FOR_RESULTS} matching trades. Currently {stats.count}.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Trades" value={String(stats.count)} />
            <Stat
              label="Win Rate"
              value={`${(stats.winRate * 100).toFixed(0)}%`}
              tone={stats.winRate >= 0.5 ? "good" : "bad"}
            />
            <Stat
              label="Avg P&L"
              value={`$${stats.avgPnl.toFixed(0)}`}
              tone={stats.avgPnl >= 0 ? "good" : "bad"}
            />
            <Stat
              label="Avg % Max"
              value={`${(stats.avgPctMax * 100).toFixed(0)}%`}
              tone={stats.avgPctMax >= 0.4 ? "good" : "bad"}
            />
          </div>
        )}

        {conditions.length > 0 && (
          <div className="rounded-md border border-border/60 bg-background/40 p-2.5 text-[11px] space-y-0.5">
            {conditions.map((c) => (
              <div key={c.label} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="font-mono text-foreground">{c.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
          <Input
            placeholder="Name this options entry…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="text-xs"
          />
          <Button onClick={handleSave} disabled={saving || !enough || !newName.trim()} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Save Entry
          </Button>
        </div>
      </Card>

      {/* FILTERS */}
      <Card className="p-4 space-y-5">
        <h2 className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          Filters
        </h2>

        <ChipGroup
          label="Underlying"
          options={opts.underlyings}
          selected={filters.underlyings}
          onChange={(v) => setFilters((f) => ({ ...f, underlyings: v }))}
          emptyMsg="No underlyings"
        />
        <ChipGroup
          label="Strategy"
          options={opts.strategies}
          selected={filters.strategies}
          onChange={(v) => setFilters((f) => ({ ...f, strategies: v }))}
          emptyMsg="No strategies"
        />
        <ChipGroup
          label="Market Regime"
          options={opts.regimes}
          selected={filters.regimes}
          onChange={(v) => setFilters((f) => ({ ...f, regimes: v }))}
          emptyMsg="Tag game plans with a regime"
        />

        <RangeRow
          label="IV Rank at Entry"
          min={0}
          max={100}
          step={5}
          value={filters.ivrRange}
          onChange={(v) => setFilters((f) => ({ ...f, ivrRange: v }))}
          format={(v) => `${v}`}
        />
        <RangeRow
          label="DTE at Entry"
          min={0}
          max={90}
          step={1}
          value={filters.dteRange}
          onChange={(v) => setFilters((f) => ({ ...f, dteRange: v }))}
          format={(v) => `${v}d`}
        />
        <RangeRow
          label="VIX Range"
          min={5}
          max={60}
          step={1}
          value={filters.vixRange}
          onChange={(v) => setFilters((f) => ({ ...f, vixRange: v }))}
          format={(v) => v.toFixed(0)}
        />

        <div>
          <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground mb-2">
            Days to Avoid
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DOW_LABELS.map((d, i) => {
              const dow = i + 1;
              const on = filters.daysToAvoid.includes(dow);
              return (
                <Chip
                  key={d}
                  label={d}
                  on={on}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      daysToAvoid: on
                        ? f.daysToAvoid.filter((x) => x !== dow)
                        : [...f.daysToAvoid, dow],
                    }))
                  }
                />
              );
            })}
          </div>
        </div>

        <RangeRow
          label={`Checklist Score (≥ ${filters.checklistMin}/10)`}
          min={0}
          max={10}
          step={1}
          value={[filters.checklistMin, 10]}
          onChange={(v) => setFilters((f) => ({ ...f, checklistMin: v[0] }))}
          format={(v) => String(v)}
        />

        <div className="pt-2 border-t border-border">
          <button
            onClick={() => setFilters(DEFAULT_OPT_FILTERS)}
            className="text-[10px] font-data uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Reset all filters
          </button>
        </div>
      </Card>

      {/* SAVED OPTIONS PLAYBOOK */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            My Options Playbook ({entries.length}/{MAX_ENTRIES})
          </h2>
        </div>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No options entries saved yet.
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-border bg-background p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{e.name}</div>
                    <div className="text-[10px] text-muted-foreground font-data">
                      {e.trade_count} trades · {confidenceLabel(e.trade_count)} confidence
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => loadEntry(e)}
                      className="rounded border border-border px-2 py-1 text-[10px] font-data uppercase tracking-wider hover:bg-accent"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="rounded border border-trade-red/40 px-2 py-1 text-trade-red hover:bg-trade-red/10"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="rounded border border-border px-2 py-1">
                    <div className="uppercase text-muted-foreground">Win Rate</div>
                    <div className="font-mono">
                      {e.win_rate != null ? `${(e.win_rate * 100).toFixed(0)}%` : "—"}
                    </div>
                  </div>
                  <div className="rounded border border-border px-2 py-1">
                    <div className="uppercase text-muted-foreground">Avg P&L</div>
                    <div className="font-mono">
                      ${(e.net_pnl != null && e.trade_count > 0 ? e.net_pnl / e.trade_count : 0).toFixed(0)}
                    </div>
                  </div>
                  <div className="rounded border border-border px-2 py-1">
                    <div className="uppercase text-muted-foreground">% Max</div>
                    <div className="font-mono">
                      {e.avg_r != null ? `${(e.avg_r * 100).toFixed(0)}%` : "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Sub-components ----------

function applyOptionsFilters(
  rows: OptionsStatRow[],
  f: OptionsFilters,
  regimeMap: Map<string, string>,
  vixMap: Map<string, number>,
): OptionsStatRow[] {
  return rows.filter((r) => {
    if (f.underlyings.length && !f.underlyings.includes(r.underlying)) return false;
    if (f.strategies.length && !f.strategies.includes(r.strategy_type)) return false;
    if (f.regimes.length) {
      const reg = regimeMap.get(r.trade_date);
      if (!reg || !f.regimes.includes(reg)) return false;
    }
    const ivr = Number(r.iv_rank_at_entry);
    if (isFinite(ivr) && (ivr < f.ivrRange[0] || ivr > f.ivrRange[1])) return false;
    const dte = Number(r.dte_at_entry);
    if (isFinite(dte) && (dte < f.dteRange[0] || dte > f.dteRange[1])) return false;
    const vix = vixMap.get(r.trade_date);
    if (vix != null && (vix < f.vixRange[0] || vix > f.vixRange[1])) return false;
    if (f.daysToAvoid.length) {
      const dow = dowFromDate(r.trade_date);
      if (f.daysToAvoid.includes(dow)) return false;
    }
    return true;
  });
}

function formatOptionConditions(f: OptionsFilters) {
  const out: { label: string; value: string }[] = [];
  if (f.underlyings.length) out.push({ label: "Underlying", value: f.underlyings.join(", ") });
  if (f.strategies.length) out.push({ label: "Strategy", value: f.strategies.join(", ") });
  if (f.regimes.length) out.push({ label: "Regime", value: f.regimes.join(", ") });
  out.push({ label: "IVR", value: `${f.ivrRange[0]}–${f.ivrRange[1]}` });
  out.push({ label: "DTE", value: `${f.dteRange[0]}–${f.dteRange[1]} days` });
  out.push({ label: "VIX", value: `${f.vixRange[0]}–${f.vixRange[1]}` });
  if (f.daysToAvoid.length)
    out.push({
      label: "Avoid",
      value: f.daysToAvoid.map((d) => DOW_LABELS[d - 1]).join("/"),
    });
  if (f.checklistMin > 0)
    out.push({ label: "Checklist", value: `≥${f.checklistMin}/10` });
  return out;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <div className="text-[9px] font-data uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-base font-bold font-data mt-0.5",
          tone === "good" && "text-trade-green",
          tone === "bad" && "text-trade-red",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded border border-border bg-background/60 p-1.5">
      <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-xs font-bold font-data",
          tone === "good" && "text-trade-green",
          tone === "bad" && "text-trade-red",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[10px] font-data uppercase tracking-wider transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onChange,
  emptyMsg,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyMsg: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground mb-2">
        {label}
      </div>
      {options.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">{emptyMsg}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <Chip
                key={o}
                label={o}
                on={on}
                onClick={() =>
                  onChange(on ? selected.filter((x) => x !== o) : [...selected, o])
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] font-data text-foreground">
          {format(value[0])} – {format(value[1])}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={(v) => onChange([v[0], v[1]] as [number, number])}
      />
    </div>
  );
}

function DiscoveryConditions({
  conditions,
}: {
  conditions: Record<string, string | number | null>;
}) {
  const entries = Object.entries(conditions).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-1 text-[10px]">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-1 rounded border border-border/60 bg-background/60 px-1.5 py-0.5">
          <span className="text-muted-foreground capitalize">{k}</span>
          <span className="font-mono text-foreground truncate ml-1">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}