import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ListChecks, Sparkles, ShieldAlert, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import type { MarketRegime } from "@/lib/marketRegime";
import {
  classifyConditions,
  type Conditions,
  type MatchResult,
  type PlaybookEntryLite,
  type PlaybookScore,
} from "@/lib/playbookMatcher";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChecklistResult = {
  score: number;
  verdict: "GO" | "CAUTION" | "NO TRADE";
  items: Record<string, boolean>;
  regime?: MarketRegime | null;
  total?: number;
  playbookScore?: PlaybookScore | null;
  playbookEntryName?: string | null;
};

export type ChecklistPrefill = {
  trendIdentified?: boolean;
  withTrend?: boolean;
  nearKeyLevel?: boolean;
  logicalStop?: boolean;
  rrMet?: boolean;
  correctSession?: boolean;
};

type Item = {
  key: keyof ChecklistResult["items"] | string;
  label: (rr: number) => string;
};

const GENERIC_ITEMS: Item[] = [
  { key: "trendIdentified", label: () => "I have identified the trend on HTF" },
  { key: "withTrend", label: () => "I am trading WITH the trend" },
  { key: "nearKeyLevel", label: () => "Entry is near a key level (S/R/VWAP)" },
  { key: "logicalStop", label: () => "Stop is placed at a logical structure level" },
  { key: "rrMet", label: (rr) => `R:R is at least ${rr.toFixed(2)}R` },
  { key: "correctSession", label: () => "I am in the correct session window" },
  { key: "noNews", label: () => "No major news in the next 30 minutes" },
  { key: "noRevenge", label: () => "I am NOT revenge trading" },
  { key: "noFomo", label: () => "I am NOT FOMO trading" },
  { key: "lossLimitOk", label: () => "My daily loss limit has NOT been hit" },
];

const TRENDING_ITEMS: Item[] = [
  { key: "trendDirection", label: () => "Trade is in the direction of the trend" },
  { key: "pullbackEntry", label: () => "Entry is on a pullback to a key level" },
  { key: "notChasing", label: () => "Not chasing — entry is at structure, not mid-air" },
  { key: "stopBeyondSwing", label: () => "Stop is below/above the last swing" },
  { key: "volumeConfirms", label: () => "Volume confirms the move" },
  { key: "noNewsTrend", label: () => "Not within 30 min of major news" },
];

const RANGING_ITEMS: Item[] = [
  { key: "edgeEntry", label: () => "Entry is at or near range boundary (not middle)" },
  { key: "fadingNotBreaking", label: () => "I am fading, not breaking out" },
  { key: "rangeHeldTwice", label: () => "Range has held at least 2 previous touches" },
  { key: "stopOutsideRange", label: () => "Stop is placed outside the range" },
  { key: "targetOppositeEdge", label: () => "Target is the opposite range boundary" },
  { key: "rangeMature", label: () => "Range has been active for at least 1 hour" },
];

const HIGH_VOL_ITEMS: Item[] = [
  { key: "sizeReduced", label: () => "Position size reduced to 50% or less" },
  { key: "widerStop", label: () => "Stop is wider than normal to account for swings" },
  { key: "skipFirst15", label: () => "I am NOT trading the first 15 minutes" },
  { key: "rrTwoToOne", label: () => "R:R is at least 2:1 to justify wider stops" },
  { key: "noNews60", label: () => "No news expected in next 60 minutes" },
  { key: "confirmedSetup", label: () => "Setup is confirmed, not anticipated" },
];

export function getRegimeChecklist(regime?: MarketRegime | null): Item[] {
  switch (regime) {
    case "Trending Up":
    case "Trending Down":
      return TRENDING_ITEMS;
    case "Ranging":
    case "Low Volatility":
      return RANGING_ITEMS;
    case "High Volatility":
    case "News-Driven":
      return HIGH_VOL_ITEMS;
    default:
      return GENERIC_ITEMS;
  }
}

export function verdictFor(score: number, total = 10): ChecklistResult["verdict"] {
  const pct = total > 0 ? score / total : 0;
  if (pct >= 0.8) return "GO";
  if (pct >= 0.5) return "CAUTION";
  return "NO TRADE";
}

