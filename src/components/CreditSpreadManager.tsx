import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Settings2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type CreditSpread = {
  id: string;
  underlying: string;
  strategy_type: string;
  status: string;
  trade_date: string;
  is_debit: boolean;
  is_0dte: boolean;
  leg1_type: string; // short leg
  leg1_action: string;
  leg1_strike: number;
  leg1_expiration: string;
  leg1_premium: number;
  leg1_contracts: number;
  leg2_type: string | null; // long leg
  leg2_action: string | null;
  leg2_strike: number | null;
  leg2_premium: number | null;
  underlying_price_at_entry: number | null;
  premium_paid_or_received: number | null;
  max_risk: number | null;
  max_profit: number | null;
  break_even_price: number | null;
};

type LiveData = {
  currentUnderlying: number | null;
  currentDebit: number | null; // per-share cost to close
};

type Rules = {
  profitPct: number; // default 50
  stopLossPct: number; // 200 means 200% of credit received
  defenseDistance: number; // $ distance from short strike to trigger
};

const DEFAULT_RULES: Rules = {
  profitPct: 50,
  stopLossPct: 200,
  defenseDistance: 2,
};

function rulesKey(uid: string) {
  return `creditSpreadRules:${uid}`;
}
function liveKey(uid: string, id: string) {
  return `creditSpreadLive:${uid}:${id}`;
}

function dteFrom(dateStr: string): number {
  const exp = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

function isCreditSpread(s: string) {
  return s === "Bull Put Spread" || s === "Bear Call Spread";
}

function shortStrike(p: CreditSpread): number {
  return p.leg1_strike;
}

function loadRules(uid: string): Rules {
  try {
    const v = localStorage.getItem(rulesKey(uid));
    if (!v) return DEFAULT_RULES;
    return { ...DEFAULT_RULES, ...JSON.parse(v) };
  } catch {
    return DEFAULT_RULES;
  }
}
function saveRules(uid: string, r: Rules) {
  try {
    localStorage.setItem(rulesKey(uid), JSON.stringify(r));
  } catch {
    /* noop */
  }
}
function loadLive(uid: string, id: string): LiveData {
  try {
    const v = localStorage.getItem(liveKey(uid, id));
    if (!v) return { currentUnderlying: null, currentDebit: null };
    return JSON.parse(v);
  } catch {
    return { currentUnderlying: null, currentDebit: null };
  }
}
function saveLive(uid: string, id: string, data: LiveData) {
  try {
    localStorage.setItem(liveKey(uid, id), JSON.stringify(data));
  } catch {
    /* noop */
  }
}

export function CreditSpreadManager() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CreditSpread[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [rulesOpen, setRulesOpen] = useState(false);
  // forces re-render on live data change
  const [tick, setTick] = useState(0);

  const fetchRows = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("options_trades")
      .select(
        "id, underlying, strategy_type, status, trade_date, is_debit, is_0dte, leg1_type, leg1_action, leg1_strike, leg1_expiration, leg1_premium, leg1_contracts, leg2_type, leg2_action, leg2_strike, leg2_premium, underlying_price_at_entry, premium_paid_or_received, max_risk, max_profit, break_even_price",
      )
      .eq("user_id", user.id)
      .eq("status", "Open")
      .eq("is_debit", false)
      .is("deleted_at", null);
    const all = (data ?? []) as CreditSpread[];
    setRows(all.filter((r) => isCreditSpread(r.strategy_type)));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (user?.id) setRules(loadRules(user.id));
  }, [user?.id]);

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading credit spreads…
      </Card>
    );
  }

  if (!rows || rows.length === 0) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            Credit Spreads ({rows.length})
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRulesOpen(true)}
          className="h-7 px-2 text-xs"
        >
          <Settings2 className="h-3 w-3 mr-1" /> Rules
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <SpreadCard
            key={r.id + ":" + tick}
            spread={r}
            rules={rules}
            userId={user!.id}
            onChange={() => setTick((t) => t + 1)}
          />
        ))}
      </div>

      <RulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rules={rules}
        onSave={(r) => {
          setRules(r);
          if (user?.id) saveRules(user.id, r);
        }}
      />
    </Card>
  );
}

