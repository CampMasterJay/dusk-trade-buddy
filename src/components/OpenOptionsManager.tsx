import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X, RotateCw, Settings2, AlertTriangle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { summarizeGreeks, type OpenOptionsRow } from "@/lib/portfolioGreeks";
import {
  fetchEarningsEvents,
  findUpcomingEarnings,
  daysUntil,
  type EarningsEvent,
} from "@/lib/earnings";

type OpenPosition = OpenOptionsRow & {
  trade_date: string;
  is_debit: boolean;
  is_0dte: boolean;
  leg1_type: string;
  leg1_action: string;
  leg1_strike: number;
  leg1_expiration: string;
  leg1_premium: number;
  leg2_type: string | null;
  leg2_action: string | null;
  leg2_strike: number | null;
  leg2_premium: number | null;
  premium_paid_or_received: number | null;
  max_risk: number | null;
  max_profit: number | null;
  planned_profit_target_pct: number | null;
  planned_stop_loss_pct: number | null;
  notes: string | null;
  iv_rank_at_entry: number | null;
};

function dteFrom(dateStr: string): number {
  const exp = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

function fmt$(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const sign = v >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function dteTone(dte: number, is0dte: boolean) {
  if (is0dte || dte === 0)
    return {
      label: "0DTE",
      cls: "border-rose-500/60 text-rose-300 bg-rose-500/10 animate-pulse",
      cardRing: "ring-2 ring-rose-500/60 ring-offset-1 ring-offset-background animate-pulse",
    };
  if (dte < 7)
    return { label: `${dte}d`, cls: "border-rose-500/40 text-rose-300 bg-rose-500/10", cardRing: "" };
  if (dte <= 14)
    return {
      label: `${dte}d`,
      cls: "border-amber-500/40 text-amber-300 bg-amber-500/10",
      cardRing: "",
    };
  return {
    label: `${dte}d`,
    cls: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
    cardRing: "",
  };
}

export function OpenOptionsManager() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OpenPosition[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Per-position "current premium per share" mark used to compute live P&L
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState<OpenPosition | null>(null);
  const [closeMark, setCloseMark] = useState("");
  const [adjusting, setAdjusting] = useState<OpenPosition | null>(null);
  const [adjNotes, setAdjNotes] = useState("");
  const [adjTarget, setAdjTarget] = useState("");
  const [adjStop, setAdjStop] = useState("");
  const [busy, setBusy] = useState(false);
  const [earningsEvents, setEarningsEvents] = useState<EarningsEvent[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    fetchEarningsEvents(user.id)
      .then(setEarningsEvents)
      .catch(() => setEarningsEvents([]));
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("options_trades")
      .select(
        "id, trade_date, underlying, strategy_type, direction_bias, status, is_debit, is_0dte, leg1_type, leg1_action, leg1_strike, leg1_expiration, leg1_premium, leg1_contracts, leg2_type, leg2_action, leg2_strike, leg2_premium, premium_paid_or_received, max_risk, max_profit, planned_profit_target_pct, planned_stop_loss_pct, entry_delta, entry_gamma, entry_theta, entry_vega, notes, iv_rank_at_entry",
      )
      .eq("user_id", user.id)
      .eq("status", "Open")
      .is("deleted_at", null)
      .order("leg1_expiration", { ascending: true });
    setRows((data ?? []) as OpenPosition[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const computed = useMemo(() => {
    const list = rows ?? [];
    return list.map((r) => {
      const dte = dteFrom(r.leg1_expiration);
      const contracts = Math.max(1, Number(r.leg1_contracts) || 1);
      const entryNetPerShare =
        (r.leg1_action === "Buy" ? r.leg1_premium : -r.leg1_premium) +
        (r.leg2_premium != null && r.leg2_action != null
          ? r.leg2_action === "Buy"
            ? r.leg2_premium
            : -r.leg2_premium
          : 0);
      const mark = Number(marks[r.id]);
      const hasMark = isFinite(mark) && mark > 0;
      // For a single-leg debit position the mark IS the current per-share value of
      // the bought leg. For multi-leg trades we treat the mark as the current
      // net per-share value of the package.
      const currentNetPerShare = hasMark ? mark : NaN;
      const pnl =
        hasMark && isFinite(entryNetPerShare)
          ? (currentNetPerShare - entryNetPerShare) * 100 * contracts
          : 0;
      const pnlPct =
        hasMark && Math.abs(entryNetPerShare) > 0
          ? ((currentNetPerShare - entryNetPerShare) / Math.abs(entryNetPerShare)) * 100
          : 0;
      const targetPct = r.planned_profit_target_pct ?? 50;
      const maxProfit = Number(r.max_profit ?? 0);
      const maxRisk = Math.abs(Number(r.max_risk ?? 0));
      const targetDollars = (targetPct / 100) * maxProfit;
      const stopPct = r.planned_stop_loss_pct ?? 100;
      const stopDollars = -(stopPct / 100) * maxRisk;
      const progressPct =
        targetDollars > 0 ? Math.max(-100, Math.min(100, (pnl / targetDollars) * 100)) : 0;
      const status: "In Profit Zone" | "At Risk" | "Near Stop" | "Watching" =
        !hasMark
          ? "Watching"
          : pnl >= targetDollars * 0.5 && pnl > 0
            ? "In Profit Zone"
            : pnl <= stopDollars * 0.8
              ? "Near Stop"
              : pnl <= stopDollars * 0.5
                ? "At Risk"
                : "Watching";
      const thetaPerDay = (Number(r.entry_theta) || 0) * contracts;
      return { row: r, dte, contracts, pnl, pnlPct, progressPct, status, thetaPerDay, hasMark };
    });
  }, [rows, marks]);

  const greeks = useMemo(() => summarizeGreeks(rows ?? []), [rows]);
  const unrealized = useMemo(
    () => computed.reduce((acc, c) => acc + (c.hasMark ? c.pnl : 0), 0),
    [computed],
  );

  const alerts = useMemo(() => {
    const expiringSoon = computed.filter((c) => c.dte === 7);
    const expiringTomorrow = computed.filter((c) => c.dte === 1);
    return { expiringSoon, expiringTomorrow };
  }, [computed]);

  async function handleClose() {
    if (!closing) return;
    const markPerShare = Number(closeMark);
    if (!isFinite(markPerShare) || markPerShare < 0) {
      toast.error("Enter a valid exit premium.");
      return;
    }
    setBusy(true);
    try {
      const contracts = Math.max(1, Number(closing.leg1_contracts) || 1);
      const entryNetPerShare =
        (closing.leg1_action === "Buy" ? closing.leg1_premium : -closing.leg1_premium) +
        (closing.leg2_premium != null && closing.leg2_action != null
          ? closing.leg2_action === "Buy"
            ? closing.leg2_premium
            : -closing.leg2_premium
          : 0);
      const gross = (markPerShare - entryNetPerShare) * 100 * contracts;
      const legs = closing.leg2_strike != null ? 2 : 1;
      const commission = contracts * legs * 0.65;
      const net = gross - commission;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("options_trades")
        .update({
          status: "Closed",
          exit_premium: markPerShare,
          gross_pnl: gross,
          net_pnl: net,
          actual_exit_reason: "Manual",
        })
        .eq("id", closing.id);
      if (error) throw error;
      toast.success(`Closed ${closing.strategy_type} on ${closing.underlying} (${fmt$(net)})`);
      setClosing(null);
      setCloseMark("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to close.");
    } finally {
      setBusy(false);
    }
  }

  function handleRoll(r: OpenPosition) {
    sessionStorage.setItem(
      "pendingOptionsPrefill",
      JSON.stringify({
        strategy: r.strategy_type,
        underlying: r.underlying,
        rollFrom: {
          strategy: r.strategy_type,
          underlying: r.underlying,
          leg1Strike: r.leg1_strike,
          leg2Strike: r.leg2_strike ?? undefined,
        },
      }),
    );
    window.dispatchEvent(new CustomEvent("options-prefill"));
    toast.message("Rolling — set a new expiration in the form.");
  }

  function startAdjust(r: OpenPosition) {
    setAdjusting(r);
    setAdjNotes(r.notes ?? "");
    setAdjTarget(r.planned_profit_target_pct?.toString() ?? "");
    setAdjStop(r.planned_stop_loss_pct?.toString() ?? "");
  }

  async function saveAdjust() {
    if (!adjusting) return;
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("options_trades")
        .update({
          notes: adjNotes || null,
          planned_profit_target_pct: adjTarget ? Number(adjTarget) : null,
          planned_stop_loss_pct: adjStop ? Number(adjStop) : null,
        })
        .eq("id", adjusting.id);
      if (error) throw error;
      toast.success("Position updated.");
      setAdjusting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading open options positions…
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return null; // hide entirely when nothing is open
  }

  return (
    <div className="space-y-3">
      {/* Portfolio summary */}
      <Card className="p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat label="Open" value={`${rows.length}`} />
          <Stat
            label="Net Theta"
            value={`${fmt$(greeks.netTheta)}/day`}
            tone={greeks.netTheta < -50 ? "danger" : undefined}
          />
          <Stat
            label="Net Delta"
            value={greeks.bias}
            tone={
              greeks.bias === "Bullish"
                ? "good"
                : greeks.bias === "Bearish"
                  ? "danger"
                  : undefined
            }
          />
          <Stat
            label="Unrealized P&L"
            value={fmt$(unrealized)}
            tone={unrealized > 0 ? "good" : unrealized < 0 ? "danger" : undefined}
          />
        </div>
      </Card>

      {/* DTE alerts */}
      {alerts.expiringTomorrow.map((c) => (
        <div
          key={`exp1-${c.row.id}`}
          className="flex items-start gap-2 rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>EXPIRATION TOMORROW:</strong> {c.row.underlying} {c.row.strategy_type}
            {c.hasMark ? ` · Current value: ${fmt$(c.pnl)}` : ""} · Decision required today.
          </span>
        </div>
      ))}
      {alerts.expiringSoon.map((c) => (
        <div
          key={`exp7-${c.row.id}`}
          className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {c.row.strategy_type} on {c.row.underlying} expires in 7 days. Consider: close
            for remaining value · roll · let expire.
          </span>
        </div>
      ))}

      {/* Cards */}
      <div className="grid grid-cols-1 gap-3">
        {computed.map(({ row, dte, contracts, pnl, pnlPct, progressPct, status, thetaPerDay, hasMark }) => {
          const tone = dteTone(dte, row.is_0dte);
          const statusTone =
            status === "In Profit Zone"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : status === "Near Stop"
                ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                : status === "At Risk"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-border bg-muted/30 text-muted-foreground";
          return (
            <Card key={row.id} className={cn("p-3 space-y-3", tone.cardRing)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm">{row.underlying}</span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      {row.strategy_type}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border",
                        tone.cls,
                      )}
                    >
                      {tone.label}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                        statusTone,
                      )}
                    >
                      {status}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 font-data">
                    {contracts}c · exp {row.leg1_expiration} · θ {fmt$(thetaPerDay)}/day
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={cn(
                      "font-mono text-sm font-bold",
                      !hasMark
                        ? "text-muted-foreground"
                        : pnl > 0
                          ? "text-emerald-400"
                          : pnl < 0
                            ? "text-rose-400"
                            : "text-muted-foreground",
                    )}
                  >
                    {hasMark ? fmt$(pnl) : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {hasMark ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(0)}%` : "set mark"}
                  </div>
                </div>
              </div>

              {/* P&L progress toward target */}
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden relative">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  <div
                    className={cn(
                      "h-full transition-all",
                      progressPct >= 0 ? "bg-emerald-500" : "bg-rose-500",
                    )}
                    style={{
                      width: `${Math.abs(progressPct) / 2}%`,
                      marginLeft: progressPct >= 0 ? "50%" : `${50 - Math.abs(progressPct) / 2}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-data text-muted-foreground">
                  <span>Stop</span>
                  <span>Entry</span>
                  <span>Target {row.planned_profit_target_pct ?? 50}%</span>
                </div>
              </div>

              {/* Mark + actions */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[140px]">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Mark (per share)
                  </Label>
                  <Input
                    inputMode="decimal"
                    placeholder={`entry ${(row.leg1_premium ?? 0).toFixed(2)}`}
                    value={marks[row.id] ?? ""}
                    onChange={(e) => setMarks((m) => ({ ...m, [row.id]: e.target.value }))}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => {
                      setClosing(row);
                      setCloseMark(marks[row.id] ?? "");
                    }}
                  >
                    <X className="h-3.5 w-3.5" /> Close
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => handleRoll(row)}
                  >
                    <RotateCw className="h-3.5 w-3.5" /> Roll
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => startAdjust(row)}
                  >
                    <Settings2 className="h-3.5 w-3.5" /> Adjust
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Close dialog */}
      <Dialog open={!!closing} onOpenChange={(v) => !v && setClosing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Close {closing?.strategy_type} on {closing?.underlying}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Exit premium (per share)</Label>
              <Input
                inputMode="decimal"
                value={closeMark}
                onChange={(e) => setCloseMark(e.target.value)}
                placeholder="e.g. 2.10"
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Net premium of the package per share. Commission is auto-estimated at $0.65/leg/contract.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>
              Cancel
            </Button>
            <Button onClick={handleClose} disabled={busy}>
              {busy ? "Closing…" : "Close Position"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog open={!!adjusting} onOpenChange={(v) => !v && setAdjusting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Adjust {adjusting?.strategy_type} on {adjusting?.underlying}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Profit target %</Label>
                <Input
                  inputMode="decimal"
                  value={adjTarget}
                  onChange={(e) => setAdjTarget(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Stop loss %</Label>
                <Input
                  inputMode="decimal"
                  value={adjStop}
                  onChange={(e) => setAdjStop(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjusting(null)}>
              Cancel
            </Button>
            <Button onClick={saveAdjust} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "danger";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-mono font-semibold",
          tone === "good" ? "text-emerald-400" : tone === "danger" ? "text-rose-400" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}