import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

export type SetupStatusRow = {
  id: string;
  user_id: string;
  setup_type: string;
  state: "active" | "paused" | "probation";
  paused_at: string | null;
  root_causes: string[];
  recovery_plan: string | null;
  snooze_until_trade_count: number | null;
  trade_count_at_change: number | null;
  probation_started_at: string | null;
  probation_trades_at_start: number | null;
  reactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

export function useSetupStatuses() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SetupStatusRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from("setup_status")
        .select("*")
        .eq("user_id", user.id);
      if (e) throw e;
      setRows((data ?? []) as SetupStatusRow[]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, loaded, error, reload };
}

export function statusFor(rows: SetupStatusRow[], tag: string): SetupStatusRow | undefined {
  return rows.find((r) => r.setup_type === tag);
}