function verdictColor(v: ChecklistResult["verdict"]) {
  switch (v) {
    case "GO":
      return { fg: "text-trade-green", bg: "bg-trade-green/10", border: "border-trade-green/40" };
    case "CAUTION":
      return { fg: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/40" };
    case "NO TRADE":
      return { fg: "text-trade-red", bg: "bg-trade-red/10", border: "border-trade-red/40" };
  }
}

function VerdictIcon({ v, className }: { v: ChecklistResult["verdict"]; className?: string }) {
  if (v === "GO") return <CheckCircle2 className={className} />;
  if (v === "CAUTION") return <AlertTriangle className={className} />;
  return <XCircle className={className} />;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rrSetting: number;
  prefill?: ChecklistPrefill | null;
  initial?: ChecklistResult | null;
  onConfirm: (result: ChecklistResult) => void;
  /** Trade date in YYYY-MM-DD; defaults to today (CT). */
  tradeDate?: string;
  /** Override regime detection. */
  regime?: MarketRegime | null;
  /** Extra checklist items injected by the prop-firm rules engine. */
  propFirmItems?: Array<{ key: string; label: string; checked: boolean }>;
  /** Current trade conditions used to match against saved Playbook entries. */
  conditions?: Conditions | null;
}

export function PreTradeChecklist({
  open,
  onOpenChange,
  rrSetting,
  prefill,
  initial,
  onConfirm,
  tradeDate,
  regime: regimeProp,
  propFirmItems,
  conditions,
}: Props) {
  const { user } = useAuth();
  const [loadedRegime, setLoadedRegime] = useState<MarketRegime | null>(null);
  const [playbookEntries, setPlaybookEntries] = useState<PlaybookEntryLite[]>([]);
  const regime = regimeProp ?? loadedRegime;
  const items_def = useMemo(() => getRegimeChecklist(regime), [regime]);

  const buildInitial = (): Record<string, boolean> => {
    const base: Record<string, boolean> = Object.fromEntries(
      items_def.map((i) => [i.key as string, false]),
    );
    if (propFirmItems) {
      for (const it of propFirmItems) base[it.key] = it.checked;
    }
    if (prefill) {
      for (const [k, v] of Object.entries(prefill)) {
        if (typeof v === "boolean") base[k] = v;
      }
    }
    if (initial?.items) {
      for (const [k, v] of Object.entries(initial.items)) base[k] = !!v;
    }
    return base;
  };

  const [items, setItems] = useState<Record<string, boolean>>(buildInitial);

  useEffect(() => {
    if (open) setItems(buildInitial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, regime, propFirmItems]);

  // Auto-load today's regime from the daily game plan when not provided.
  useEffect(() => {
    if (!open || regimeProp || !user) return;
    let cancelled = false;
    const d =
      tradeDate ??
      new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    (async () => {
      const { data } = await supabase
        .from("daily_game_plans")
        .select("market_regime")
        .eq("user_id", user.id)
        .eq("plan_date", d)
        .maybeSingle();
      if (cancelled) return;
      const r = (data?.market_regime ?? null) as MarketRegime | null;
      setLoadedRegime(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, regimeProp, user, tradeDate]);

  // Load saved Playbook entries for matching the current trade against.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("playbook_entries")
        .select("id, name, status, win_rate, baseline_win_rate, trade_count, baseline_trade_count, filters")
        .eq("user_id", user.id);
      if (cancelled) return;
      setPlaybookEntries((data ?? []) as unknown as PlaybookEntryLite[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const match = useMemo<MatchResult | null>(() => {
    if (!conditions || playbookEntries.length === 0) return null;
    return classifyConditions(playbookEntries, conditions);
  }, [conditions, playbookEntries]);

  const score = useMemo(
    () => items_def.reduce((n, it) => n + (items[it.key as string] ? 1 : 0), 0),
    [items, items_def],
  );
  const firmScore = useMemo(
    () => (propFirmItems ?? []).reduce((n, it) => n + (items[it.key] ? 1 : 0), 0),
    [items, propFirmItems],
  );
  const total = items_def.length + (propFirmItems?.length ?? 0);
  const totalScore = score + firmScore;
  const verdict = verdictFor(totalScore, total);
  const c = verdictColor(verdict);

  const toggle = (k: string) => setItems((prev) => ({ ...prev, [k]: !prev[k] }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <ListChecks className="h-4 w-4 text-trade-green" />
            Pre-Trade Checklist
          </DialogTitle>
          <DialogDescription>
            {regime
              ? `${regime} regime — tailored checks for today's market.`
              : "No regime set in today's Game Plan — using generic checklist."}
          </DialogDescription>
        </DialogHeader>

        {match && <PlaybookBanner match={match} hasEntries={playbookEntries.length > 0} />}

        <ul className="mt-2 space-y-1.5">
          {items_def.map((it) => {
            const k = it.key as string;
            const checked = !!items[k];
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => toggle(k)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                    checked
                      ? "border-trade-green/40 bg-trade-green/5 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-border hover:bg-accent/30 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-trade-green bg-trade-green text-background"
                        : "border-border bg-background",
                    )}
                  >
                    {checked && <CheckCircle2 className="h-3 w-3" />}
                  </span>
                  <span className="flex-1">{it.label(rrSetting)}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {propFirmItems && propFirmItems.length > 0 && (
          <>
            <div className="mt-4 text-[10px] font-data uppercase tracking-[2px] text-trade-blue">
              Prop Firm Rules
            </div>
            <ul className="mt-2 space-y-1.5">
              {propFirmItems.map((it) => {
                const checked = !!items[it.key];
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={() => toggle(it.key)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                        checked
                          ? "border-trade-blue/50 bg-trade-blue/5 text-foreground"
                          : "border-trade-red/40 bg-trade-red/5 text-trade-red hover:bg-trade-red/10",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          checked
                            ? "border-trade-blue bg-trade-blue text-background"
                            : "border-trade-red bg-background",
                        )}
                      >
                        {checked && <CheckCircle2 className="h-3 w-3" />}
                      </span>
                      <span className="flex-1">{it.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className={cn("mt-4 rounded-xl border p-4", c.border, c.bg)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
                {regime ? `${regime} Score` : "Score"}
              </div>
              <div className={cn("text-3xl font-bold font-data", c.fg)}>
                {totalScore}
                <span className="text-sm text-muted-foreground">/{total}</span>
              </div>
            </div>
            <div className={cn("flex items-center gap-2 text-right", c.fg)}>
              <VerdictIcon v={verdict} className="h-6 w-6" />
              <div className="text-lg font-bold font-data uppercase tracking-wider">
                {verdict}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm({
                score: totalScore,
                verdict,
                items,
                regime: regime ?? null,
                total,
                playbookScore: match?.score ?? null,
                playbookEntryName: match?.entry?.name ?? null,
              });
              onOpenChange(false);
            }}
            className="bg-trade-green text-background hover:bg-trade-green/90 font-data uppercase tracking-wider"
          >
            Save Checklist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlaybookBanner({ match, hasEntries }: { match: MatchResult; hasEntries: boolean }) {
  if (!hasEntries) return null;
  if (match.score === "A+ Match" && match.entry) {
    const wr = Math.round((match.winRate ?? 0) * 100);
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-trade-green/40 bg-trade-green/10 p-3 text-xs">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-trade-green" />
        <div>
          <div className="font-data uppercase tracking-wider text-[10px] text-trade-green font-semibold">
            A+ Setup Match
          </div>
          <div className="mt-0.5 text-foreground">
            This trade matches your <span className="font-semibold">'{match.entry.name}'</span> setup
            {" "}({wr}% win rate, {match.tradeCount ?? 0} trades).
          </div>
        </div>
      </div>
    );
  }
  if (match.score === "Avoid Pattern" && match.entry) {
    const wr = Math.round((match.winRate ?? 0) * 100);
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-trade-red/40 bg-trade-red/10 p-3 text-xs">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-trade-red" />
        <div>
          <div className="font-data uppercase tracking-wider text-[10px] text-trade-red font-semibold">
            Low Probability Match
          </div>
          <div className="mt-0.5 text-foreground">
            This matches a pattern with only {wr}% win rate ({match.entry.name}). Strongly consider skipping.
          </div>
        </div>
      </div>
    );
  }
  if (match.score === "Partial Match" && match.entry) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div>
          <div className="font-data uppercase tracking-wider text-[10px] text-amber-400 font-semibold">
            Partial Playbook Match
          </div>
          <div className="mt-0.5 text-foreground">
            {match.matchedCount}/{match.totalChecks} conditions match '{match.entry.name}'. Confirm the missing pieces before entering.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div>
        <div className="font-data uppercase tracking-wider text-[10px] text-amber-400 font-semibold">
          Unclassified Setup
        </div>
        <div className="mt-0.5 text-foreground">
          This setup doesn't match any playbook entry. Proceed only if it passes your full checklist.
        </div>
      </div>
    </div>
  );
}