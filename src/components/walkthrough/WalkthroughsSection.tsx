import { BookOpen, Play } from "lucide-react";
import { getWalkthroughsForMode } from "@/lib/walkthroughs/catalog";
import { useTradingMode } from "@/lib/tradingMode";
import { useWalkthrough } from "./WalkthroughProvider";

export function WalkthroughsSection() {
  const { start } = useWalkthrough();
  const [mode] = useTradingMode();
  const items = getWalkthroughsForMode(mode);
  const modeLabel = mode === "options" ? "Options" : "Futures";
  const accent = mode === "options" ? "text-trade-amber" : "text-trade-green";
  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary">
          <BookOpen className="size-5" />
        </span>
        <h2 className="text-lg font-semibold font-heading">
          Walkthroughs <span className={`text-xs font-data uppercase tracking-[2px] ${accent}`}>· {modeLabel}</span>
        </h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Tours tailored to {modeLabel} mode plus the shared app overview. Switch modes in the header to see the other set.
      </p>
      <div className="grid gap-2">
        {items.map((w) => {
          const Icon = w.icon;
          const modeChip = w.mode
            ? w.mode === "options"
              ? "border-trade-amber/40 text-trade-amber bg-trade-amber/10"
              : "border-trade-green/40 text-trade-green bg-trade-green/10"
            : "border-border text-muted-foreground bg-background/40";
          const modeChipLabel = w.mode ? (w.mode === "options" ? "OPTIONS" : "FUTURES") : "SHARED";
          return (
            <button
              key={w.id}
              onClick={() => start(w.id)}
              className="group flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-foreground truncate">{w.title}</div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-data tracking-[1.5px] ${modeChip}`}>
                    {modeChipLabel}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{w.description}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-[11px] font-semibold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Play className="h-3 w-3" />
                Start
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}