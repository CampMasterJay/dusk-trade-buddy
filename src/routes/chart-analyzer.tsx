import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/chart-analyzer")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Chart Analyzer" },
      { name: "description", content: "Technical chart analysis and pattern recognition for smarter trades." },
      { property: "og:title", content: "EdgeTrader — Chart Analyzer" },
      { property: "og:description", content: "Technical chart analysis and pattern recognition." },
    ],
  }),
  component: ChartAnalyzer,
});

function ChartAnalyzer() {
  return (
    <ProtectedRoute>
      <AppHeader balance={12450.0} />
      <div className="p-4 lg:p-6">
        <h1 className="text-2xl font-bold font-heading mb-4">Chart Analyzer</h1>
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-muted-foreground">
              Chart analysis tools coming soon. Upload or select an asset to analyze patterns, trends, and key levels.
            </p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