function SpreadCard({
  spread,
  rules,
  userId,
  onChange,
}: {
  spread: CreditSpread;
  rules: Rules;
  userId: string;
  onChange: () => void;
}) {
  const [live, setLive] = useState<LiveData>(() => loadLive(userId, spread.id));

  const setField = (patch: Partial<LiveData>) => {
    const next = { ...live, ...patch };
    setLive(next);
    saveLive(userId, spread.id, next);
    onChange();
  };

  const dte = dteFrom(spread.leg1_expiration);
  const contracts = Math.max(1, spread.leg1_contracts);
  const credit = Math.abs(Number(spread.premium_paid_or_received) || 0);
  const creditPerShare = credit / 100 / contracts;
  const maxProfit = Number(spread.max_profit) || credit;
  const maxRisk = Number(spread.max_risk) || 0;
  const breakEven = Number(spread.break_even_price);
  const shortK = shortStrike(spread);
  const isBullPut = spread.strategy_type === "Bull Put Spread";

  // P&L based on current debit-to-close
  let currentPnL: number | null = null;
  let pctOfMaxProfit: number | null = null;
  let pctOfCreditLoss: number | null = null;
  if (live.currentDebit != null && isFinite(live.currentDebit)) {
    // P&L = (credit received per-share - current debit per-share) × 100 × contracts
    currentPnL = (creditPerShare - live.currentDebit) * 100 * contracts;
    pctOfMaxProfit = maxProfit > 0 ? (currentPnL / maxProfit) * 100 : null;
    // Loss "in % of credit": if currentDebit > credit → loss; the rule says
    // "200% of credit received" means a -2× credit loss.
    if (currentPnL < 0 && credit > 0) {
      pctOfCreditLoss = (Math.abs(currentPnL) / credit) * 100;
    }
  }

  const u = live.currentUnderlying;
  const distToBE =
    u != null && isFinite(u) && isFinite(breakEven) ? u - breakEven : null;
  // For bull put spread, BE is below current price; cushion = u - BE (positive = safe)
  // For bear call spread, BE is above current price; cushion = BE - u
  const cushion =
    distToBE == null ? null : isBullPut ? distToBE : -distToBE;
  const cushionPct =
    cushion != null && u && u > 0 ? (cushion / u) * 100 : null;

  // Distance to short strike for defense alert
  const distToShort =
    u != null && isFinite(u) ? Math.abs(u - shortK) : null;
  const defenseTriggered =
    distToShort != null && distToShort <= rules.defenseDistance;

  // Banners
  const banners: Array<{ tone: "good" | "bad" | "warn" | "info"; text: string }> = [];

  if (pctOfMaxProfit != null && pctOfMaxProfit >= rules.profitPct) {
    banners.push({
      tone: "good",
      text: `PROFIT TARGET HIT: Close for ${currentPnL! >= 0 ? "+" : "-"}$${Math.abs(currentPnL!).toFixed(0)} profit (${pctOfMaxProfit.toFixed(0)}% of max). Don't wait for full expiration.`,
    });
  }

  if (pctOfCreditLoss != null && pctOfCreditLoss >= rules.stopLossPct) {
    banners.push({
      tone: "bad",
      text: `STOP LOSS HIT: Close now for -$${Math.abs(currentPnL!).toFixed(0)} loss (${pctOfCreditLoss.toFixed(0)}% of credit). Do not hold — undefined risk behavior possible.`,
    });
  }

  if (defenseTriggered) {
    const sideWord = isBullPut ? "put" : "call";
    banners.push({
      tone: "warn",
      text: `DEFENSE ALERT: ${spread.underlying} is ${distToShort!.toFixed(2)} from your short ${shortK} ${sideWord} strike. Options: Roll down/out · Close for small loss · Hold.`,
    });
  }

  // Expiration management
  if (dte <= 7 && dte >= 0) {
    if (pctOfMaxProfit != null && pctOfMaxProfit >= 50) {
      banners.push({
        tone: "info",
        text: `${dte}d to expiration with ${pctOfMaxProfit.toFixed(0)}% profit captured — consider closing. Gamma risk increases near expiration.`,
      });
    } else if (
      pctOfMaxProfit == null ||
      pctOfMaxProfit < 25
    ) {
      banners.push({
        tone: "warn",
        text: `ROLL or CLOSE: With ${dte}d remaining, time decay accelerates but so does risk.`,
      });
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border p-3 space-y-2.5",
        dte === 0 && "ring-2 ring-rose-500/60 animate-pulse",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-sm">
              {spread.underlying}
            </span>
            <span className="text-xs text-muted-foreground">
              {spread.strategy_type}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
            Short {shortK}
            {isBullPut ? "P" : "C"} / Long {spread.leg2_strike}
            {isBullPut ? "P" : "C"} · {spread.leg1_expiration} · {contracts}c
          </div>
        </div>
        <span
          className={cn(
            "text-[10px] font-mono px-1.5 py-0.5 rounded border",
            dte === 0
              ? "border-rose-500/60 text-rose-300 bg-rose-500/10"
              : dte < 7
                ? "border-rose-500/40 text-rose-300 bg-rose-500/10"
                : dte <= 14
                  ? "border-amber-500/40 text-amber-300 bg-amber-500/10"
                  : "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
          )}
        >
          {dte}d
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Metric label="Credit received" value={`$${credit.toFixed(0)}`} />
        <Metric
          label="Current cost to close"
          value={
            live.currentDebit != null
              ? `$${(live.currentDebit * 100 * contracts).toFixed(0)}`
              : "—"
          }
        />
        <Metric
          label="Current P&L"
          value={
            currentPnL != null
              ? `${currentPnL >= 0 ? "+" : "-"}$${Math.abs(currentPnL).toFixed(0)}`
              : "—"
          }
          tone={
            currentPnL == null
              ? undefined
              : currentPnL > 0
                ? "good"
                : currentPnL < 0
                  ? "bad"
                  : undefined
          }
        />
        <Metric
          label="% of max profit"
          value={pctOfMaxProfit != null ? `${pctOfMaxProfit.toFixed(0)}%` : "—"}
          tone={
            pctOfMaxProfit != null && pctOfMaxProfit >= rules.profitPct
              ? "good"
              : undefined
          }
        />
        <Metric
          label="Break-even"
          value={isFinite(breakEven) ? `$${breakEven.toFixed(2)}` : "—"}
        />
        <Metric
          label="Safety cushion"
          value={
            cushion != null
              ? `$${cushion.toFixed(2)}${cushionPct != null ? ` (${cushionPct.toFixed(1)}%)` : ""}`
              : "—"
          }
          tone={
            cushion == null
              ? undefined
              : cushion > 0
                ? "good"
                : "bad"
          }
        />
      </div>

      {/* Progress bar to profit target */}
      {pctOfMaxProfit != null && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Profit progress</span>
            <span>Target {rules.profitPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden relative">
            <div
              className={cn(
                "h-full",
                pctOfMaxProfit >= rules.profitPct
                  ? "bg-emerald-400"
                  : pctOfMaxProfit >= 0
                    ? "bg-sky-400"
                    : "bg-rose-400",
              )}
              style={{
                width: `${Math.min(100, Math.max(0, pctOfMaxProfit))}%`,
              }}
            />
            <div
              className="absolute top-0 h-full w-px bg-foreground/60"
              style={{ left: `${rules.profitPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Banners */}
      {banners.length > 0 && (
        <div className="space-y-1.5">
          {banners.map((b, i) => (
            <Banner key={i} tone={b.tone} text={b.text} />
          ))}
        </div>
      )}

      {/* Live data inputs */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Underlying $
          </Label>
          <Input
            type="number"
            step="0.01"
            value={live.currentUnderlying ?? ""}
            placeholder={
              spread.underlying_price_at_entry != null
                ? String(spread.underlying_price_at_entry)
                : "0.00"
            }
            onChange={(e) =>
              setField({
                currentUnderlying:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Cost to close (per share)
          </Label>
          <Input
            type="number"
            step="0.01"
            value={live.currentDebit ?? ""}
            placeholder={creditPerShare.toFixed(2)}
            onChange={(e) =>
              setField({
                currentDebit:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded border border-border/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-sm mt-0.5",
          tone === "good" && "text-emerald-400",
          tone === "bad" && "text-rose-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Banner({
  tone,
  text,
}: {
  tone: "good" | "bad" | "warn" | "info";
  text: string;
}) {
  const Icon =
    tone === "good"
      ? CheckCircle2
      : tone === "bad"
        ? AlertTriangle
        : tone === "warn"
          ? AlertTriangle
          : Clock;
  const cls = {
    good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    bad: "border-rose-500/50 bg-rose-500/10 text-rose-300",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    info: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  }[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded border p-2 text-xs leading-snug",
        cls,
      )}
    >
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function RulesDialog({
  open,
  onOpenChange,
  rules,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rules: Rules;
  onSave: (r: Rules) => void;
}) {
  const [draft, setDraft] = useState<Rules>(rules);
  useEffect(() => setDraft(rules), [rules, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Credit Spread Management Rules</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Profit target (% of max profit)</Label>
            <Input
              type="number"
              min={10}
              max={100}
              value={draft.profitPct}
              onChange={(e) =>
                setDraft({ ...draft, profitPct: Number(e.target.value) || 0 })
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Default: close at 50% of max profit.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Stop loss (% of credit received)</Label>
            <Input
              type="number"
              min={50}
              max={500}
              value={draft.stopLossPct}
              onChange={(e) =>
                setDraft({ ...draft, stopLossPct: Number(e.target.value) || 0 })
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Default: close at 200% loss (2× the credit received).
            </p>
          </div>
          <div className="space-y-1">
            <Label>Defense distance ($ from short strike)</Label>
            <Input
              type="number"
              step="0.5"
              min={0.5}
              max={20}
              value={draft.defenseDistance}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  defenseDistance: Number(e.target.value) || 0,
                })
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Trigger DEFENSE alert when underlying is within this many dollars
              of the short strike.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            Save rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}