import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — News" },
      { name: "description", content: "Latest market news and AI-curated sentiment analysis." },
      { property: "og:title", content: "EdgeTrader — News" },
      { property: "og:description", content: "Latest market news and sentiment analysis." },
    ],
  }),
  component: News,
});

function News() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background text-foreground">
        <div className="p-4 lg:p-6">
          <h1 className="text-2xl font-bold font-heading mb-4">Market News</h1>
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-muted-foreground">
              Curated market news and AI sentiment analysis coming soon. Stay informed on what moves the markets.
            </p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
