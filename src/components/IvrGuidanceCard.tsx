import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ivrGuidance, strategyFitForIvr } from "@/lib/ivrGuidance";

interface Props {
  ivr: number | null;
  currentStrategy?: string | null;
  className?: string;
}

export function IvrGuidanceCard({ ivr, currentStrategy, className }: Props) {
  if (ivr == null || !Number.isFinite(ivr)) return null;

  const g = ivrGuidance(ivr);
  const tone =
    g.bucket === "high"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
      : g.bucket === "low"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
        : "border-border bg-muted/30 text-muted-foreground";

  const Icon =
    g.bucket === "high" ? TrendingUp : g.bucket === "low" ? TrendingDown : Minus;

  const fit = currentStrategy ? strategyFitForIvr(currentStrategy, ivr) : null;
  const mismatch = fit !== null && fit < 0.3;

  return (
    <div className={cn("rounded-md border p-3 text-xs space-y-2", tone, className)}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <div className="font-semibold tracking-wide">
          IVR {ivr.toFixed(0)} · {g.headline}
        </div>
      </div>
      <p className="opacity-90">{g.detail}</p>
      <div className="flex flex-wrap gap-1">
        {g.preferred.map((s) => (
          <span
            key={s}
            className="px-1.5 py-0.5 rounded border border-current/30 text-[10px] font-mono"
          >
            {s}
          </span>
        ))}
      </div>
      {mismatch && currentStrategy && (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 text-rose-300 p-2 font-medium">
          ⚠ {currentStrategy} fights this IV regime. Consider a{" "}
          {g.stance === "Seller" ? "credit" : "debit"} strategy.
        </div>
      )}
    </div>
  );
}