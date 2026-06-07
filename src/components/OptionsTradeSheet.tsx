import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  TrendingUp,
  TrendingDown,
  Layers,
  Zap,
  Plus,
  Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { OptionsPositionSizer } from "@/components/OptionsPositionSizer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import {
  calculateOptionsPnL,
  type StrategyType,
  type LegInput,
} from "@/lib/optionsPnLEngine";

const COMMON_UNDERLYINGS = [
  "SPY",
  "QQQ",
  "SPX",
  "IWM",
  "/ES",
  "/NQ",
  "AAPL",
  "TSLA",
  "NVDA",
];

type StrategyDef = {
  type: StrategyType | "0DTE Play";
  group: "Directional" | "Neutral/Income" | "Volatility" | "Special";
  icon: React.ComponentType<{ className?: string }>;
  legs: 1 | 2 | 4;
  isDebit: boolean;
  directionBias: "Bullish" | "Bearish" | "Neutral" | "Volatility";
};

const STRATEGIES: StrategyDef[] = [
  { type: "Long Call", group: "Directional", icon: TrendingUp, legs: 1, isDebit: true, directionBias: "Bullish" },
  { type: "Long Put", group: "Directional", icon: TrendingDown, legs: 1, isDebit: true, directionBias: "Bearish" },
  { type: "Bull Call Spread", group: "Directional", icon: Layers, legs: 2, isDebit: true, directionBias: "Bullish" },
  { type: "Bear Put Spread", group: "Directional", icon: Layers, legs: 2, isDebit: true, directionBias: "Bearish" },
  { type: "Bull Put Spread", group: "Neutral/Income", icon: Layers, legs: 2, isDebit: false, directionBias: "Bullish" },
  { type: "Bear Call Spread", group: "Neutral/Income", icon: Layers, legs: 2, isDebit: false, directionBias: "Bearish" },
  { type: "Iron Condor", group: "Neutral/Income", icon: Layers, legs: 4, isDebit: false, directionBias: "Neutral" },
  { type: "Iron Butterfly", group: "Neutral/Income", icon: Layers, legs: 4, isDebit: false, directionBias: "Neutral" },
  { type: "Long Straddle", group: "Volatility", icon: Zap, legs: 2, isDebit: true, directionBias: "Volatility" },
  { type: "Long Strangle", group: "Volatility", icon: Zap, legs: 2, isDebit: true, directionBias: "Volatility" },
  { type: "0DTE Play", group: "Special", icon: Zap, legs: 1, isDebit: true, directionBias: "Bullish" },
  { type: "Covered Call", group: "Special", icon: Layers, legs: 1, isDebit: false, directionBias: "Neutral" },
  { type: "Cash Secured Put", group: "Special", icon: Layers, legs: 1, isDebit: false, directionBias: "Neutral" },
];

function dteFor(date: Date | undefined): number {
  if (!date) return 0;
  const ms = date.getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.max(0, Math.round(ms / 86400000));
}

