import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, Target, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  computeConsistencyStreak,
  getRecentPlans,
  type GamePlan,
} from "@/lib/gamePlanService";
import { cn } from "@/lib/utils";

export function ConsistencyStreak() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [plans, setPlans] = useState<GamePlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    getRecentPlans(userId, 60).then((res) => {
      if (!active) return;
      setPlans(res.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const { current, best } = computeConsistencyStreak(plans);
  const reviewed = plans.filter((p) => p.discipline_score != null);
  const last7 = reviewed.slice(0, 7).reverse();

  return (
    <Link
      to="/game-plan"
      className="block rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">Daily Game Plan</h3>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat
          label="Streak"
          value={current}
          icon={<Flame className={cn("h-3.5 w-3.5", current > 0 ? "text-amber-500" : "text-muted-foreground")} />}
          accent={current > 0 ? "text-trade-green" : "text-foreground"}
        />
        <Stat label="Best" value={best} accent="text-foreground" />
        <Stat label="Reviewed" value={reviewed.length} accent="text-muted-foreground" />
      </div>

      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Last 7 reviewed days
        </div>
        <div className="flex gap-1">
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : last7.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No reviews yet — plan today's session →
            </div>
          ) : (
            last7.map((p) => {
              const s = p.discipline_score ?? 0;
              const color =
                s === 3
                  ? "bg-trade-green"
                  : s === 2
                    ? "bg-amber-500"
                    : s === 1
                      ? "bg-orange-500"
                      : "bg-trade-red";
              return (
                <div
                  key={p.id}
                  title={`${p.plan_date} · ${s}/3`}
                  className={cn("h-6 flex-1 rounded-sm", color)}
                />
              );
            })
          )}
        </div>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-xl font-bold", accent)}>{value}</div>
    </div>
  );
}