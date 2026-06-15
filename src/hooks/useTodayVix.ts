import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

/**
 * Reads the user's `vix` value from today's daily_game_plan (America/Chicago day).
 */
export function useTodayVix(): {
  vix: number | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
} {
  const { user } = useAuth();
  const [vix, setVix] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!user) {
      setVix(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const ctToday = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Chicago",
    });
    (async () => {
      try {
        const { data, error: e } = await supabase
          .from("daily_game_plans")
          .select("vix")
          .eq("user_id", user.id)
          .eq("plan_date", ctToday)
          .maybeSingle();
        if (cancelled) return;
        if (e) throw e;
        const v =
          data && data.vix != null && Number.isFinite(Number(data.vix))
            ? Number(data.vix)
            : null;
        setVix(v);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, tick]);

  return { vix, loading, error, refresh };
}