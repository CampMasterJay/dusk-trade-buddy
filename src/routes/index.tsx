import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Activity,
  Wallet,
  BarChart3,
  Zap,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Dashboard" },
      { name: "description", content: "Your AI-powered trading dashboard. Real-time market data, portfolio analytics, and intelligent trade signals." },
      { property: "og:title", content: "EdgeTrader — Dashboard" },
      { property: "og:description", content: "Your AI-powered trading dashboard." },
    ],
  }),
  component: Index,
});

const watchlistData = [
  { symbol: "BTC", name: "Bitcoin", price: 67432.15, change: 2.34, volume: "28.4B" },
  { symbol: "ETH", name: "Ethereum", price: 3521.78, change: -1.12, volume: "14.2B" },
  { symbol: "SOL", name: "Solana", price: 142.65, change: 5.67, volume: "3.8B" },
  { symbol: "NVDA", name: "NVIDIA", price: 124.32, change: 3.45, volume: "42.1B" },
  { symbol: "AAPL", name: "Apple", price: 198.54, change: -0.78, volume: "38.9B" },
  { symbol: "TSLA", name: "Tesla", price: 248.87, change: -2.34, volume: "22.5B" },
];

const portfolioData = [
  { asset: "Bitcoin", symbol: "BTC", allocation: 42.3, value: 28452.0, pnl: 3240.5 },
  { asset: "Ethereum", symbol: "ETH", allocation: 28.7, value: 19320.0, pnl: -1250.3 },
  { asset: "Solana", symbol: "SOL", allocation: 15.2, value: 10240.0, pnl: 1870.2 },
  { asset: "NVIDIA", symbol: "NVDA", allocation: 8.5, value: 5720.0, pnl: 890.4 },
  { asset: "Apple", symbol: "AAPL", allocation: 5.3, value: 3568.0, pnl: -234.1 },
];

const signalsData = [
  { symbol: "BTC", action: "BUY", confidence: 87, reason: "Strong support at $66K, RSI oversold" },
  { symbol: "ETH", action: "HOLD", confidence: 62, reason: "Consolidation phase, wait for breakout" },
  { symbol: "SOL", action: "BUY", confidence: 91, reason: "Breakout above $140 resistance" },
  { symbol: "NVDA", action: "SELL", confidence: 74, reason: "Bearish divergence on 4H chart" },
  { symbol: "TSLA", action: "HOLD", confidence: 55, reason: "Mixed signals, low conviction" },
];

function Index() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}

