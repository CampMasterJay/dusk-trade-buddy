import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  label?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function LoadingSpinner({ label, size = "md" }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <Loader2
        className={`animate-spin text-trade-green ${sizeMap[size]}`}
      />
      {label && (
        <span className="text-sm font-data text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
