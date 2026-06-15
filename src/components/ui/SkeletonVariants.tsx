import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** 4-tile stats grid skeleton (matches OptionsWeeklyDebrief, Greeks card). */
export function StatsTileSkeleton({
  tiles = 4,
  label,
  className,
}: {
  tiles?: number;
  label?: string;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-4", className)}
      aria-busy="true"
    >
      {label && (
        <div className="mb-2 flex items-center gap-1.5">
          <Skeleton className="h-3 w-3 rounded" />
          <Skeleton className="h-3 w-32" />
        </div>
      )}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${tiles}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} className="rounded-md border border-border p-2 space-y-1.5">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-2 w-10" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** List of rows skeleton (trades, setups, alerts). */
export function ListRowSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
        >
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Chart card skeleton. */
export function ChartSkeleton({
  height = 160,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-card p-4", className)}
      aria-busy="true"
    >
      <Skeleton className="mb-3 h-3 w-32" />
      <Skeleton className="w-full rounded-md" style={{ height }} />
    </div>
  );
}