import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useDemoMode } from "@/lib/demoMode";
import { useWalkthrough } from "./WalkthroughProvider";
import { Compass } from "lucide-react";

const OFFER_KEY = "edgetrader:demoWalkthroughOffer";

export function DemoWalkthroughOffer() {
  const demo = useDemoMode();
  const { start } = useWalkthrough();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!demo) return;
    if (pathname !== "/") return;

    let cancelled = false;

    const shouldOffer = (() => {
      try {
        return sessionStorage.getItem(OFFER_KEY) === "1";
      } catch {
        return false;
      }
    })();

    if (!shouldOffer) return;

    // Small delay so the dashboard is fully painted before the toast appears.
    const t = window.setTimeout(() => {
      if (cancelled) return;

      toast.custom(
        (tId: string | number) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Compass className="h-4 w-4 text-primary" />
              Welcome to EdgeTrader
            </div>
            <p className="text-xs text-muted-foreground">
              You&apos;re in demo mode. Take a quick guided tour to see everything this app can do.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  try {
                    sessionStorage.removeItem(OFFER_KEY);
                  } catch {
                    /* ignore */
                  }
                  toast.dismiss(tId);
                }}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  try {
                    sessionStorage.removeItem(OFFER_KEY);
                  } catch {
                    /* ignore */
                  }
                  toast.dismiss(tId);
                  start("app-overview");
                }}
                className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Start Tour
              </button>
            </div>
          </div>
        ),
        { duration: Infinity, position: "top-center" }
      );
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [demo, pathname, start]);

  return null;
}

