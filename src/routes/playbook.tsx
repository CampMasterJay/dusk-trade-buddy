import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Save, BookOpen, Trash2, Filter, Activity, Sparkles, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { discoverSetup, type DiscoveredSetup } from "@/lib/api/discoverSetup.functions";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { supabase } from "@/integrations/supabase/client";
import { getAllTrades, type Trade } from "@/lib/tradeService";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { OptionsPlaybookBuilder } from "@/components/OptionsPlaybookBuilder";

export const Route = createFileRoute("/playbook")({
  head: () => ({
    meta: [
      { title: "Playbook Builder — Trade Filter Engine" },
      { name: "description", content: "Filter trade history by setup, regime, time, VIX and more. Save winning combinations as playbook entries." },
    ],
  }),
  component: PlaybookPage,
});

type Filters = {
  setups: string[];
  regimes: string[];
  instruments: string[];
  dows: number[]; // 1..7 (Sun=1)
  hourRange: [number, number];
  vixRange: [number, number];
  sessionNums: Array<1 | 2 | 3>; // 3 = 3+
  checklistRange: [number, number];
  direction: "Long" | "Short" | "Both";
  consecWinsMin: number;
  consecLossesMin: number;
};

const DEFAULT_FILTERS: Filters = {
  setups: [],
  regimes: [],
  instruments: [],
  dows: [],
  hourRange: [6, 16],
  vixRange: [10, 40],
  sessionNums: [],
  checklistRange: [0, 10],
  direction: "Both",
  consecWinsMin: 0,
  consecLossesMin: 0,
};

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MIN_TRADES_FOR_RESULTS = 10;

type PlaybookRow = {
  id: string;
  name: string;
  notes: string | null;
  filters: Filters;
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

const MAX_ENTRIES = 10;

function confidenceLabel(n: number): "LOW" | "MEDIUM" | "HIGH" {
  if (n >= 30) return "HIGH";
  if (n >= 20) return "MEDIUM";
  return "LOW";
}

function formatConditions(f: Filters): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (f.setups.length) rows.push({ label: "Setup", value: f.setups.join(", ") });
  if (f.direction !== "Both") rows.push({ label: "Direction", value: `${f.direction} only` });
  rows.push({
    label: "Time",
    value: `${String(f.hourRange[0]).padStart(2, "0")}:00 – ${String(f.hourRange[1]).padStart(2, "0")}:00 CT`,
  });
  if (f.regimes.length) rows.push({ label: "Regime", value: f.regimes.join(", ") });
  rows.push({ label: "VIX", value: `${f.vixRange[0]} – ${f.vixRange[1]}` });
  if (f.sessionNums.length) {
    const label = f.sessionNums
      .map((n) => (n === 1 ? "1st" : n === 2 ? "2nd" : "3rd+"))
      .join(", ");
    rows.push({ label: "Trade #", value: `${label} of day` });
  }
  if (f.checklistRange[0] > 0 || f.checklistRange[1] < 10) {
    rows.push({ label: "Checklist", value: `${f.checklistRange[0]}–${f.checklistRange[1]}/10` });
  }
  if (f.instruments.length) rows.push({ label: "Instrument", value: f.instruments.join(", ") });
  if (f.dows.length) {
    rows.push({ label: "Day", value: f.dows.map((d) => DOW_LABELS[d - 1]).join(", ") });
  }
  if (f.consecWinsMin > 0) rows.push({ label: "After wins", value: `≥${f.consecWinsMin}` });
  if (f.consecLossesMin > 0) rows.push({ label: "After losses", value: `≥${f.consecLossesMin}` });
  return rows;
}

type EntryHealth = {
  status: "healthy" | "softening" | "degrading" | "insufficient";
  currentWinRate: number;
  currentCount: number;
  delta: number; // current - baseline
};

function computeEntryHealth(entry: PlaybookRow, currentTrades: Trade[]): EntryHealth {
  const baseline = entry.baseline_win_rate ?? entry.win_rate ?? 0;
  const wins = currentTrades.filter((t) => t.result === "Win").length;
  const losses = currentTrades.filter((t) => t.result === "Loss").length;
  const decided = wins + losses;
  const cur = decided > 0 ? wins / decided : 0;
  if (currentTrades.length < 10) {
    return { status: "insufficient", currentWinRate: cur, currentCount: currentTrades.length, delta: cur - baseline };
  }
  const delta = cur - baseline;
  if (cur < baseline * 0.8) return { status: "degrading", currentWinRate: cur, currentCount: currentTrades.length, delta };
  if (cur < baseline * 0.9) return { status: "softening", currentWinRate: cur, currentCount: currentTrades.length, delta };
  return { status: "healthy", currentWinRate: cur, currentCount: currentTrades.length, delta };
}