function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const totalPortfolio = portfolioData.reduce((sum, item) => sum + item.value, 0);
  const totalPnl = portfolioData.reduce((sum, item) => sum + item.pnl, 0);
  const pnlPercent = (totalPnl / (totalPortfolio - totalPnl)) * 100;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader balance={totalPortfolio} />

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} fixed left-0 top-14 z-40 h-[calc(100vh-3.5rem)] w-60 border-r border-border bg-card transition-transform lg:static lg:translate-x-0`}
        >
          <nav className="flex flex-col gap-1 p-3">
            <NavItem icon={<Activity className="h-4 w-4" />} label="Dashboard" active />
            <NavItem icon={<BarChart3 className="h-4 w-4" />} label="Markets" />
            <NavItem icon={<Wallet className="h-4 w-4" />} label="Portfolio" />
            <NavItem icon={<TrendingUp className="h-4 w-4" />} label="Signals" />
            <NavItem icon={<Zap className="h-4 w-4" />} label="AI Assistant" />
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-6">
          {/* Portfolio Summary */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Total Portfolio"
              value={`$${totalPortfolio.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              icon={<Wallet className="h-4 w-4 text-trade-blue" />}
            />
            <SummaryCard
              label="24h P&L"
              value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              subValue={`${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%`}
              positive={totalPnl >= 0}
              icon={<TrendingUp className="h-4 w-4 text-trade-green" />}
            />
            <SummaryCard
              label="Open Positions"
              value="12"
              icon={<Activity className="h-4 w-4 text-trade-purple" />}
            />
            <SummaryCard
              label="Active Signals"
              value="5"
              subValue="3 BUY · 2 SELL"
              icon={<Zap className="h-4 w-4 text-trade-amber" />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Watchlist */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold font-heading">Watchlist</h2>
                <span className="text-xs text-muted-foreground">Live</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Asset</th>
                      <th className="pb-2 text-right font-medium">Price</th>
                      <th className="pb-2 text-right font-medium">24h</th>
                      <th className="pb-2 text-right font-medium hidden sm:table-cell">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlistData.map((item) => (
                      <tr key={item.symbol} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold font-data">
                              {item.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-medium font-data">{item.symbol}</div>
                              <div className="text-xs text-muted-foreground">{item.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-right font-data">${item.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                        <td className="py-3 text-right">
                          <span className={`inline-flex items-center gap-0.5 font-data ${item.change >= 0 ? "text-trade-green" : "text-trade-red"}`}>
                            {item.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(item.change).toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-3 text-right font-data text-muted-foreground hidden sm:table-cell">{item.volume}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI Signals */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold font-heading">AI Signals</h2>
                <div className="flex h-2 w-2 rounded-full bg-trade-green animate-pulse" />
              </div>
              <div className="flex flex-col gap-3">
                {signalsData.map((signal) => (
                  <div
                    key={signal.symbol}
                    className="rounded-lg border border-border/50 bg-background/50 p-3 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold font-data text-sm">{signal.symbol}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium font-data ${
                          signal.action === "BUY"
                            ? "bg-trade-green/20 text-trade-green"
                            : signal.action === "SELL"
                            ? "bg-trade-red/20 text-trade-red"
                            : "bg-trade-amber/20 text-trade-amber"
                        }`}
                      >
                        {signal.action}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            signal.confidence >= 80
                              ? "bg-trade-green"
                              : signal.confidence >= 60
                              ? "bg-trade-amber"
                              : "bg-trade-red"
                          }`}
                          style={{ width: `${signal.confidence}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground font-data">{signal.confidence}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{signal.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Portfolio Allocation */}
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold font-heading">Portfolio Allocation</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Asset</th>
                    <th className="pb-2 text-right font-medium">Allocation</th>
                    <th className="pb-2 text-right font-medium">Value</th>
                    <th className="pb-2 text-right font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioData.map((item) => (
                    <tr key={item.symbol} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold font-data">
                            {item.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-medium font-data">{item.asset}</div>
                            <div className="text-xs text-muted-foreground">{item.symbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-right font-data">{item.allocation}%</td>
                      <td className="py-3 text-right font-data">${item.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 text-right">
                        <span className={`font-data ${item.pnl >= 0 ? "text-trade-green" : "text-trade-red"}`}>
                          {item.pnl >= 0 ? "+" : ""}${item.pnl.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex h-3 gap-1 rounded-full overflow-hidden">
              {portfolioData.map((item) => (
                <div
                  key={item.symbol}
                  className="h-full"
                  style={{
                    width: `${item.allocation}%`,
                    backgroundColor:
                      item.symbol === "BTC"
                        ? "var(--trade-green)"
                        : item.symbol === "ETH"
                        ? "var(--trade-blue)"
                        : item.symbol === "SOL"
                        ? "var(--trade-purple)"
                        : item.symbol === "NVDA"
                        ? "var(--trade-amber)"
                        : "var(--trade-red)",
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {portfolioData.map((item) => (
                <div key={item.symbol} className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        item.symbol === "BTC"
                          ? "var(--trade-green)"
                          : item.symbol === "ETH"
                          ? "var(--trade-blue)"
                          : item.symbol === "SOL"
                          ? "var(--trade-purple)"
                          : item.symbol === "NVDA"
                          ? "var(--trade-amber)"
                          : "var(--trade-red)",
                    }}
                  />
                  <span className="text-xs text-muted-foreground font-data">{item.symbol}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  subValue,
  positive,
  icon,
}: {
  label: string;
  value: string;
  subValue?: string;
  positive?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-heading">{label}</span>
        <div className="rounded-md bg-secondary p-1">{icon}</div>
      </div>
      <div className="text-xl font-bold font-data tracking-tight">{value}</div>
      {subValue && (
        <div
          className={`mt-1 text-xs font-medium font-data ${
            positive === undefined
              ? "text-muted-foreground"
              : positive
              ? "text-trade-green"
              : "text-trade-red"
          }`}
        >
          {subValue}
        </div>
      )}
    </div>
  );
}
