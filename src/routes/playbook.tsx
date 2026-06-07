import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Save, BookOpen, Trash2, Filter } from "lucide-react";
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
};

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
      if (p.data) setEntries(p.data as unknown as PlaybookRow[]);
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
    toast.success("Saved to playbook");
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
              Saved Playbook Entries ({entries.length})
            </h2>
          </div>
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No entries saved yet. Build a filter that has an edge and save it above.
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5"
                >
                  <button
                    onClick={() => loadEntry(e)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-xs font-semibold truncate">{e.name}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <Badge variant="outline" className="text-[9px] font-data">
                        {e.trade_count} trades
                      </Badge>
                      <Badge variant="outline" className="text-[9px] font-data">
                        {((e.win_rate ?? 0) * 100).toFixed(0)}% win
                      </Badge>
                      <Badge variant="outline" className="text-[9px] font-data">
                        {(e.avg_r ?? 0).toFixed(2)}R
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] font-data",
                          Number(e.net_pnl ?? 0) >= 0 ? "text-trade-green" : "text-trade-red",
                        )}
                      >
                        ${Number(e.net_pnl ?? 0).toFixed(0)}
                      </Badge>
                    </div>
                  </button>
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-trade-red hover:bg-trade-red/10"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <p className="text-center text-xs text-muted-foreground">Loading…</p>
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