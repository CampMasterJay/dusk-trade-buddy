import { useEffect, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import {
  loadPerfStats,
  MONTHLY_COST_ALERT_USD,
  COST_PER_1K_TOKENS,
  type PerfStats,
} from "@/lib/perfLog";

function Stat({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "ok" | "warn";
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={
          "mt-1 text-lg font-data font-semibold " +
          (emphasis === "warn"
            ? "text-trade-red"
            : emphasis === "ok"
              ? "text-trade-green"
              : "text-foreground")
        }
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function DebugSection() {
  const [stats, setStats] = useState<PerfStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setStats(await loadPerfStats());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const overBudget = (stats?.estCostUsdMonth ?? 0) > MONTHLY_COST_ALERT_USD;

  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-primary">
            <Activity className="size-5" />
          </span>
          <h2 className="text-lg font-semibold font-heading">Debug</h2>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/30 disabled:opacity-40"
          aria-label="Refresh debug stats"
        >
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          Refresh
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Performance metrics and API usage. Reset on the 1st of each month.
      </p>

      {overBudget && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-trade-red/40 bg-trade-red/10 p-3 text-xs text-trade-red"
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              Monthly AI cost estimate exceeds ${MONTHLY_COST_ALERT_USD}.
            </div>
            <div className="text-trade-red/80 mt-0.5">
              Estimate: ${stats?.estCostUsdMonth.toFixed(2)} from{" "}
              {stats?.totalTokensMonth.toLocaleString()} tokens this month.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Avg AI response"
          value={stats ? `${(stats.avgAiResponseMs / 1000).toFixed(2)}s` : "—"}
          sub="Last 10 AI calls"
        />
        <Stat
          label="API calls (month)"
          value={stats ? stats.totalApiCallsMonth.toLocaleString() : "—"}
          sub={`${stats?.aiCallCountMonth ?? 0} AI · rest news/data`}
        />
        <Stat
          label="Est. cost (month)"
          value={stats ? `$${stats.estCostUsdMonth.toFixed(2)}` : "—"}
          sub={`@ $${COST_PER_1K_TOKENS}/1K tokens`}
          emphasis={overBudget ? "warn" : "ok"}
        />
        <Stat
          label="Tokens (month)"
          value={stats ? stats.totalTokensMonth.toLocaleString() : "—"}
          sub="Sum of prompt + completion"
        />
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Cost is an estimate based on blended Gemini Flash pricing and may differ from actual billing.
      </p>
    </section>
  );
}