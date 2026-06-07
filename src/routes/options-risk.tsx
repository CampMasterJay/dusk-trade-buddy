import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Shield } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { OptionsRiskDashboard } from "@/components/OptionsRiskDashboard";

export const Route = createFileRoute("/options-risk")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Options Risk" },
      { name: "description", content: "Portfolio risk, greeks, scenarios, and buying power for your open options positions." },
      { property: "og:title", content: "EdgeTrader — Options Risk" },
      { property: "og:description", content: "Portfolio risk, greeks, scenarios, and buying power for your open options positions." },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-rose-400">Failed to load: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
  component: OptionsRiskRoute,
});

function OptionsRiskRoute() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground uppercase tracking-wider font-data"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Options Risk Dashboard</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Aggregate exposure across your open options positions: portfolio greeks, scenario
            analysis, buying power, and correlation warnings.
          </p>
          <OptionsRiskDashboard />
        </div>
      </div>
    </ProtectedRoute>
  );
}