import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorCardProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorCard({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorCardProps) {
  return (
    <div className="rounded-xl border border-trade-red/40 bg-trade-red/5 p-5 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-trade-red/10">
        <AlertCircle className="h-5 w-5 text-trade-red" />
      </div>
      <h3 className="text-sm font-semibold text-trade-red font-heading">
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-trade-red/30 bg-trade-red/10 px-4 py-2 text-xs font-medium text-trade-red transition-colors hover:bg-trade-red/20"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}
