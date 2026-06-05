import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NewTradeSheet } from "@/components/NewTradeSheet";
import { useUserSettings } from "@/hooks/useUserSettings";
import { addSetup } from "@/lib/setupWatchlistStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  Circle,
  Plus,
  TrendingUp,
  TrendingDown,
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

const DOLLARS_PER_POINT: Record<string, number> = {
  MES: 5,
  ES: 50,
  MNQ: 2,
  NQ: 20,
  MBT: 0.1,
};

type Side = "above" | "below";

function toNum(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function round(n: number, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/** True if current NY time is before 10:30 AM (prime reclaim window). */
function useBeforePrimeCutoff() {
  const [ok, setOk] = useState(() => isBeforeCutoff());
  useEffect(() => {
    const id = setInterval(() => setOk(isBeforeCutoff()), 60_000);
    return () => clearInterval(id);
  }, []);
  return ok;
}

function isBeforeCutoff() {
  if (typeof window === "undefined") return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  // 10:30 AM NY ≈ 11:30 AM CT? No — spec says "before 10:30 AM CT" = 11:30 AM ET.
  return h * 60 + m < 11 * 60 + 30;
}

export function VwapReclaimBuilder() {
  const { settings } = useUserSettings();
  const rrSetting = Number(settings?.rr_ratio ?? 1.5);

  const [instrument, setInstrument] = useState<string>(
    settings?.instrument && INSTRUMENTS.includes(settings.instrument as never)
      ? settings.instrument
      : "MES",
  );
  const [vwap, setVwap] = useState("");
  const [price, setPrice] = useState("");
  const [side, setSide] = useState<Side>("above");
  const [reclaimed, setReclaimed] = useState<boolean>(false);
  const [stopTicks, setStopTicks] = useState("4");
  const [rr, setRr] = useState(String(rrSetting));

  // Quality flags
  const [cleanReclaim, setCleanReclaim] = useState(false);
  const [volumeIncrease, setVolumeIncrease] = useState(false);
  const [trendAligns, setTrendAligns] = useState(false);
  const [firstReclaim, setFirstReclaim] = useState(false);
  const primeTime = useBeforePrimeCutoff();

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

  // Direction: reclaim from below → Long (price moved above VWAP).
  // reclaim from above → Short (price moved below VWAP).
  const direction: "Long" | "Short" = side === "above" ? "Long" : "Short";

  const calc = useMemo(() => {
    const v = toNum(vwap);
    const p = toNum(price);
    const ticks = toNum(stopTicks) ?? 0;
    const rrNum = toNum(rr) ?? rrSetting;
    if (v == null || p == null || ticks <= 0) return null;

    const stopPts = ticks * tickSize;

    if (direction === "Long") {
      const entry = round(p, 4);
      const stop = round(v - stopPts, 4);
      const risk = round(entry - stop, 4);
      if (risk <= 0) return null;
      const target = round(entry + risk * rrNum, 4);
      return { entry, stop, target, risk, riskUsd: round(risk * dpp, 2), rrNum };
    } else {
      const entry = round(p, 4);
      const stop = round(v + stopPts, 4);
      const risk = round(stop - entry, 4);
      if (risk <= 0) return null;
      const target = round(entry - risk * rrNum, 4);
      return { entry, stop, target, risk, riskUsd: round(risk * dpp, 2), rrNum };
    }
  }, [vwap, price, stopTicks, rr, tickSize, dpp, direction, rrSetting]);

  const factors = [
    { key: "clean", label: "Price reclaimed VWAP cleanly (no chop)", on: cleanReclaim, toggle: () => setCleanReclaim((v) => !v) },
    { key: "vol", label: "Volume increased on reclaim", on: volumeIncrease, toggle: () => setVolumeIncrease((v) => !v) },
    { key: "trend", label: "Trend aligns with VWAP position", on: trendAligns, toggle: () => setTrendAligns((v) => !v) },
    { key: "first", label: "First reclaim of the session (strongest)", on: firstReclaim, toggle: () => setFirstReclaim((v) => !v) },
    { key: "time", label: "Before 10:30 AM CT (prime session)", on: primeTime, toggle: undefined as undefined | (() => void) },
  ];

  const score = factors.filter((f) => f.on).length;

  const verdict =
    score >= 4
      ? { label: "A+ Setup", tone: "text-trade-green border-trade-green/40 bg-trade-green/10" }
      : score === 3
        ? { label: "B Setup", tone: "text-amber-400 border-amber-500/40 bg-amber-500/10" }
        : { label: "Skip — Low Quality", tone: "text-trade-red border-trade-red/40 bg-trade-red/10" };

  const canTrade = reclaimed && calc != null;

  const execute = () => {
    if (!calc) return;
    setTradePrefill({
      instrument,
      direction,
      entry: calc.entry,
      stop: calc.stop,
      target: calc.target,
    });
    setTradeOpen(true);
  };

  const addToWatchlist = () => {
    const v = toNum(vwap);
    if (v == null) {
      toast.error("Enter VWAP level first");
      return;
    }
    addSetup({
      setupType: "VWAP Reclaim",
      instrument: instrument.toUpperCase(),
      level: `VWAP ${v} — ${direction} reclaim (${score}/5)`,
      direction: direction === "Long" ? "long" : "short",
      notes:
        `Reclaim factors: ${factors.filter((f) => f.on).map((f) => f.label).join("; ") || "none"}.` +
        (calc ? ` Entry ${calc.entry}, Stop ${calc.stop}, Target ${calc.target} (R:R ${calc.rrNum}).` : ""),
    });
    toast.success("Added to watchlist");
  };

  const DirIcon = direction === "Long" ? TrendingUp : TrendingDown;
  const dirColor = direction === "Long" ? "text-trade-green" : "text-trade-red";

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
        <Activity className="h-3 w-3" />
        VWAP Reclaim Builder
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Instrument</Label>
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
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Current VWAP</Label>
          <Input
            value={vwap}
            onChange={(e) => setVwap(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 5205.50"
            className="mt-1 font-data tabular-nums"
          />
        </div>
        <div>
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Current Price</Label>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 5207.25"
            className="mt-1 font-data tabular-nums"
          />
        </div>

        <div className="col-span-2">
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            Price relative to VWAP
          </Label>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {(["above", "below"] as Side[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-data uppercase tracking-wider",
                  side === s
                    ? s === "above"
                      ? "border-trade-green bg-trade-green/10 text-trade-green"
                      : "border-trade-red bg-trade-red/10 text-trade-red"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "above" ? "Above VWAP" : "Below VWAP"}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            Has price reclaimed VWAP?
          </Label>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {[true, false].map((b) => (
              <button
                key={String(b)}
                type="button"
                onClick={() => setReclaimed(b)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-data uppercase tracking-wider",
                  reclaimed === b
                    ? "border-foreground bg-muted text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {b ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>

        {reclaimed ? (
          <>
            <div>
              <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
                Stop buffer (ticks past VWAP)
              </Label>
              <Input
                value={stopTicks}
                onChange={(e) => setStopTicks(e.target.value)}
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
          </>
        ) : null}
      </div>

      {/* Trade plan */}
      {reclaimed ? (
        calc ? (
          <div className={cn("mt-4 rounded-lg border bg-background p-3", direction === "Long" ? "border-trade-green/40" : "border-trade-red/40")}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <DirIcon className={cn("h-4 w-4", dirColor)} />
                <span className={cn("font-data text-sm font-semibold uppercase tracking-wider", dirColor)}>
                  {direction} Reclaim
                </span>
              </div>
              <span className="font-data text-xs tabular-nums text-muted-foreground">
                Risk ${calc.riskUsd}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Entry" value={calc.entry} />
              <Stat label="Stop" value={calc.stop} />
              <Stat label="Target" value={calc.target} />
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
            Enter VWAP, current price, and a positive stop buffer to see the plan.
          </div>
        )
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
          Mark the reclaim as confirmed to generate entry, stop, and target.
        </div>
      )}

      {/* Quality factors */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            Quality factors
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-data uppercase tracking-wider",
              verdict.tone,
            )}
          >
            {score}/5 · {verdict.label}
          </span>
        </div>
        <ul className="space-y-1.5">
          {factors.map((f) => {
            const Icon = f.on ? CheckCircle2 : Circle;
            const interactive = typeof f.toggle === "function";
            return (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={f.toggle}
                  disabled={!interactive}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs",
                    f.on
                      ? "border-trade-green/40 bg-trade-green/5 text-foreground"
                      : "border-border bg-background text-muted-foreground",
                    interactive ? "hover:bg-muted" : "cursor-default",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", f.on ? "text-trade-green" : "text-muted-foreground")} />
                  <span className="flex-1">{f.label}</span>
                  {!interactive ? (
                    <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">auto</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={addToWatchlist}>
          <Plus className="h-4 w-4" />
          Add to Watchlist
        </Button>
        <Button onClick={execute} disabled={!canTrade}>
          <Zap className="h-4 w-4" />
          Execute {direction}
        </Button>
      </div>

      <NewTradeSheet
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        prefill={tradePrefill}
      />
    </section>
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