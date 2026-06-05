import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/trade-log")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Trade Log" },
      { name: "description", content: "Track and review your trading history and performance." },
      { property: "og:title", content: "EdgeTrader — Trade Log" },
      { property: "og:description", content: "Track and review your trading history." },
    ],
  }),
  component: TradeLog,
});

function TradeLog() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background text-foreground">
        <div className="p-4 lg:p-6">
          <h1 className="text-2xl font-bold font-heading mb-4">Trade Log</h1>
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-muted-foreground">
              Your trade history will appear here. Log entries, review P&L, and analyze performance over time.
            </p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
