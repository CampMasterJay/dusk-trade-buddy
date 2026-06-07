import { useEffect, useState } from "react";
import { AlertTriangle, X, Clock, ShieldAlert, Flame, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { getTrades, type Trade } from "@/lib/tradeService";
import {
  computeBehaviorAlerts,
  getBehaviorAlertSettings,
  logBehaviorAlertAction,
  setBreakUntil,
  subscribeBehaviorAlertSettings,
  type BehaviorAlert,
  type BehaviorAlertSettings,
} from "@/lib/behaviorAlerts";
import { cn } from "@/lib/utils";

const ICONS = {
  tilt: ShieldAlert,
  overtrading: Flame,
  streak: Zap,
  time: Clock,
} as const;

interface Props {
  /** Render the banner stack only when this surface is active. */
  active?: boolean;
  className?: string;
}

/**
 * Real-time behavioral alert banners for active trading surfaces
 * (chart analyzer + new trade form). Loads the user's recent trades and
 * displays one dismissible banner per applicable alert.
 */
export function BehaviorAlertOverlay({ active = true, className }: Props) {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [settings, setSettings] = useState<BehaviorAlertSettings>(
    getBehaviorAlertSettings(),
  );
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => subscribeBehaviorAlertSettings(setSettings), []);

  useEffect(() => {
    if (!active || !user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await getTrades(user.id, 200);
      if (!cancelled && data) setTrades(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user]);

  // Reset dismissed set whenever the surface becomes active again, so
  // alerts resurface on a new chart-analyzer / new-trade open.
  useEffect(() => {
    if (active) setDismissed(new Set());
  }, [active]);

  if (!active) return null;

  const alerts = computeBehaviorAlerts(trades, settings).filter(
    (a) => !dismissed.has(a.id),
  );
  if (alerts.length === 0) return null;

  const handleBreak = (a: BehaviorAlert) => {
    const until = Date.now() + 30 * 60 * 1000;
    setBreakUntil(until);
    logBehaviorAlertAction(a.type, "break");
    setDismissed((s) => new Set(s).add(a.id));
    toast.success("30-minute break started. Come back fresh.");
  };

  const handleOverride = (a: BehaviorAlert) => {
    logBehaviorAlertAction(a.type, "override");
    setDismissed((s) => new Set(s).add(a.id));
  };

  const handleDismiss = (a: BehaviorAlert) => {
    logBehaviorAlertAction(a.type, "dismiss");
    setDismissed((s) => new Set(s).add(a.id));
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {alerts.map((a) => {
        const Icon = ICONS[a.type] ?? AlertTriangle;
        const isRed = a.severity === "red";
        return (
          <div
            key={a.id}
            role="alert"
            className={cn(
              "relative rounded-lg border p-3 pr-9 text-sm shadow-sm",
              isRed
                ? "border-trade-red/50 bg-trade-red/10 text-trade-red"
                : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
            )}
          >
            <button
              type="button"
              onClick={() => handleDismiss(a)}
              aria-label="Dismiss"
              className="absolute right-2 top-2 rounded p-1 opacity-70 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-data text-[10px] font-semibold uppercase tracking-wider">
                  {a.title}
                </div>
                <div className="mt-1 text-xs leading-snug text-foreground/90">
                  {a.message}
                </div>
                {a.type === "tilt" && a.showBreakButton && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleBreak(a)}
                      className="rounded-md bg-trade-red px-3 py-1.5 text-[11px] font-data font-semibold uppercase tracking-wider text-background hover:bg-trade-red/90"
                    >
                      Take Break
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOverride(a)}
                      className="rounded-md border border-trade-red/40 px-3 py-1.5 text-[11px] font-data font-semibold uppercase tracking-wider hover:bg-trade-red/10"
                    >
                      Trade Anyway
                    </button>
                  </div>
                )}
                {a.type !== "tilt" && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => handleOverride(a)}
                      className="rounded-md border border-current/40 px-3 py-1 text-[11px] font-data font-semibold uppercase tracking-wider opacity-90 hover:opacity-100"
                    >
                      Acknowledge & Continue
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}