import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NewTradeSheet } from "@/components/NewTradeSheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  Save,
  Zap,
} from "lucide-react";

const INSTRUMENTS = ["MES", "MNQ", "MBT", "NQ", "ES"] as const;

const TICK_SIZE: Record<string, number> = {
  MES: 0.25,
  ES: 0.25,
  MNQ: 0.25,
  NQ: 0.25,
  MBT: 5,
};

// Approx $ per point (per contract) for risk estimation
const DOLLARS_PER_POINT: Record<string, number> = {
  MES: 5,
  ES: 50,
  MNQ: 2,
  NQ: 20,
  MBT: 0.1,
};

type Dir = "both" | "long" | "short";

function toNum(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function round(n: number, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export function OrbSetupBuilder({ onSaved }: { onSaved?: () => void }) {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const rrSetting = Number(settings?.rr_ratio ?? 1.5);
  const balance = Number(settings?.current_balance ?? 0);
  const riskPct = Number(settings?.risk_pct ?? 1);

  const [instrument, setInstrument] = useState<string>(
    settings?.instrument && INSTRUMENTS.includes(settings.instrument as never)
      ? settings.instrument
      : "MES",
  );
  const [rangeHigh, setRangeHigh] = useState("");
  const [rangeLow, setRangeLow] = useState("");
  const [direction, setDirection] = useState<Dir>("both");
  const [bufferTicks, setBufferTicks] = useState("2");
  const [rr, setRr] = useState(String(rrSetting));
  const [avgRange, setAvgRange] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Trade execution flow
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradePrefill, setTradePrefill] = useState<{
    instrument: string;
    direction: "Long" | "Short";
    entry: number;
    stop: number;
    target: number;
  } | null>(null);

  const tickSize = TICK_SIZE[instrument] ?? Number(settings?.tick_value) ?? 0.25;
  const dpp = DOLLARS_PER_POINT[instrument] ?? 1;

  const calc = useMemo(() => {
    const hi = toNum(rangeHigh);
    const lo = toNum(rangeLow);
    const buf = toNum(bufferTicks) ?? 0;
    const rrNum = toNum(rr) ?? rrSetting;
    const avg = toNum(avgRange);
    if (hi == null || lo == null || hi <= lo) return null;

    const rangeSize = round(hi - lo, 4);
    const bufferPts = buf * tickSize;

    const longEntry = round(hi + tickSize, 4);
    const longStop = round(lo - bufferPts, 4);
    const longRisk = round(longEntry - longStop, 4);
    const longTarget = round(longEntry + rangeSize * rrNum, 4);

    const shortEntry = round(lo - tickSize, 4);
    const shortStop = round(hi + bufferPts, 4);
    const shortRisk = round(shortStop - shortEntry, 4);
    const shortTarget = round(shortEntry - rangeSize * rrNum, 4);

    const longRiskUsd = round(longRisk * dpp, 2);
    const shortRiskUsd = round(shortRisk * dpp, 2);

    // Quality score 1-5 based on range size vs avg
    let quality: number | null = null;
    if (avg && avg > 0) {
      const ratio = rangeSize / avg;
      if (ratio < 0.5) quality = 1;
      else if (ratio < 0.8) quality = 2;
      else if (ratio <= 1.2) quality = 4;
      else if (ratio <= 1.6) quality = 5;
      else quality = 3; // too wide = chop risk
    }

    return {
      rangeSize,
      longEntry, longStop, longTarget, longRiskUsd,
      shortEntry, shortStop, shortTarget, shortRiskUsd,
      rrNum, quality, avg,
    };
  }, [rangeHigh, rangeLow, bufferTicks, rr, avgRange, tickSize, dpp, rrSetting]);

  const accountRiskCap = balance > 0 ? round(balance * (riskPct / 100), 2) : null;

  const showLong = direction === "both" || direction === "long";
  const showShort = direction === "both" || direction === "short";

  const save = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }
    if (!calc) {
      toast.error("Enter valid range high and low first");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("watch_setups").insert({
        user_id: user.id,
        instrument,
        direction_pref: direction,
        range_high: Number(rangeHigh),
        range_low: Number(rangeLow),
        range_size: calc.rangeSize,
        buffer_ticks: Number(bufferTicks) || 0,
        tick_size: tickSize,
        rr_ratio: calc.rrNum,
        avg_range: calc.avg ?? null,
        long_entry: showLong ? calc.longEntry : null,
        long_stop: showLong ? calc.longStop : null,
        long_target: showLong ? calc.longTarget : null,
        short_entry: showShort ? calc.shortEntry : null,
        short_stop: showShort ? calc.shortStop : null,
        short_target: showShort ? calc.shortTarget : null,
        quality_score: calc.quality,
        notes: notes.trim() || null,
        status: "watching",
      });
      if (error) throw error;
      toast.success("Setup plan saved");
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save plan");
    } finally {
      setSaving(false);
    }
  };

  const execute = (side: "Long" | "Short") => {
    if (!calc) return;
    setTradePrefill({
      instrument,
      direction: side,
      entry: side === "Long" ? calc.longEntry : calc.shortEntry,
      stop: side === "Long" ? calc.longStop : calc.shortStop,
      target: side === "Long" ? calc.longTarget : calc.shortTarget,
    });
    setTradeOpen(true);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        ORB Setup Builder
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            Instrument
          </Label>
          <Select value={instrument} onValueChange={setInstrument}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INSTRUMENTS.map((i) => (
                <SelectItem key={i} value={i}>{i}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Range High</Label>
          <Input
            value={rangeHigh}
            onChange={(e) => setRangeHigh(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 5210.50"
            className="mt-1 font-data tabular-nums"
          />
        </div>
        <div>
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Range Low</Label>
          <Input
            value={rangeLow}
            onChange={(e) => setRangeLow(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 5202.75"
            className="mt-1 font-data tabular-nums"
          />
        </div>

        <div className="col-span-2">
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            Direction preference
          </Label>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {(["both", "long", "short"] as Dir[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-data uppercase tracking-wider",
                  direction === d
                    ? "border-trade-green bg-trade-green/10 text-trade-green"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {d === "both" ? "Both" : d === "long" ? "Long Only" : "Short Only"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Buffer (ticks)</Label>
          <Input
            value={bufferTicks}
            onChange={(e) => setBufferTicks(e.target.value)}
            inputMode="decimal"
            className="mt-1 font-data tabular-nums"
          />
        </div>
        <div>
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">R:R</Label>
          <Input
            value={rr}
            onChange={(e) => setRr(e.target.value)}
            inputMode="decimal"
            className="mt-1 font-data tabular-nums"
          />
        </div>

        <div className="col-span-2">
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            Avg range (optional, for quality score)
          </Label>
          <Input
            value={avgRange}
            onChange={(e) => setAvgRange(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 8.5 points"
            className="mt-1 font-data tabular-nums"
          />
        </div>

        <div className="col-span-2">
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Confluence, invalidation conditions…"
            rows={2}
            className="mt-1"
          />
        </div>
      </div>

      {/* Output */}
      {calc ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
            <div>
              <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">Range size</div>
              <div className="font-data text-lg tabular-nums text-foreground">{calc.rangeSize} pts</div>
            </div>
            {calc.quality != null ? (
              <div className="text-right">
                <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">Quality</div>
                <div
                  className={cn(
                    "font-data text-lg tabular-nums",
                    calc.quality >= 4 ? "text-trade-green" : calc.quality === 3 ? "text-amber-400" : "text-trade-red",
                  )}
                >
                  {calc.quality}/5
                </div>
              </div>
            ) : null}
          </div>

          {showLong ? (
            <SetupSidePanel
              side="Long"
              entry={calc.longEntry}
              stop={calc.longStop}
              target={calc.longTarget}
              riskUsd={calc.longRiskUsd}
              accountRiskCap={accountRiskCap}
              onExecute={() => execute("Long")}
            />
          ) : null}
          {showShort ? (
            <SetupSidePanel
              side="Short"
              entry={calc.shortEntry}
              stop={calc.shortStop}
              target={calc.shortTarget}
              riskUsd={calc.shortRiskUsd}
              accountRiskCap={accountRiskCap}
              onExecute={() => execute("Short")}
            />
          ) : null}

          <Button onClick={save} disabled={saving} variant="outline" className="w-full">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save as Setup Plan"}
          </Button>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
          Enter range high &amp; low (high must be greater than low) to see entry, stop, target.
        </div>
      )}

      <NewTradeSheet
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        prefill={
          tradePrefill
            ? {
                instrument: tradePrefill.instrument,
                direction: tradePrefill.direction,
                entry: tradePrefill.entry,
                stop: tradePrefill.stop,
                target: tradePrefill.target,
              }
            : null
        }
      />
    </section>
  );
}

function SetupSidePanel({
  side,
  entry,
  stop,
  target,
  riskUsd,
  accountRiskCap,
  onExecute,
}: {
  side: "Long" | "Short";
  entry: number;
  stop: number;
  target: number;
  riskUsd: number;
  accountRiskCap: number | null;
  onExecute: () => void;
}) {
  const isLong = side === "Long";
  const Icon = isLong ? TrendingUp : TrendingDown;
  const color = isLong ? "text-trade-green border-trade-green/40" : "text-trade-red border-trade-red/40";
  const overRisk = accountRiskCap != null && riskUsd > accountRiskCap;
  return (
    <div className={cn("rounded-lg border bg-background p-3", color)}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-4 w-4" />
          <span className="font-data text-sm font-semibold uppercase tracking-wider">{side}</span>
        </div>
        <span className={cn("font-data text-xs tabular-nums", overRisk ? "text-trade-red" : "text-muted-foreground")}>
          Risk ${riskUsd}
          {accountRiskCap != null ? ` / cap $${accountRiskCap}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Entry" value={entry} />
        <Stat label="Stop" value={stop} />
        <Stat label="Target" value={target} />
      </div>
      <Button onClick={onExecute} className="mt-3 w-full" size="sm">
        <Zap className="h-4 w-4" />
        Execute {side}
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-data text-sm tabular-nums text-foreground">{value}</div>
    </div>
  );
}