import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Filter,
  Loader2,
  Layers,
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
  daysBetween,
  type OptionsStatRow,
} from "@/lib/optionsStats";
import {
  discoverOptionsSetup,
  type DiscoveredOptionsSetup,
} from "@/lib/api/discoverOptionsSetup.functions";
import {
  OPTIONS_TEMPLATES,
  TEMPLATE_BUCKET_LABEL,
  type OptionsTemplate,
  type OptionsTemplateFilters,
} from "@/lib/optionsStrategyTemplates";
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
  /** Entry delta band — long stock-like = +0.5..+1, short stock-like = -1..-0.5. */
  deltaBand: [number, number];
  /** Max |theta|/day per contract (negative theta = long premium decay). 0 = no limit. */
  maxThetaPerDay: number;
  /** Max |vega| per contract. 0 = no limit. */
  maxVega: number;
  /** Profit capture as % of max profit at exit. */
  pctMaxRange: [number, number];
  /** Days held bucket: 0=any, 1=intraday (0-1d), 2=swing (2-7d), 3=position (8+d) */
  daysHeldBuckets: Array<1 | 2 | 3>;
  /** Earnings policy. */
  earnings: "Hold" | "Avoid" | "Either";
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
  deltaBand: [-1, 1],
  maxThetaPerDay: 0,
  maxVega: 0,
  pctMaxRange: [-100, 100],
  daysHeldBuckets: [],
  earnings: "Either",
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
    const heldDays = filtered.map((r) => daysBetween(r.trade_date, r.updated_at));
    const avgDte = heldDays.length > 0 ? heldDays.reduce((s, n) => s + n, 0) / heldDays.length : 0;
    return { count: filtered.length, wins, losses, winRate, avgPnl, netPnl, avgPctMax, avgDte };
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

  async function handleStatusChange(id: string, status: OptEntry["status"]) {
    const prev = entries;
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase.from("playbook_entries").update({ status }).eq("id", id);
    if (error) {
      setEntries(prev);
      toast.error(error.message);
    }
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

  async function saveDiscoveredAsEntry() {
    if (!user || !discovery) return;
    if (entries.length >= MAX_ENTRIES) {
      return toast.error(`Maximum ${MAX_ENTRIES} options entries. Retire one first.`);
    }
    const top = discovery.topSetup;
    const f: OptionsFilters = {
      ...DEFAULT_OPT_FILTERS,
      ...filtersFromOptionConditions(top.conditions),
      market: "options",
    };
    const { data, error } = await supabase
      .from("playbook_entries")
      .insert({
        user_id: user.id,
        name: top.name,
        notes: top.insight,
        filters: f as never,
        trade_count: top.tradeCount,
        win_rate: top.winRate,
        avg_r: top.avgPctOfMaxProfit,
        net_pnl: top.avgPnl * top.tradeCount,
        baseline_win_rate: top.winRate,
        baseline_avg_r: top.avgPctOfMaxProfit,
        baseline_trade_count: top.tradeCount,
        status: "Testing",
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setEntries((e) => [data as unknown as OptEntry, ...e]);
    toast.success("A+ options setup saved to playbook");
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
              <button
                onClick={saveDiscoveredAsEntry}
                className="w-full rounded-md bg-trade-green/90 px-3 py-2 text-[10px] font-data uppercase tracking-wider text-white hover:bg-trade-green"
              >
                <Save className="inline h-3 w-3 mr-1.5" />
                Save as Playbook Entry
              </button>
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
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              stats.count >= 18
                ? "bg-trade-green"
                : stats.count >= MIN_TRADES_FOR_RESULTS
                  ? "bg-yellow-500"
                  : "bg-trade-red",
            )}
            style={{ width: `${Math.min(100, (stats.count / 18) * 100)}%` }}
          />
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

      {/* SAMPLE TRADES */}
      {enough && (
        <Card className="p-4 space-y-3">
          <h2 className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            Sample Trades (last 10 matching)
          </h2>
          <div className="space-y-1">
            {filtered.slice(0, 10).map((r) => {
              const mp = Number(r.max_profit);
              const np = Number(r.net_pnl);
              const pctMax =
                isFinite(mp) && mp > 0 && isFinite(np) ? Math.min(1, np / mp) : null;
              const win = (r.net_pnl ?? 0) > 0;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-data text-[10px] text-muted-foreground w-20 shrink-0">
                      {r.trade_date}
                    </span>
                    <span className="font-data text-[10px] w-12 shrink-0">{r.underlying}</span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {r.strategy_type}
                      {r.is_debit != null ? (r.is_debit ? " · D" : " · C") : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "font-data text-[10px]",
                        win ? "text-trade-green" : "text-trade-red",
                      )}
                    >
                      {pctMax != null ? `${(pctMax * 100).toFixed(0)}% max` : win ? "Win" : "Loss"}
                    </span>
                    <span
                      className={cn(
                        "font-data text-[10px] w-14 text-right",
                        Number(r.net_pnl ?? 0) >= 0 ? "text-trade-green" : "text-trade-red",
                      )}
                    >
                      ${Number(r.net_pnl ?? 0).toFixed(0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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

        <div>
          <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground mb-2">
            Debit / Credit
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["Debit", "Credit", "Both"] as const).map((d) => (
              <Chip
                key={d}
                label={d}
                on={filters.direction === d}
                onClick={() => setFilters((f) => ({ ...f, direction: d }))}
              />
            ))}
          </div>
        </div>

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
              <OptionsEntryCard
                key={e.id}
                entry={e}
                rows={closed}
                regimeMap={regimeMap}
                vixMap={vixMap}
                onLoad={() => loadEntry(e)}
                onDelete={() => handleDelete(e.id)}
                onStatusChange={(s) => handleStatusChange(e.id, s)}
              />
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
    if (f.direction !== "Both") {
      if (f.direction === "Debit" && r.is_debit !== true) return false;
      if (f.direction === "Credit" && r.is_debit !== false) return false;
    }
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
    // Greeks band — only filter when row has data and the band is narrower than default.
    const delta = r.entry_delta != null ? Number(r.entry_delta) : null;
    if (delta != null && isFinite(delta) && (f.deltaBand[0] > -1 || f.deltaBand[1] < 1)) {
      if (delta < f.deltaBand[0] || delta > f.deltaBand[1]) return false;
    }
    if (f.maxThetaPerDay > 0 && r.entry_theta != null) {
      if (Math.abs(Number(r.entry_theta)) > f.maxThetaPerDay) return false;
    }
    if (f.maxVega > 0 && r.entry_vega != null) {
      if (Math.abs(Number(r.entry_vega)) > f.maxVega) return false;
    }
    // % of max profit captured at close (only for closed wins/losses with max_profit > 0)
    if (f.pctMaxRange[0] > -100 || f.pctMaxRange[1] < 100) {
      const mp = Number(r.max_profit);
      const np = Number(r.net_pnl);
      if (isFinite(mp) && mp > 0 && isFinite(np)) {
        const pct = (np / mp) * 100;
        if (pct < f.pctMaxRange[0] || pct > f.pctMaxRange[1]) return false;
      }
    }
    // Days held buckets
    if (f.daysHeldBuckets.length) {
      const held = daysBetween(r.trade_date, r.updated_at);
      const bucket: 1 | 2 | 3 = held <= 1 ? 1 : held <= 7 ? 2 : 3;
      if (!f.daysHeldBuckets.includes(bucket)) return false;
    }
    // Earnings policy
    if (f.earnings !== "Either") {
      const isEP = r.is_earnings_play === true;
      if (f.earnings === "Hold" && !isEP) return false;
      if (f.earnings === "Avoid" && isEP) return false;
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
  if (f.direction !== "Both") out.push({ label: "Type", value: `${f.direction} only` });
  if (f.deltaBand[0] > -1 || f.deltaBand[1] < 1)
    out.push({ label: "Δ band", value: `${f.deltaBand[0].toFixed(2)} → ${f.deltaBand[1].toFixed(2)}` });
  if (f.maxThetaPerDay > 0)
    out.push({ label: "Max |Θ|/day", value: `$${f.maxThetaPerDay}` });
  if (f.maxVega > 0) out.push({ label: "Max |Vega|", value: `$${f.maxVega}` });
  if (f.pctMaxRange[0] > -100 || f.pctMaxRange[1] < 100)
    out.push({
      label: "Capture",
      value: `${f.pctMaxRange[0]}%–${f.pctMaxRange[1]}% of max`,
    });
  if (f.daysHeldBuckets.length)
    out.push({
      label: "Hold",
      value: f.daysHeldBuckets
        .map((b) => (b === 1 ? "Intraday" : b === 2 ? "Swing" : "Position"))
        .join(", "),
    });
  if (f.earnings !== "Either")
    out.push({ label: "Earnings", value: f.earnings === "Hold" ? "Hold through" : "Avoid" });
  return out;
}

function OptionsEntryCard({
  entry,
  rows,
  regimeMap,
  vixMap,
  onLoad,
  onDelete,
  onStatusChange,
}: {
  entry: OptEntry;
  rows: OptionsStatRow[];
  regimeMap: Map<string, string>;
  vixMap: Map<string, number>;
  onLoad: () => void;
  onDelete: () => void;
  onStatusChange: (s: OptEntry["status"]) => void;
}) {
  const current = useMemo(
    () =>
      applyOptionsFilters(
        rows,
        { ...DEFAULT_OPT_FILTERS, ...entry.filters, market: "options" },
        regimeMap,
        vixMap,
      ),
    [rows, entry.filters, regimeMap, vixMap],
  );
  const health = computeOptionsHealth(entry, current);
  const meta = HEALTH_META[health.status];
  const conds = formatOptionConditions({ ...DEFAULT_OPT_FILTERS, ...entry.filters, market: "options" });
  const baselineWR = entry.baseline_win_rate ?? entry.win_rate ?? 0;
  const baselinePctMax = entry.baseline_avg_r ?? entry.avg_r ?? 0;
  const baselineCount = entry.baseline_trade_count ?? entry.trade_count;
  const evPerTrade =
    (entry.trade_count ?? 0) > 0 ? Number(entry.net_pnl ?? 0) / entry.trade_count : 0;
  const conf = confidenceLabel(baselineCount);
  const isRetired = entry.status === "Retired";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-3",
        isRetired ? "border-border/50 bg-muted/30 opacity-70" : "border-border bg-background",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-block h-2 w-2 rounded-full", meta.dot)} />
            <span className="text-xs font-semibold truncate">{entry.name}</span>
            <span className={cn("text-[9px] font-data uppercase tracking-wider", meta.tone)}>
              {meta.label}
            </span>
          </div>
          {entry.notes && (
            <p className="mt-1 text-[10px] italic text-muted-foreground line-clamp-2">
              {entry.notes}
            </p>
          )}
          {conds.length > 0 && (
            <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-data">
              {conds.map((c) => (
                <div key={c.label} className="flex gap-1.5">
                  <dt className="uppercase tracking-wider text-muted-foreground shrink-0">
                    {c.label}:
                  </dt>
                  <dd className="text-foreground truncate">{c.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground hover:text-trade-red hover:bg-trade-red/10 shrink-0"
          aria-label="Delete entry"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MiniStat label="Trades" value={String(baselineCount)} />
        <MiniStat
          label="Win Rate"
          value={`${(baselineWR * 100).toFixed(0)}%`}
          tone={baselineWR >= 0.5 ? "good" : undefined}
        />
        <MiniStat
          label="% Max"
          value={`${(baselinePctMax * 100).toFixed(0)}%`}
          tone={baselinePctMax >= 0.4 ? "good" : undefined}
        />
        <MiniStat
          label="EV / Trade"
          value={`$${evPerTrade.toFixed(0)}`}
          tone={evPerTrade >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[9px] font-data uppercase tracking-wider",
            conf === "HIGH"
              ? "text-trade-green"
              : conf === "MEDIUM"
                ? "text-yellow-500"
                : "text-muted-foreground",
          )}
        >
          <Activity className="h-3 w-3" /> Confidence: {conf}
        </span>
        {health.status !== "insufficient" && (
          <span className="text-[10px] font-data text-muted-foreground">
            Now: {(health.currentWinRate * 100).toFixed(0)}% on {health.currentCount}{" "}
            <span className={cn(health.delta >= 0 ? "text-trade-green" : "text-trade-red")}>
              ({health.delta >= 0 ? "+" : ""}
              {(health.delta * 100).toFixed(0)}pp)
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={cn(
                "rounded-md border px-2 py-1 text-[9px] font-data uppercase tracking-wider transition-colors",
                entry.status === s
                  ? s === "Active"
                    ? "border-trade-green bg-trade-green/15 text-trade-green"
                    : s === "Testing"
                      ? "border-yellow-500/50 bg-yellow-500/15 text-yellow-500"
                      : "border-muted-foreground/40 bg-muted text-muted-foreground"
                  : "border-border bg-card hover:bg-accent text-muted-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={onLoad}
          className="text-[10px] font-data uppercase tracking-wider text-primary hover:underline"
        >
          Load filters →
        </button>
      </div>
    </div>
  );
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

/** Best-effort mapping from AI-returned condition keys → OptionsFilters. */
function filtersFromOptionConditions(
  c: Record<string, string | number | null | undefined>,
): Partial<OptionsFilters> {
  const out: Partial<OptionsFilters> = {};
  const get = (k: string): string | undefined => {
    const v = c[k];
    return v == null || v === "" ? undefined : String(v);
  };
  const u = get("underlying");
  if (u) out.underlyings = [u];
  const s = get("strategy");
  if (s) out.strategies = [s];
  const r = get("regime");
  if (r) out.regimes = [r];

  const ivr = get("ivrRange") ?? get("ivr");
  if (ivr) {
    const m = ivr.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/i);
    if (m) out.ivrRange = [Number(m[1]), Number(m[2])];
  }
  const dte = get("dteRange") ?? get("dte");
  if (dte) {
    const m = dte.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
    if (m) out.dteRange = [Number(m[1]), Number(m[2])];
  }
  const vix = get("vixRange") ?? get("vix");
  if (vix) {
    const m = vix.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/i);
    if (m) out.vixRange = [Number(m[1]), Number(m[2])];
  }

  const avoid = get("daysToAvoid");
  if (avoid) {
    const dows: number[] = [];
    const map: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
    for (const part of avoid.toLowerCase().split(/[,/\s]+/)) {
      const key = part.slice(0, 3);
      if (map[key] != null && !dows.includes(map[key])) dows.push(map[key]);
    }
    if (dows.length) out.daysToAvoid = dows;
  }

  const dir = get("debitCredit") ?? get("type");
  if (dir) {
    if (/debit/i.test(dir)) out.direction = "Debit";
    else if (/credit/i.test(dir)) out.direction = "Credit";
  }

  return out;
}