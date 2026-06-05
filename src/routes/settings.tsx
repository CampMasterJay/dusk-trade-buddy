import { createFileRoute } from "@tanstack/react-router";
import { LogOut, KeyRound, CheckCircle2, Circle, Lock, Plus } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Settings" },
      { name: "description", content: "Manage your EdgeTrader account and preferences." },
      { property: "og:title", content: "EdgeTrader — Settings" },
      { property: "og:description", content: "Manage your account and preferences." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { user, signOut } = useAuth();

  return (
    <ProtectedRoute>
      <AppHeader balance={12450.0} />
      <div className="p-4 lg:p-6">
        <h1 className="text-2xl font-bold font-heading mb-4">Settings</h1>

          <div className="rounded-xl border border-border bg-card p-6 mb-4">
            <h2 className="text-lg font-semibold font-heading mb-3">Account</h2>
            <div className="flex items-center justify-between py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-data">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">User ID</span>
              <span className="text-sm font-data truncate max-w-[200px]">{user?.id}</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 mb-4">
            <h2 className="text-lg font-semibold font-heading mb-3">Preferences</h2>
            <div className="flex items-center justify-between py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Theme</span>
              <span className="text-sm font-data text-trade-green">Dark (always)</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">Currency</span>
              <span className="text-sm font-data">USD ($)</span>
            </div>
          </div>

          <ApiKeysSection />

          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-trade-red hover:bg-trade-red/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
      </div>
    </ProtectedRoute>
  );
}

// ---------- API Keys & Integrations ----------

type IntegrationStatus = "connected" | "available" | "coming_soon";

type Integration = {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  category: "AI" | "Market Data" | "News" | "Broker" | "Notifications";
};

const INTEGRATIONS: Integration[] = [
  {
    id: "lovable_ai",
    name: "Lovable AI",
    description: "Powers Chart Analyzer, Coach, and Market Context summaries.",
    status: "connected",
    category: "AI",
  },
  {
    id: "alpaca_news",
    name: "Alpaca Markets News",
    description: "Real-time financial news feed for the News tab.",
    status: "available",
    category: "News",
  },
  {
    id: "polygon",
    name: "Polygon.io",
    description: "Equity, options, and futures market data.",
    status: "available",
    category: "Market Data",
  },
  {
    id: "fred",
    name: "FRED (Federal Reserve)",
    description: "Macro indicators: Fed Funds, US10Y, DXY, breadth.",
    status: "available",
    category: "Market Data",
  },
  {
    id: "tradovate",
    name: "Tradovate",
    description: "Auto-import micro futures trades from your broker.",
    status: "coming_soon",
    category: "Broker",
  },
  {
    id: "topstep",
    name: "TopstepX",
    description: "Sync trades and challenge progress automatically.",
    status: "coming_soon",
    category: "Broker",
  },
  {
    id: "discord",
    name: "Discord Webhook",
    description: "Send trade alerts and EOD reports to a channel.",
    status: "coming_soon",
    category: "Notifications",
  },
];

function StatusPill({ status }: { status: IntegrationStatus }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-trade-green/30 bg-trade-green/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-trade-green">
        <CheckCircle2 className="size-3" />
        Connected
      </span>
    );
  }
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-500">
        <Circle className="size-3" />
        Not connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Lock className="size-3" />
      Coming soon
    </span>
  );
}

function ApiKeysSection() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" />
          <h2 className="text-lg font-semibold font-heading">API Keys & Integrations</h2>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Securely store credentials for third-party services. Keys are encrypted server-side and never exposed to the browser.
      </p>

      <div className="space-y-2">
        {INTEGRATIONS.map((it) => (
          <div
            key={it.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-foreground">{it.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.category}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{it.description}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <StatusPill status={it.status} />
              <button
                type="button"
                disabled={it.status === "coming_soon"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  it.status === "coming_soon"
                    ? "border-border/50 text-muted-foreground/60 cursor-not-allowed"
                    : it.status === "connected"
                      ? "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                      : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
                )}
              >
                {it.status === "connected" ? "Manage" : it.status === "available" ? (
                  <>
                    <Plus className="size-3" />
                    Add key
                  </>
                ) : (
                  "Locked"
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center">
        <p className="text-[11px] text-muted-foreground">
          Need another integration? More services will be added here as they're wired up.
        </p>
      </div>
    </div>
  );
}
