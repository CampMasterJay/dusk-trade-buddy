import { useMemo } from "react";
import { Activity } from "lucide-react";
import type { Trade } from "@/lib/tradeService";
import { rollingStats } from "@/lib/rollingStats";
import { useAuth } from "@/components/AuthProvider";
import { fetchOptionsRolling, type OptionsRollingStats } from "@/lib/optionsRolling";
import { cn } from "@/lib/utils";
import { useAsyncData } from "@/hooks/useAsyncData";
import { StatsTileSkeleton } from "@/components/ui/SkeletonVariants";
import { ErrorCard } from "@/components/ui/ErrorCard";

/**
 * Side-by-side rolling win-rate for Futures vs Options.
 * Pulls options data directly; futures derives from the trades prop.
 */
export function OptionsRollingPerformance({ trades }: { trades: Trade[] }) {
  const { user } = useAuth();
  const { data: opt, loading, error, refresh } = useAsyncData<OptionsRollingStats>(
    () => fetchOptionsRolling(user!.id, 20),
    [user?.id],
    { enabled: !!user?.id },
  );

  const futures = useMemo(() => rollingStats(trades, 20), [trades]);

  if (loading) return <StatsTileSkeleton tiles={2} label />;
  if (error) {
    return (
      <ErrorCard
        title="Couldn't load rolling stats"
        message={error.message}
        onRetry={refresh}
      />
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        <Activity className="h-3 w-3" />
        Rolling Win Rate · Last 20
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Cell
          label="Futures"
          sample={futures.sample}
          winRate={futures.winRate}
        />
        <Cell
          label="Options"
          sample={opt?.sample ?? 0}
          winRate={opt?.winRate ?? 0}
        />
      </div>
    </section>
  );
}

function Cell({
  label,
  sample,
  winRate,
}: {
  label: string;
  sample: number;
  winRate: number;
}) {
  const tone =
    sample === 0
      ? "text-muted-foreground"
      : winRate >= 0.5
        ? "text-trade-green"
        : "text-trade-red";
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-data">
        {label}
      </div>
      <div className={cn("font-data text-base font-semibold tabular-nums", tone)}>
        {sample === 0 ? "—" : `${(winRate * 100).toFixed(0)}%`}
      </div>
      <div className="text-[10px] text-muted-foreground/70">n={sample}</div>
    </div>
  );
}