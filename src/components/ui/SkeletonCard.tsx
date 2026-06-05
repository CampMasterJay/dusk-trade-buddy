import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  className?: string;
  rows?: number;
  showHeader?: boolean;
  showFooter?: boolean;
}

function ShimmerBlock({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md bg-gradient-to-r from-muted via-surface to-muted bg-[length:200%_100%]",
        className
      )}
    />
  );
}

export function SkeletonCard({
  className,
  rows = 3,
  showHeader = true,
  showFooter = true,
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 space-y-4",
        className
      )}
    >
      {showHeader && (
        <div className="flex items-center justify-between">
          <ShimmerBlock className="h-4 w-24" />
          <ShimmerBlock className="h-4 w-12" />
        </div>
      )}

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <ShimmerBlock className="h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <ShimmerBlock className="h-3 w-3/4" />
              <ShimmerBlock className="h-2.5 w-1/2" />
            </div>
            <ShimmerBlock className="h-4 w-10" />
          </div>
        ))}
      </div>

      {showFooter && (
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <ShimmerBlock className="h-3 w-16" />
          <ShimmerBlock className="h-3 w-16" />
        </div>
      )}
    </div>
  );
}
