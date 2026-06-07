// Lightweight signal probe for the "other" trading mode. Used by the header
// toggle to show a small dot when the inactive mode has open positions
// or near-term expirations the user might want to know about.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useTradingMode } from "./tradingMode";

export type OtherModeSignal = {
  hasSignal: boolean;
  count: number;
  label: string;
};

const EMPTY: OtherModeSignal = { hasSignal: false, count: 0, label: "" };

export function useOtherModeSignals(): OtherModeSignal {
  const { user } = useAuth();
  const [mode] = useTradingMode();
  const [signal, setSignal] = useState<OtherModeSignal>(EMPTY);

  useEffect(() => {
    if (!user?.id) {
      setSignal(EMPTY);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (mode === "futures") {
          // Probe options
          const today = new Date().toISOString().slice(0, 10);
          const { count } = await supabase
            .from("options_trades")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("status", "Open")
            .is("deleted_at", null);
          const n = count ?? 0;
          if (!cancelled) {
            setSignal(
              n > 0
                ? { hasSignal: true, count: n, label: `${n} open option${n === 1 ? "" : "s"}` }
                : EMPTY,
            );
          }
          void today;
        } else {
          // Probe futures (today's trades)
          const today = new Date().toISOString().slice(0, 10);
          const { count } = await supabase
            .from("trades")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("date", today)
            .is("deleted_at", null);
          const n = count ?? 0;
          if (!cancelled) {
            setSignal(
              n > 0
                ? { hasSignal: true, count: n, label: `${n} futures trade${n === 1 ? "" : "s"} today` }
                : EMPTY,
            );
          }
        }
      } catch {
        if (!cancelled) setSignal(EMPTY);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, mode]);

  return signal;
}