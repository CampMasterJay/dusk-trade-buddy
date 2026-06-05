import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import {
  subscribeHighImpactAlert,
  dismissCurrentAlert,
  type HighImpactAlert,
} from "@/lib/highImpactAlerts";

export function HighImpactAlertCard() {
  const [alert, setAlert] = useState<HighImpactAlert | null>(null);
  useEffect(() => subscribeHighImpactAlert(setAlert), []);

  if (!alert) return null;

  return (
    <div
      role="alert"
      className="relative overflow-hidden rounded-2xl border border-destructive/40 bg-destructive/10 p-4 shadow-sm animate-fade-in"
    >
      <div className="absolute inset-0 -z-0 bg-gradient-to-r from-destructive/15 via-destructive/5 to-transparent" />
      <div className="relative flex items-start gap-3">
        <span className="relative mt-1 flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            High Impact News
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">
            {alert.headline}
          </p>
          <Link
            to="/news"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
          >
            Review in News
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <button
          type="button"
          aria-label="Dismiss alert"
          onClick={dismissCurrentAlert}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}