import { useEffect, useState } from "react";
import { Trophy, Lock, Flame, Calendar, Shield as ShieldIcon, TrendingUp } from "lucide-react";
import {
  EMPTY_STREAKS,
  refreshAchievements,
  type AchievementsSnapshot,
} from "@/lib/achievements";
import { cn } from "@/lib/utils";

export function AchievementsSection() {
  const [snap, setSnap] = useState<AchievementsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      refreshAchievements()
        .then((s) => {
          if (!cancelled) setSnap(s);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    run();
    const onCheck = () => run();
    window.addEventListener("edge:achievements-check", onCheck);
    return () => {
      cancelled = true;
      window.removeEventListener("edge:achievements-check", onCheck);
    };
  }, []);

  const streaks = snap?.streaks ?? EMPTY_STREAKS;
  const statuses = snap?.statuses ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary"><Trophy className="size-5" /></span>
        <h2 className="text-lg font-semibold font-heading">Achievements & Streaks</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {snap
          ? `${snap.unlockedCount} of ${snap.totalCount} unlocked`
          : "Tracking your progress."}
      </p>

      {/* Streaks */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <StreakTile
          icon={<Flame className="size-4" />}
          label="Current win streak"
          value={streaks.currentWinStreak}
          tone="green"
        />
        <StreakTile
          icon={<TrendingUp className="size-4" />}
          label="Longest win streak"
          value={streaks.longestWinStreak}
          tone="green"
        />
        <StreakTile
          icon={<Calendar className="size-4" />}
          label="Days traded"
          value={streaks.daysTradedStreak}
          tone="neutral"
          suffix="d"
        />
        <StreakTile
          icon={<ShieldIcon className="size-4" />}
          label="Discipline streak"
          value={streaks.disciplineStreak}
          tone="primary"
          suffix="d"
        />
      </div>

      {/* Gallery */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-muted/20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {statuses.map(({ achievement, unlocked, unlockedAt }) => {
            const Icon = achievement.icon;
            return (
              <div
                key={achievement.key}
                className={cn(
                  "relative rounded-lg border p-3 text-center transition-colors",
                  unlocked
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-background/40",
                )}
                title={unlocked ? achievement.description : achievement.hint}
              >
                <div
                  className={cn(
                    "mx-auto mb-2 flex size-10 items-center justify-center rounded-full",
                    unlocked
                      ? "bg-primary/15 text-primary"
                      : "bg-muted/30 text-muted-foreground/40",
                  )}
                >
                  {unlocked ? <Icon className="size-5" /> : <Lock className="size-4" />}
                </div>
                <div
                  className={cn(
                    "text-xs font-semibold leading-tight",
                    unlocked ? "text-foreground" : "text-muted-foreground/60",
                  )}
                >
                  {unlocked ? achievement.title : "Locked"}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-[10px] leading-tight",
                    unlocked ? "text-muted-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {unlocked ? achievement.description : achievement.hint}
                </div>
                {unlocked && unlockedAt && (
                  <div className="mt-1 text-[10px] font-data text-primary/80">
                    {new Date(unlockedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StreakTile({
  icon,
  label,
  value,
  tone,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "green" | "primary" | "neutral";
  suffix?: string;
}) {
  const colorClass =
    tone === "green"
      ? "text-trade-green"
      : tone === "primary"
        ? "text-primary"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("font-data text-2xl font-bold", colorClass)}>
        {value}
        {suffix && <span className="ml-0.5 text-sm font-medium opacity-70">{suffix}</span>}
      </div>
    </div>
  );
}