import { useEffect, useRef, useState } from "react";
import { Lock, ShieldAlert, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NewTradeSheet } from "@/components/NewTradeSheet";
import { setLockOverride, isLockOverridden } from "@/lib/drawdown";
import { cn } from "@/lib/utils";

interface Props {
  locked: boolean;
  defaultInstrument: string;
  onLogged: () => void;
  prefill?: React.ComponentProps<typeof NewTradeSheet>["prefill"];
}

const HOLD_MS = 3000;

export function TradeLockGate({ locked, defaultInstrument, onLogged, prefill }: Props) {
  const [overridden, setOverridden] = useState<boolean>(() => isLockOverridden());
  const [sheetOpen, setSheetOpen] = useState(false);

  // Hold-to-confirm state
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  // Re-check override on mount in case day rolled over
  useEffect(() => {
    setOverridden(isLockOverridden());
  }, [locked]);

  const cancelHold = () => {
    setHolding(false);
    setProgress(0);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const tick = () => {
    const elapsed = performance.now() - startRef.current;
    const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
    setProgress(pct);
    if (pct >= 100) {
      cancelHold();
      setConfirmOpen(true);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const startHold = () => {
    if (!locked || overridden) return;
    setHolding(true);
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  };

  // Always render the sheet (controlled), keep trigger=null to host externally
  const sheet = (
    <NewTradeSheet
      trigger={null}
      defaultInstrument={defaultInstrument}
      onLogged={onLogged}
      prefill={prefill}
      open={sheetOpen}
      onOpenChange={setSheetOpen}
    />
  );

  // Not locked, or override already granted today → standard button
  if (!locked || overridden) {
    return (
      <>
        <Button
          size="sm"
          onClick={() => setSheetOpen(true)}
          className="bg-trade-green text-background hover:bg-trade-green/90 font-data uppercase tracking-wider"
        >
          <Plus className="mr-1 h-4 w-4" />
          New Trade
        </Button>
        {sheet}
      </>
    );
  }

  // Locked → hold-to-override button
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        onTouchCancel={cancelHold}
        className={cn(
          "relative overflow-hidden border-trade-red/50 text-trade-red font-data uppercase tracking-wider select-none",
          holding && "bg-trade-red/10",
        )}
      >
        <span
          className="absolute inset-y-0 left-0 bg-trade-red/20 transition-[width] duration-75"
          style={{ width: `${progress}%` }}
          aria-hidden
        />
        <span className="relative z-10 inline-flex items-center">
          <Lock className="mr-1 h-4 w-4" />
          {holding ? `Hold ${Math.ceil(((100 - progress) / 100) * (HOLD_MS / 1000))}s…` : "Locked"}
        </span>
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-trade-red">
              <ShieldAlert className="h-5 w-5" />
              Override daily lock?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your trading rules flagged today as a stop-day. Overriding lets you log
              another trade now, but you're betting against your own plan. Are you
              sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep me locked</AlertDialogCancel>
            <AlertDialogAction
              className="bg-trade-red text-background hover:bg-trade-red/90"
              onClick={() => {
                setLockOverride(true);
                setOverridden(true);
                setConfirmOpen(false);
                toast.warning("Lock overridden for the rest of today. Be careful.");
                setSheetOpen(true);
              }}
            >
              Override anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {sheet}
    </>
  );
}

export function TradeLockBanner({
  level,
  title,
  message,
}: {
  level: "yellow" | "red" | "none";
  title: string | null;
  message: string | null;
}) {
  if (level === "none" || !message) return null;
  return (
    <div
      className={cn(
        "mb-3 flex items-start gap-2 rounded-xl border p-3 text-xs leading-snug",
        level === "red"
          ? "border-trade-red/50 bg-trade-red/10 text-trade-red"
          : "border-trade-amber/50 bg-trade-amber/10 text-trade-amber",
      )}
    >
      {level === "red" ? (
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div>
        {title && (
          <div className="font-data uppercase tracking-wider text-[10px] font-semibold">
            {title}
          </div>
        )}
        <div className="mt-0.5 font-data">
          {level === "red"
            ? "Daily loss limit reached. Resume tomorrow. Hold the New Trade button for 3 seconds to override."
            : message}
        </div>
      </div>
    </div>
  );
}