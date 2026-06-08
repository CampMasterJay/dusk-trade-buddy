import { useCountUp } from "@/hooks/useCountUp";
import { useTradingMode, toggleTradingMode } from "@/lib/tradingMode";
import { useOtherModeSignals } from "@/lib/otherModeSignals";
import { useDemoMode } from "@/lib/demoMode";
import { toast } from "sonner";

export interface AppHeaderProps {
  balance: number;
}

export function AppHeader({ balance }: AppHeaderProps) {
  const animated = useCountUp(balance, 280);
  const formattedBalance = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(animated);
  const [mode] = useTradingMode();
  const other = useOtherModeSignals();
  const demo = useDemoMode();
  const isOptions = mode === "options";
  const accent = isOptions ? "text-trade-amber" : "text-trade-green";
  const badgeBorder = isOptions
    ? "border-trade-amber/30 bg-trade-amber/10 text-trade-amber"
    : "border-trade-green/30 bg-trade-green/10 text-trade-green";
  const dotColor = isOptions ? "bg-trade-amber" : "bg-trade-green";
  const otherDotColor = isOptions ? "bg-trade-green" : "bg-trade-amber";
  const otherModeLabel = isOptions ? "Futures" : "Options";

  const onToggle = () => {
    const next = toggleTradingMode();
    toast.success(
      next === "options" ? "Switched to Options mode" : "Switched to Futures mode",
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4">
        {/* App Name — click to toggle Futures / Options mode */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Switch trading mode (currently ${mode}${other.hasSignal ? `, ${other.label} in ${otherModeLabel}` : ""})`}
          title={other.hasSignal ? `${other.label} — tap to switch to ${otherModeLabel}` : `Switch to ${otherModeLabel}`}
          className={`group relative flex items-baseline gap-2 text-sm font-bold font-data uppercase tracking-[4px] ${accent} transition hover:opacity-80`}
        >
          EDGE TRADER
          <span
            className={`relative text-[9px] tracking-[2px] rounded px-1.5 py-0.5 border ${badgeBorder}`}
          >
            {isOptions ? "OPTIONS" : "FUTURES"}
            {other.hasSignal && (
              <span
                aria-hidden
                className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ${otherDotColor} ring-2 ring-background animate-pulse`}
              />
            )}
          </span>
        </button>

        {demo && (
          <span className="hidden sm:inline-flex items-center rounded border border-trade-amber/40 bg-trade-amber/10 px-1.5 py-0.5 text-[9px] font-bold tracking-[2px] text-trade-amber">
            DEMO
          </span>
        )}

        {/* Balance Badge */}
        <div
          className={`mode-accent-ring flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-data ${badgeBorder}`}
        >
          <span className={`h-2 w-2 rounded-full ${dotColor} animate-pulse`} />
          {formattedBalance}
        </div>
      </div>
    </header>
  );
}