function fmt$(n: number): string {
  if (!isFinite(n)) return "Unlimited";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

type LegState = {
  type: "Call" | "Put";
  action: "Buy" | "Sell";
  strike: string;
  premium: string;
  expiration?: Date;
};

const emptyLeg = (type: "Call" | "Put" = "Call", action: "Buy" | "Sell" = "Buy"): LegState => ({
  type,
  action,
  strike: "",
  premium: "",
});

interface Props {
  onLogged?: () => void;
  trigger?: React.ReactNode;
}

export function OptionsTradeSheet({ onLogged, trigger }: Props) {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const accountBalance = Number(settings?.current_balance ?? 100);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [underlying, setUnderlying] = useState("SPY");
  const [underlyingPrice, setUnderlyingPrice] = useState("");
  const [strategy, setStrategy] = useState<StrategyDef | null>(null);

  // Step 2 — legs
  const [legs, setLegs] = useState<LegState[]>([emptyLeg()]);
  const [sharedExp, setSharedExp] = useState<Date | undefined>(undefined);

  // Step 3
  const [riskPct, setRiskPct] = useState(5);
  const [profitTargetPct, setProfitTargetPct] = useState(50);
  const [stopLossPct, setStopLossPct] = useState(100);
  const [plannedExitDte, setPlannedExitDte] = useState("");
  const [exitRule, setExitRule] = useState<"Target" | "Stop" | "Expiration" | "Manual">("Target");

  // Step 4
  const [ivRank, setIvRank] = useState("");
  const [reason, setReason] = useState("");
  const [catalyst, setCatalyst] = useState("");
  const [checklistScore, setChecklistScore] = useState("");

  // P&L simulator
  const [simPrice, setSimPrice] = useState("");

  // Reset legs when strategy changes
  const selectStrategy = (s: StrategyDef) => {
    setStrategy(s);
    const presets: LegState[] = (() => {
      switch (s.type) {
        case "Long Call":
        case "0DTE Play":
          return [emptyLeg("Call", "Buy")];
        case "Long Put":
          return [emptyLeg("Put", "Buy")];
        case "Bull Call Spread":
          return [emptyLeg("Call", "Buy"), emptyLeg("Call", "Sell")];
        case "Bear Put Spread":
          return [emptyLeg("Put", "Buy"), emptyLeg("Put", "Sell")];
        case "Bull Put Spread":
          return [emptyLeg("Put", "Sell"), emptyLeg("Put", "Buy")];
        case "Bear Call Spread":
          return [emptyLeg("Call", "Sell"), emptyLeg("Call", "Buy")];
        case "Iron Condor":
          return [
            emptyLeg("Put", "Sell"),
            emptyLeg("Put", "Buy"),
            emptyLeg("Call", "Sell"),
            emptyLeg("Call", "Buy"),
          ];
        case "Iron Butterfly":
          return [
            emptyLeg("Put", "Sell"),
            emptyLeg("Put", "Buy"),
            emptyLeg("Call", "Sell"),
            emptyLeg("Call", "Buy"),
          ];
        case "Long Straddle":
        case "Long Strangle":
          return [emptyLeg("Call", "Buy"), emptyLeg("Put", "Buy")];
        case "Covered Call":
          return [emptyLeg("Call", "Sell")];
        case "Cash Secured Put":
          return [emptyLeg("Put", "Sell")];
        default:
          return [emptyLeg()];
      }
    })();
    setLegs(presets);
  };

  // Build a CalcInput-compatible shape from current state
  const calcShape = useMemo(() => {
    if (!strategy) return null;
    const parsedLegs: LegInput[] = legs.map((l) => ({
      type: l.type,
      action: l.action,
      strike: Number(l.strike) || 0,
      premium: Number(l.premium) || 0,
    }));
    const strategyType: StrategyType =
      strategy.type === "0DTE Play" ? "Long Call" : strategy.type;
    return {
      strategyType,
      leg1: parsedLegs[0],
      leg2: parsedLegs[1],
      extraLegs: parsedLegs.slice(2),
      profitTargetPct,
      stopLossPct,
    };
  }, [strategy, legs, profitTargetPct, stopLossPct]);

  // Position sizer computes contracts; we display max-risk / break-even
  const oneContractCalc = useMemo(() => {
    if (!calcShape || !calcShape.leg1) return null;
    try {
      return calculateOptionsPnL({ ...calcShape, contracts: 1 });
    } catch {
      return null;
    }
  }, [calcShape]);

  const [sizingContracts, setSizingContracts] = useState(0);

  // Live "if price moves to X" rough simulator using intrinsic value at expiry
  const intrinsicAtPrice = (price: number, leg: LegState): number => {
    const strike = Number(leg.strike) || 0;
    const intrinsic =
      leg.type === "Call" ? Math.max(0, price - strike) : Math.max(0, strike - price);
    const sign = leg.action === "Buy" ? 1 : -1;
    return sign * intrinsic;
  };

  const simulated = useMemo(() => {
    if (!strategy || !calcShape) return null;
    const price = Number(simPrice);
    if (!isFinite(price) || price <= 0) return null;
    // Premium expected at price (intrinsic only — ignores time value, conservative)
    const intrinsicNet = legs.reduce((acc, l) => acc + intrinsicAtPrice(price, l), 0);
    // Net debit/credit paid at entry per-share
    const entryNet = legs.reduce(
      (acc, l) => acc + (l.action === "Buy" ? Number(l.premium) || 0 : -(Number(l.premium) || 0)),
      0,
    );
    const perSharePnl = intrinsicNet - entryNet;
    const contracts = Math.max(1, sizingContracts);
    return perSharePnl * 100 * contracts;
  }, [simPrice, legs, strategy, calcShape, sizingContracts]);

  const handleSave = async () => {
    if (!user) {
      toast.error("Sign in to log trades.");
      return;
    }
    if (!strategy || !calcShape?.leg1) {
      toast.error("Pick a strategy and fill in leg 1.");
      return;
    }
    if (!underlying.trim()) {
      toast.error("Enter the underlying symbol.");
      return;
    }
    const leg1Exp = legs[0]?.expiration ?? sharedExp;
    if (!leg1Exp) {
      toast.error("Pick an expiration date.");
      return;
    }

    setSaving(true);
    try {
      const contracts = Math.max(1, sizingContracts);
      const oneContract = oneContractCalc;
      const breakEvenSingle = Array.isArray(oneContract?.breakEven)
        ? oneContract!.breakEven[0]
        : (oneContract?.breakEven ?? 0);
      const premiumNet = legs.reduce(
        (acc, l) => acc + (l.action === "Buy" ? Number(l.premium) || 0 : -(Number(l.premium) || 0)),
        0,
      );

      const payload = {
        user_id: user.id,
        trade_date: new Date().toISOString().slice(0, 10),
        status: "Open" as const,
        underlying: underlying.trim().toUpperCase(),
        underlying_price_at_entry: Number(underlyingPrice) || null,
        market_type: underlying.startsWith("/") ? "futures_option" : "equity_option",
        strategy_type: strategy.type,
        direction_bias: strategy.directionBias,
        is_debit: strategy.isDebit,
        is_0dte: strategy.type === "0DTE Play" || dteFor(leg1Exp) === 0,

        leg1_type: legs[0].type,
        leg1_action: legs[0].action,
        leg1_strike: Number(legs[0].strike),
        leg1_expiration: (legs[0].expiration ?? leg1Exp).toISOString().slice(0, 10),
        leg1_premium: Number(legs[0].premium),
        leg1_contracts: contracts,

        leg2_type: legs[1]?.type ?? null,
        leg2_action: legs[1]?.action ?? null,
        leg2_strike: legs[1] ? Number(legs[1].strike) : null,
        leg2_expiration: legs[1]?.expiration
          ? legs[1].expiration!.toISOString().slice(0, 10)
          : legs[1]
            ? leg1Exp.toISOString().slice(0, 10)
            : null,
        leg2_premium: legs[1] ? Number(legs[1].premium) : null,
        leg2_contracts: legs[1] ? contracts : null,

        premium_paid_or_received: premiumNet * 100 * contracts,
        max_risk: oneContract ? oneContract.maxRisk * contracts : null,
        max_profit: oneContract && isFinite(oneContract.maxProfit)
          ? oneContract.maxProfit * contracts
          : null,
        break_even_price: breakEvenSingle,
        commission_total: contracts * (strategy.legs as number) * 0.65 * 2,

        dte_at_entry: dteFor(leg1Exp),
        iv_rank_at_entry: ivRank ? Number(ivRank) : null,
        planned_exit_dte: plannedExitDte ? Number(plannedExitDte) : null,
        planned_profit_target_pct: profitTargetPct,
        planned_stop_loss_pct: stopLossPct,

        notes: [reason && `Reason: ${reason}`, catalyst && `Catalyst: ${catalyst}`]
          .filter(Boolean)
          .join("\n") || null,
        checklist_score: checklistScore ? Number(checklistScore) : null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("options_trades").insert(payload);
      if (error) throw error;

      toast.success(`Logged ${contracts}x ${strategy.type} on ${payload.underlying}`);
      setOpen(false);
      onLogged?.();
      // Reset
      setStrategy(null);
      setLegs([emptyLeg()]);
      setUnderlyingPrice("");
      setReason("");
      setCatalyst("");
      setIvRank("");
      setChecklistScore("");
      setSimPrice("");
      setPlannedExitDte("");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to log options trade");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Options Trade
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Options Trade</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-4 pb-8">
          {/* STEP 1 */}
          <Section title="1. Setup">
            <div className="space-y-2">
              <Label>Underlying</Label>
              <Input
                value={underlying}
                onChange={(e) => setUnderlying(e.target.value.toUpperCase())}
                placeholder="SPY"
                list="underlying-suggestions"
              />
              <datalist id="underlying-suggestions">
                {COMMON_UNDERLYINGS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_UNDERLYINGS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnderlying(u)}
                    className={cn(
                      "px-2 py-0.5 rounded-md text-xs font-mono border",
                      underlying === u
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Current underlying price</Label>
              <Input
                inputMode="decimal"
                value={underlyingPrice}
                onChange={(e) => setUnderlyingPrice(e.target.value)}
                placeholder="450.00"
              />
            </div>
            <div className="space-y-3">
              <Label>Strategy</Label>
              {(["Directional", "Neutral/Income", "Volatility", "Special"] as const).map(
                (group) => (
                  <div key={group}>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
                      {group}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {STRATEGIES.filter((s) => s.group === group).map((s) => {
                        const Icon = s.icon;
                        const active = strategy?.type === s.type;
                        return (
                          <button
                            key={s.type}
                            type="button"
                            onClick={() => selectStrategy(s)}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition",
                              active
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50",
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="font-medium">{s.type}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
            </div>
          </Section>

          {/* STEP 2 */}
          {strategy && (
            <Section title="2. Legs">
              {strategy.legs >= 2 && (
                <div className="space-y-2">
                  <Label>Shared expiration</Label>
                  <ExpirationPicker
                    value={sharedExp}
                    onChange={(d) => {
                      setSharedExp(d);
                      setLegs((prev) => prev.map((l) => ({ ...l, expiration: d })));
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    DTE: {dteFor(sharedExp)}
                  </div>
                </div>
              )}
              {legs.map((leg, idx) => (
                <LegRow
                  key={idx}
                  index={idx}
                  leg={leg}
                  showExpiration={strategy.legs === 1}
                  onChange={(next) =>
                    setLegs((prev) => prev.map((l, i) => (i === idx ? next : l)))
                  }
                />
              ))}

              {oneContractCalc && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <MiniStat label="Max Risk / ct" value={fmt$(oneContractCalc.maxRisk)} />
                  <MiniStat label="Max Profit / ct" value={fmt$(oneContractCalc.maxProfit)} />
                  <MiniStat
                    label="Break Even"
                    value={
                      Array.isArray(oneContractCalc.breakEven)
                        ? `${oneContractCalc.breakEven[0].toFixed(2)} / ${oneContractCalc.breakEven[1].toFixed(2)}`
                        : oneContractCalc.breakEven.toFixed(2)
                    }
                  />
                </div>
              )}
            </Section>
          )}

          {/* STEP 3 */}
          {strategy && calcShape && (
            <Section title="3. Risk Management">
              <OptionsPositionSizer
                accountBalance={accountBalance}
                riskPct={riskPct}
                onRiskPctChange={setRiskPct}
                calc={calcShape}
                onComputed={(r) => setSizingContracts(r.contracts)}
              />

              <PresetRow
                label="Profit target (% of max profit)"
                value={profitTargetPct}
                onChange={setProfitTargetPct}
                presets={[25, 50, 75]}
                suffix="%"
              />
              <PresetRow
                label="Stop loss (% of premium)"
                value={stopLossPct}
                onChange={setStopLossPct}
                presets={[50, 100, 150, 200]}
                suffix="%"
              />

              {strategy.type !== "0DTE Play" && (
                <div className="space-y-2">
                  <Label>Planned exit DTE</Label>
                  <Input
                    inputMode="numeric"
                    value={plannedExitDte}
                    onChange={(e) => setPlannedExitDte(e.target.value)}
                    placeholder="e.g. 7"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Exit rule</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["Target", "Stop", "Expiration", "Manual"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setExitRule(r)}
                      className={cn(
                        "py-2 rounded-md text-xs border",
                        exitRule === r
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* STEP 4 */}
          {strategy && (
            <Section title="4. Context (optional)">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>IV Rank (0–100)</Label>
                  <Input
                    inputMode="numeric"
                    value={ivRank}
                    onChange={(e) => setIvRank(e.target.value)}
                    placeholder="45"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Checklist score</Label>
                  <Input
                    inputMode="numeric"
                    value={checklistScore}
                    onChange={(e) => setChecklistScore(e.target.value)}
                    placeholder="0–10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason for trade</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why this trade?"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>News / catalyst</Label>
                <Input
                  value={catalyst}
                  onChange={(e) => setCatalyst(e.target.value)}
                  placeholder="e.g. CPI print, earnings, FOMC"
                />
              </div>
            </Section>
          )}

          {/* Live P&L simulator */}
          {strategy && oneContractCalc && (
            <Section title="Live P&L Simulator">
              <div className="space-y-2">
                <Label>If {underlying || "underlying"} moves to…</Label>
                <Input
                  inputMode="decimal"
                  value={simPrice}
                  onChange={(e) => setSimPrice(e.target.value)}
                  placeholder={underlyingPrice || "450.00"}
                />
                {Number(underlyingPrice) > 0 && (
                  <Slider
                    min={Math.max(0, Number(underlyingPrice) * 0.8)}
                    max={Number(underlyingPrice) * 1.2}
                    step={0.5}
                    value={[Number(simPrice) || Number(underlyingPrice)]}
                    onValueChange={(v) => setSimPrice(String(v[0]?.toFixed(2)))}
                  />
                )}
              </div>
              {simulated !== null && (
                <div
                  className={cn(
                    "rounded-md p-3 font-mono text-lg text-center",
                    simulated >= 0
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/30",
                  )}
                >
                  {simulated >= 0 ? "+" : ""}
                  {fmt$(simulated)}
                  <span className="text-xs text-muted-foreground ml-2">at expiration</span>
                </div>
              )}
            </Section>
          )}

          {/* Submit */}
          <Button
            className="w-full"
            size="lg"
            disabled={!strategy || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Log Options Trade
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="font-mono text-sm mt-0.5">{value}</div>
    </Card>
  );
}

function ExpirationPicker({
  value,
  onChange,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : "Pick expiration"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function LegRow({
  index,
  leg,
  showExpiration,
  onChange,
}: {
  index: number;
  leg: LegState;
  showExpiration: boolean;
  onChange: (next: LegState) => void;
}) {
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider">
          Leg {index + 1}
        </div>
        <div className="flex gap-1">
          {(["Buy", "Sell"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ ...leg, action: a })}
              className={cn(
                "px-2 py-0.5 rounded text-xs border",
                leg.action === a
                  ? a === "Buy"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-rose-500 bg-rose-500/10 text-rose-400"
                  : "border-border text-muted-foreground",
              )}
            >
              {a}
            </button>
          ))}
          {(["Call", "Put"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ ...leg, type: t })}
              className={cn(
                "px-2 py-0.5 rounded text-xs border",
                leg.type === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Strike</Label>
          <Input
            inputMode="decimal"
            value={leg.strike}
            onChange={(e) => onChange({ ...leg, strike: e.target.value })}
            placeholder="450"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Premium</Label>
          <Input
            inputMode="decimal"
            value={leg.premium}
            onChange={(e) => onChange({ ...leg, premium: e.target.value })}
            placeholder="2.45"
          />
        </div>
      </div>
      {showExpiration && (
        <div className="space-y-1">
          <Label className="text-xs">Expiration</Label>
          <ExpirationPicker
            value={leg.expiration}
            onChange={(d) => onChange({ ...leg, expiration: d })}
          />
        </div>
      )}
    </Card>
  );
}

function PresetRow({
  label,
  value,
  onChange,
  presets,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  presets: number[];
  suffix?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-1.5 items-center">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs border",
              value === p
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {p}
            {suffix}
          </button>
        ))}
        <Input
          className="w-20 h-8"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}