const HEALTH_META: Record<EntryHealth["status"], { dot: string; label: string; tone: string }> = {
  healthy:      { dot: "bg-trade-green",       label: "HEALTHY",      tone: "text-trade-green" },
  softening:    { dot: "bg-yellow-500",        label: "SOFTENING",    tone: "text-yellow-500" },
  degrading:    { dot: "bg-trade-red",         label: "DEGRADING",    tone: "text-trade-red" },
  insufficient: { dot: "bg-muted-foreground",  label: "INSUFFICIENT", tone: "text-muted-foreground" },
};

const STATUS_OPTIONS: Array<PlaybookRow["status"]> = ["Active", "Testing", "Retired"];

function PlaybookPage() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const balance = settings?.current_balance ?? 100;

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [entries, setEntries] = useState<PlaybookRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [market, setMarket] = useState<"futures" | "options">("futures");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [t, p] = await Promise.all([
        getAllTrades(user.id),
        supabase
          .from("playbook_entries")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (t.data) setTrades(t.data);
      if (p.data) {
        const all = p.data as unknown as Array<PlaybookRow & { filters: { market?: string } }>;
        // Futures playbook excludes entries explicitly marked as options
        setEntries(all.filter((e) => e.filters?.market !== "options") as PlaybookRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Unique option pools derived from trade history
  const opts = useMemo(() => {
    const setups = new Set<string>();
    const regimes = new Set<string>();
    const instruments = new Set<string>();
    for (const t of trades) {
      if (t.setup_tag) setups.add(t.setup_tag);
      if (t.market_regime) regimes.add(t.market_regime);
      if (t.instrument) instruments.add(t.instrument);
    }
    return {
      setups: Array.from(setups).sort(),
      regimes: Array.from(regimes).sort(),
      instruments: Array.from(instruments).sort(),
    };
  }, [trades]);

  const filtered = useMemo(() => applyFilters(trades, filters), [trades, filters]);

  const stats = useMemo(() => {
    const wins = filtered.filter((t) => t.result === "Win").length;
    const losses = filtered.filter((t) => t.result === "Loss").length;
    const decided = wins + losses;
    const winRate = decided > 0 ? wins / decided : 0;
    const rs = filtered.map((t) => Number(t.r_multiple ?? 0));
    const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
    const netPnl = filtered.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
    return { wins, losses, winRate, avgR, netPnl, count: filtered.length };
  }, [filtered]);

  const enoughTrades = filtered.length >= MIN_TRADES_FOR_RESULTS;
  const confidencePct = Math.min(100, (filtered.length / 30) * 100);

  async function handleSave() {
    if (!user) return;
    if (!newName.trim()) {
      toast.error("Name your playbook entry first");
      return;
    }
    if (!enoughTrades) {
      toast.error(`Need at least ${MIN_TRADES_FOR_RESULTS} matching trades`);
      return;
    }
    if (entries.length >= MAX_ENTRIES) {
      toast.error(`Maximum ${MAX_ENTRIES} playbook entries. Retire one first.`);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("playbook_entries")
      .insert({
        user_id: user.id,
        name: newName.trim(),
        filters: filters as never,
        trade_count: stats.count,
        win_rate: stats.winRate,
        avg_r: stats.avgR,
        net_pnl: stats.netPnl,
        baseline_win_rate: stats.winRate,
        baseline_avg_r: stats.avgR,
        baseline_trade_count: stats.count,
        status: "Testing",
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEntries((e) => [data as unknown as PlaybookRow, ...e]);
    setNewName("");
    toast.success("Saved to playbook (status: Testing)");
  }

  async function handleStatusChange(id: string, status: PlaybookRow["status"]) {
    const prev = entries;
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase
      .from("playbook_entries")
      .update({ status })
      .eq("id", id);
    if (error) {
      setEntries(prev);
      toast.error(error.message);
    }
  }

  async function handleDelete(id: string) {
    if (!user) return;
    const prev = entries;
    setEntries((e) => e.filter((x) => x.id !== id));
    const { error } = await supabase.from("playbook_entries").delete().eq("id", id);
    if (error) {
      setEntries(prev);
      toast.error(error.message);
    }
  }

  function loadEntry(row: PlaybookRow) {
    setFilters({ ...DEFAULT_FILTERS, ...row.filters });
    toast.success(`Loaded "${row.name}"`);
  }

  /* -------------------- AI Discovery -------------------- */
  const MIN_TRADES_FOR_DISCOVERY = 50;
  const runDiscover = useServerFn(discoverSetup);
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveredSetup | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const tradesNeeded = Math.max(0, MIN_TRADES_FOR_DISCOVERY - trades.length);

  async function handleDiscover() {
    if (trades.length < MIN_TRADES_FOR_DISCOVERY) return;
    setDiscovering(true);
    setDiscoveryError(null);
    try {
      const payload = trades.slice(0, 200).map((t) => ({
        setup: t.setup_tag ?? null,
        direction: t.direction ?? null,
        result: t.result ?? null,
        rMultiple: t.r_multiple != null ? Number(t.r_multiple) : null,
        pnl: t.pnl != null ? Number(t.pnl) : null,
        hour: t.hour_of_day ?? null,
        dayOfWeek: t.day_of_week ?? null,
        regime: t.market_regime ?? null,
        vix: t.vix_at_entry != null ? Number(t.vix_at_entry) : null,
        sessionNum: t.session_trade_number ?? null,
        checklistScore: t.checklist_score ?? null,
        instrument: t.instrument ?? null,
      }));
      const res = await runDiscover({ data: { trades: payload } });
      if (res.ok) {
        setDiscovery(res.data);
      } else {
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
      toast.error(`Maximum ${MAX_ENTRIES} playbook entries. Retire one first.`);
      return;
    }
    const top = discovery.topSetup;
    const f: Filters = { ...DEFAULT_FILTERS, ...filtersFromConditions(top.conditions) };
    const { data, error } = await supabase
      .from("playbook_entries")
      .insert({
        user_id: user.id,
        name: top.name,
        notes: top.insight,
        filters: f as never,
        trade_count: top.tradeCount,
        win_rate: top.winRate,
        avg_r: top.avgR,
        net_pnl: top.ev * top.tradeCount,
        baseline_win_rate: top.winRate,
        baseline_avg_r: top.avgR,
        baseline_trade_count: top.tradeCount,
        status: "Testing",
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setEntries((e) => [data as unknown as PlaybookRow, ...e]);
    toast.success("A+ setup saved to your playbook");
  }

  return (
    <ProtectedRoute>
      <AppHeader balance={balance} />
      <div className="mx-auto max-w-4xl p-4 lg:p-6 space-y-5 pb-24">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/setup-library"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[10px] font-data uppercase tracking-wider hover:bg-accent"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </Link>
            <h1 className="text-sm font-bold font-data uppercase tracking-[4px]">
              Playbook Builder
            </h1>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3 w-3" />
            {trades.length} total trades
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Filter your trade history by multiple conditions. Find your edge, then
          save the combination as a playbook entry.
        </p>

        {/* MARKET TOGGLE */}
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          {(["futures", "options"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={cn(
                "px-3 py-1.5 text-[10px] font-data uppercase tracking-wider rounded-sm transition-colors",
                market === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "futures" ? "Futures Playbook" : "Options Playbook"}
            </button>
          ))}
        </div>

        {market === "options" ? (
          <OptionsPlaybookBuilder />
        ) : (
        <>
        {/* AI DISCOVERY */}
        <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 to-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-xs font-bold font-data uppercase tracking-wider">
                Discover My A+ Setup
              </h2>
            </div>
            <button
              onClick={handleDiscover}
              disabled={discovering || trades.length < MIN_TRADES_FOR_DISCOVERY}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-data uppercase tracking-wider transition-colors",
                trades.length < MIN_TRADES_FOR_DISCOVERY
                  ? "border border-border bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {discovering ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  Find My Best Setup
                </>
              )}
            </button>
          </div>
          {trades.length < MIN_TRADES_FOR_DISCOVERY ? (
            <p className="text-xs text-muted-foreground">
              AI scans your last 100+ trades to find the condition combo with
              the highest win rate. <span className="font-data font-semibold text-foreground">{tradesNeeded} more trades needed</span> ({trades.length}/{MIN_TRADES_FOR_DISCOVERY}).
            </p>
          ) : !discovery && !discoveryError ? (
            <p className="text-xs text-muted-foreground">
              AI will scan your {Math.min(trades.length, 200)} most recent trades for the
              highest-win-rate condition combo (and the worst one to avoid).
            </p>
          ) : null}

          {discoveryError && (
            <div className="rounded-md border border-trade-red/40 bg-trade-red/10 p-2.5 text-[11px] text-trade-red">
              {discoveryError}
            </div>
          )}

          {discovery && (
            <div className="space-y-3">
              {/* A+ SETUP */}
              <div className="rounded-lg border border-trade-green/50 bg-trade-green/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-trade-green" />
                  <span className="text-[9px] font-data uppercase tracking-wider text-trade-green">
                    Your A+ Setup
                  </span>
                </div>
                <div className="text-sm font-bold">{discovery.topSetup.name}</div>
                <ConditionsList conditions={discovery.topSetup.conditions} />
                <div className="grid grid-cols-4 gap-2">
                  <MiniStat label="Trades" value={String(discovery.topSetup.tradeCount)} />
                  <MiniStat
                    label="Win Rate"
                    value={`${(discovery.topSetup.winRate * 100).toFixed(0)}%`}
                    tone="good"
                  />
                  <MiniStat label="Avg R" value={discovery.topSetup.avgR.toFixed(2)} tone="good" />
                  <MiniStat label="EV" value={`$${discovery.topSetup.ev.toFixed(2)}`} tone="good" />
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

              {/* WORST SETUP */}
              <div className="rounded-lg border border-trade-red/50 bg-trade-red/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5 text-trade-red" />
                  <span className="text-[9px] font-data uppercase tracking-wider text-trade-red">
                    Setup to Avoid
                  </span>
                </div>
                <div className="text-sm font-bold">{discovery.worstSetup.name}</div>
                <ConditionsList conditions={discovery.worstSetup.conditions} />
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

              {/* KEY INSIGHTS */}
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

        {/* RESULTS CARD */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              Live Results
            </span>
            <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              Based on {filtered.length} trades
            </span>
          </div>

          {/* confidence bar */}
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                filtered.length >= 30
                  ? "bg-trade-green"
                  : filtered.length >= MIN_TRADES_FOR_RESULTS
                    ? "bg-yellow-500"
                    : "bg-trade-red",
              )}
              style={{ width: `${confidencePct}%` }}
            />
          </div>

          {!enoughTrades ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Need at least {MIN_TRADES_FOR_RESULTS} matching trades to show
              reliable stats. Currently {filtered.length}.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Trades" value={String(stats.count)} />
              <Stat
                label="Win Rate"
                value={`${(stats.winRate * 100).toFixed(1)}%`}
                tone={stats.winRate >= 0.5 ? "good" : "bad"}
              />
              <Stat
                label="Avg R"
                value={stats.avgR.toFixed(2)}
                tone={stats.avgR >= 0 ? "good" : "bad"}
              />
              <Stat
                label="Net P&L"
                value={`$${stats.netPnl.toFixed(0)}`}
                tone={stats.netPnl >= 0 ? "good" : "bad"}
              />
            </div>
          )}

          {/* save row */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
            <Input
              placeholder="Name this playbook entry…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-xs"
            />
            <Button
              onClick={handleSave}
              disabled={saving || !enoughTrades || !newName.trim()}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Save as Playbook Entry
            </Button>
          </div>
        </div>

        {/* FILTERS */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-5">
          <h2 className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            Filters
          </h2>

          <ChipGroup
            label="Setup Type"
            options={opts.setups}
            selected={filters.setups}
            onChange={(v) => setFilters((f) => ({ ...f, setups: v }))}
            emptyMsg="No setups tagged yet"
          />
          <ChipGroup
            label="Market Regime"
            options={opts.regimes}
            selected={filters.regimes}
            onChange={(v) => setFilters((f) => ({ ...f, regimes: v }))}
            emptyMsg="No regimes tagged"
          />
          <ChipGroup
            label="Instrument"
            options={opts.instruments}
            selected={filters.instruments}
            onChange={(v) => setFilters((f) => ({ ...f, instruments: v }))}
            emptyMsg="No instruments yet"
          />

          <div>
            <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground mb-2">
              Day of Week
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DOW_LABELS.map((d, i) => {
                const dow = i + 1;
                const on = filters.dows.includes(dow);
                return (
                  <Chip
                    key={d}
                    label={d}
                    on={on}
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        dows: on ? f.dows.filter((x) => x !== dow) : [...f.dows, dow],
                      }))
                    }
                  />
                );
              })}
            </div>
          </div>

          <RangeRow
            label="Hour of Day (CT)"
            min={0}
            max={23}
            step={1}
            value={filters.hourRange}
            onChange={(v) => setFilters((f) => ({ ...f, hourRange: v }))}
            format={(v) => `${v}:00`}
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
              Trade # in Session
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { v: 1 as const, l: "1st" },
                { v: 2 as const, l: "2nd" },
                { v: 3 as const, l: "3rd+" },
              ].map(({ v, l }) => {
                const on = filters.sessionNums.includes(v);
                return (
                  <Chip
                    key={v}
                    label={l}
                    on={on}
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        sessionNums: on
                          ? f.sessionNums.filter((x) => x !== v)
                          : [...f.sessionNums, v],
                      }))
                    }
                  />
                );
              })}
            </div>
          </div>

          <RangeRow
            label="Checklist Score"
            min={0}
            max={10}
            step={1}
            value={filters.checklistRange}
            onChange={(v) => setFilters((f) => ({ ...f, checklistRange: v }))}
            format={(v) => String(v)}
          />

          <div>
            <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground mb-2">
              Direction
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["Long", "Short", "Both"] as const).map((d) => (
                <Chip
                  key={d}
                  label={d}
                  on={filters.direction === d}
                  onClick={() => setFilters((f) => ({ ...f, direction: d }))}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumRow
              label="Min consec WINS before"
              value={filters.consecWinsMin}
              onChange={(v) => setFilters((f) => ({ ...f, consecWinsMin: v }))}
            />
            <NumRow
              label="Min consec LOSSES before"
              value={filters.consecLossesMin}
              onChange={(v) => setFilters((f) => ({ ...f, consecLossesMin: v }))}
            />
          </div>

          <div className="pt-2 border-t border-border">
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-[10px] font-data uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Reset all filters
            </button>
          </div>
        </div>

        {/* SAMPLE TRADES */}
        {enoughTrades && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              Sample Trades (last 10 matching)
            </h2>
            <div className="space-y-1">
              {filtered.slice(0, 10).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-data text-[10px] text-muted-foreground w-20 shrink-0">
                      {t.date}
                    </span>
                    <span className="font-data text-[10px] w-12 shrink-0">{t.instrument}</span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {t.setup_tag ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "font-data text-[10px]",
                        t.result === "Win" ? "text-trade-green" : "text-trade-red",
                      )}
                    >
                      {t.result}
                    </span>
                    <span
                      className={cn(
                        "font-data text-[10px] w-12 text-right",
                        Number(t.pnl ?? 0) >= 0 ? "text-trade-green" : "text-trade-red",
                      )}
                    >
                      ${Number(t.pnl ?? 0).toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SAVED ENTRIES */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              My Playbook ({entries.length}/{MAX_ENTRIES})
            </h2>
          </div>
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No entries saved yet. Build a filter that has an edge and save it above.
            </p>
          ) : (
            <div className="space-y-3">
              {entries.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  allTrades={trades}
                  onLoad={() => loadEntry(e)}
                  onDelete={() => handleDelete(e.id)}
                  onStatusChange={(s) => handleStatusChange(e.id, s)}
                />
              ))}
            </div>
          )}
        </div>

        {loading && (
          <p className="text-center text-xs text-muted-foreground">Loading…</p>
        )}
        </>
        )}
      </div>
    </ProtectedRoute>
  );
}

