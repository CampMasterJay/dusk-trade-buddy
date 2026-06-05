import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ListChecks } from "lucide-react";
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

const ITEMS: Item[] = [
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

export function verdictFor(score: number): ChecklistResult["verdict"] {
  if (score >= 8) return "GO";
  if (score >= 5) return "CAUTION";
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
}

export function PreTradeChecklist({
  open,
  onOpenChange,
  rrSetting,
  prefill,
  initial,
  onConfirm,
}: Props) {
  const buildInitial = (): Record<string, boolean> => {
    const base: Record<string, boolean> = Object.fromEntries(
      ITEMS.map((i) => [i.key as string, false]),
    );
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
  }, [open]);

  const score = useMemo(
    () => ITEMS.reduce((n, it) => n + (items[it.key as string] ? 1 : 0), 0),
    [items],
  );
  const verdict = verdictFor(score);
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
            Run through every item before entering the trade. Be honest.
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-2 space-y-1.5">
          {ITEMS.map((it) => {
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

        <div className={cn("mt-4 rounded-xl border p-4", c.border, c.bg)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
                Score
              </div>
              <div className={cn("text-3xl font-bold font-data", c.fg)}>
                {score}
                <span className="text-sm text-muted-foreground">/10</span>
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
              onConfirm({ score, verdict, items });
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