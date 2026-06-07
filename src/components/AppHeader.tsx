import { useCountUp } from "@/hooks/useCountUp";
import { useTradingMode, toggleTradingMode } from "@/lib/tradingMode";
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
  const isOptions = mode === "options";
  const accent = isOptions ? "text-trade-amber" : "text-trade-green";
  const badgeBorder = isOptions
    ? "border-trade-amber/30 bg-trade-amber/10 text-trade-amber"
    : "border-trade-green/30 bg-trade-green/10 text-trade-green";
  const dotColor = isOptions ? "bg-trade-amber" : "bg-trade-green";

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
          aria-label={`Switch trading mode (currently ${mode})`}
          className={`group flex items-baseline gap-2 text-sm font-bold font-data uppercase tracking-[4px] ${accent} transition hover:opacity-80`}
        >
          EDGE TRADER
          <span
            className={`text-[9px] tracking-[2px] rounded px-1.5 py-0.5 border ${badgeBorder}`}
          >
            {isOptions ? "OPTIONS" : "FUTURES"}
          </span>
        </button>

        {/* Balance Badge */}
        <div
          className={`balance-glow flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-data ${badgeBorder}`}
        >
          <span className={`h-2 w-2 rounded-full ${dotColor} animate-pulse`} />
          {formattedBalance}
        </div>
      </div>
    </header>
  );
}