function applyFilters(trades: Trade[], f: Filters): Trade[] {
  return trades.filter((t) => {
    if (f.setups.length && (!t.setup_tag || !f.setups.includes(t.setup_tag))) return false;
    if (f.regimes.length && (!t.market_regime || !f.regimes.includes(t.market_regime))) return false;
    if (f.instruments.length && !f.instruments.includes(t.instrument)) return false;
    if (f.dows.length && (t.day_of_week == null || !f.dows.includes(t.day_of_week))) return false;
    if (t.hour_of_day != null) {
      if (t.hour_of_day < f.hourRange[0] || t.hour_of_day > f.hourRange[1]) return false;
    }
    if (t.vix_at_entry != null) {
      const v = Number(t.vix_at_entry);
      if (v < f.vixRange[0] || v > f.vixRange[1]) return false;
    }
    if (f.sessionNums.length) {
      const n = t.session_trade_number ?? 0;
      const bucket: 1 | 2 | 3 | 0 = n === 1 ? 1 : n === 2 ? 2 : n >= 3 ? 3 : 0;
      if (!bucket || !f.sessionNums.includes(bucket)) return false;
    }
    if (t.checklist_score != null) {
      const s = Number(t.checklist_score);
      if (s < f.checklistRange[0] || s > f.checklistRange[1]) return false;
    }
    if (f.direction !== "Both" && t.direction !== f.direction) return false;
    if (f.consecWinsMin > 0 && (t.consecutive_wins_before ?? 0) < f.consecWinsMin) return false;
    if (f.consecLossesMin > 0 && (t.consecutive_losses_before ?? 0) < f.consecLossesMin) return false;
    return true;
  });
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
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

function Chip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
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
        <p className="text-[10px] text-muted-foreground italic">{emptyMsg}</p>
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
          {format(value[0])} — {format(value[1])}
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

function NumRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground mb-2">
        {label}
      </div>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="text-xs h-8"
      />
    </div>
  );
}

