import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";
import { useDemoMode, exitDemoMode } from "@/lib/demoMode";

const HIDDEN_ON = new Set(["/login", "/signup", "/forgot-password", "/reset-password", "/onboarding"]);

export function DemoBanner() {
  const demo = useDemoMode();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!demo) return null;
  if (HIDDEN_ON.has(pathname)) return null;

  const onExit = () => {
    exitDemoMode();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-trade-amber/30 bg-trade-amber/10 px-3 py-1.5 text-[11px] font-data text-trade-amber">
      <div className="flex items-center gap-1.5 truncate">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          <strong className="font-bold tracking-wide">DEMO MODE</strong> — nothing is saved.
        </span>
      </div>
      <button
        type="button"
        onClick={onExit}
        className="flex items-center gap-1 rounded border border-trade-amber/40 px-2 py-0.5 text-trade-amber transition hover:bg-trade-amber/20"
      >
        Exit <X className="h-3 w-3" />
      </button>
    </div>
  );
}