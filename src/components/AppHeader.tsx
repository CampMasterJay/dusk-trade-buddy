export interface AppHeaderProps {
  balance: number;
}

export function AppHeader({ balance }: AppHeaderProps) {
  const formattedBalance = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(balance);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4">
        {/* App Name */}
        <span
          className="text-sm font-bold font-data uppercase tracking-[4px] text-trade-green"
        >
          EDGE TRADER
        </span>

        {/* Balance Badge */}
        <div
          className="flex items-center gap-2 rounded-full border border-trade-green/30 bg-trade-green/10 px-3 py-1 text-sm font-data text-trade-green"
          style={{
            boxShadow: "0 0 12px rgba(0, 255, 170, 0.25), 0 0 4px rgba(0, 255, 170, 0.15)",
          }}
        >
          <span className="h-2 w-2 rounded-full bg-trade-green animate-pulse" />
          {formattedBalance}
        </div>
      </div>
    </header>
  );
}