function EntryCard({
  entry,
  allTrades,
  onLoad,
  onDelete,
  onStatusChange,
}: {
  entry: PlaybookRow;
  allTrades: Trade[];
  onLoad: () => void;
  onDelete: () => void;
  onStatusChange: (s: PlaybookRow["status"]) => void;
}) {
  const currentMatches = useMemo(
    () => applyFilters(allTrades, { ...DEFAULT_FILTERS, ...entry.filters }),
    [allTrades, entry.filters],
  );
  const health = computeEntryHealth(entry, currentMatches);
  const meta = HEALTH_META[health.status];
  const conds = formatConditions({ ...DEFAULT_FILTERS, ...entry.filters });
  const baselineWR = entry.baseline_win_rate ?? entry.win_rate ?? 0;
  const baselineR = entry.baseline_avg_r ?? entry.avg_r ?? 0;
  const baselineCount = entry.baseline_trade_count ?? entry.trade_count;
  // EV per trade = avg_r normalized; show in $ using net_pnl / trades.
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
        <MiniStat label="Avg R" value={baselineR.toFixed(2)} tone={baselineR >= 0 ? "good" : "bad"} />
        <MiniStat
          label="EV / Trade"
          value={`$${evPerTrade.toFixed(2)}`}
          tone={evPerTrade >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={cn(
          "inline-flex items-center gap-1 text-[9px] font-data uppercase tracking-wider",
          conf === "HIGH" ? "text-trade-green" : conf === "MEDIUM" ? "text-yellow-500" : "text-muted-foreground",
        )}>
          <Activity className="h-3 w-3" />
          Confidence: {conf}
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

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-[9px] font-data uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-bold font-data",
          tone === "good" && "text-trade-green",
          tone === "bad" && "text-trade-red",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ConditionsList({
  conditions,
}: {
  conditions: Record<string, string | number | null | undefined>;
}) {
  const entries = Object.entries(conditions).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-data">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="uppercase tracking-wider text-muted-foreground shrink-0">
            {k}:
          </dt>
          <dd className="text-foreground truncate">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

// Best-effort mapping from AI-returned condition keys into our Filters shape,
// so the discovered setup can be saved + replayed in the filter engine.
function filtersFromConditions(
  c: Record<string, string | number | null | undefined>,
): Partial<Filters> {
  const out: Partial<Filters> = {};
  const get = (k: string): string | undefined => {
    const v = c[k];
    return v == null || v === "" ? undefined : String(v);
  };

  const setup = get("setup");
  if (setup) out.setups = [setup];

  const dir = get("direction");
  if (dir === "Long" || dir === "Short") out.direction = dir;

  const regime = get("regime");
  if (regime) out.regimes = [regime];

  const timeBand = get("timeBand") ?? get("time");
  if (timeBand) {
    const m = timeBand.match(/(\d{1,2}):?(\d{0,2}).*?(\d{1,2}):?(\d{0,2})/);
    if (m) {
      out.hourRange = [Number(m[1]) || 0, Number(m[3]) || 23];
    }
  }

  const vix = get("vix");
  if (vix) {
    const m = vix.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/i);
    if (m) out.vixRange = [Number(m[1]), Number(m[2])];
  }

  const sess = get("sessionNum");
  if (sess) {
    const buckets: Array<1 | 2 | 3> = [];
    if (/1st|^1/.test(sess)) buckets.push(1);
    if (/2nd|^2/.test(sess)) buckets.push(2);
    if (/3rd|3\+|^3/.test(sess)) buckets.push(3);
    if (buckets.length) out.sessionNums = buckets;
  }

  return out;
}