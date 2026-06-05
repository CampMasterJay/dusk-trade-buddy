import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, X } from "lucide-react";
import {
  subscribeHighImpactAlert,
  dismissCurrentAlert,
  type HighImpactAlert,
} from "@/lib/highImpactAlerts";
import { cn } from "@/lib/utils";

function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

export function HighImpactBanner() {
  const [alert, setAlert] = useState<HighImpactAlert | null>(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => subscribeHighImpactAlert(setAlert), []);

  // Hide on auth-only screens.
  const hideOn = ["/login", "/signup", "/forgot-password", "/reset-password", "/onboarding"];
  if (!alert || hideOn.includes(pathname)) return null;

  const goToNews = () => {
    if (pathname !== "/news") void navigate({ to: "/news" });
  };

  return (
    <div
      role="alert"
      className={cn(
        "fixed top-0 inset-x-0 z-[60] animate-fade-in",
        "border-b border-destructive/40",
        "bg-destructive text-destructive-foreground shadow-lg",
      )}
    >
      <button
        type="button"
        onClick={goToNews}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive-foreground opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive-foreground" />
        </span>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider opacity-90">
          High Impact News
        </span>
        <span className="truncate text-sm font-medium">
          {truncate(alert.headline)}
        </span>
      </button>
      <button
        type="button"
        aria-label="Dismiss high impact news alert"
        onClick={(e) => {
          e.stopPropagation();
          dismissCurrentAlert();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-destructive-foreground/80 hover:bg-destructive-foreground/15 hover:text-destructive-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}