import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

/**
 * Reads the user's `vix` value from today's daily_game_plan (America/Chicago day).
 */
export function useTodayVix(): { vix: number | null; loading: boolean } {
  const { user } = useAuth();
  const [vix, setVix] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setVix(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ctToday = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Chicago",
    });
    (async () => {
      const { data } = await supabase
        .from("daily_game_plans")
        .select("vix")
        .eq("user_id", user.id)
        .eq("plan_date", ctToday)
        .maybeSingle();
      if (cancelled) return;
      const v =
        data && data.vix != null && Number.isFinite(Number(data.vix))
          ? Number(data.vix)
          : null;
      setVix(v);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { vix, loading };
}