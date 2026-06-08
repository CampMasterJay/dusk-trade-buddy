import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { isDemoMode, DEMO_SETTINGS } from "@/lib/demoMode";
import { toast } from "sonner";
import {
  calculateCurrentBalance,
  getUserSettings,
  updateUserSettings,
  type UserSettings,
  type UserSettingsUpdate,
} from "@/lib/userSettingsService";

export function useUserSettings() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setSettings(null);
      setLoading(false);
      return;
    }
    if (isDemoMode()) {
      setSettings(DEMO_SETTINGS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getUserSettings(userId);
      setSettings(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const recalcBalance = useCallback(async () => {
    if (!userId) return;
    if (isDemoMode()) return;
    try {
      const balance = await calculateCurrentBalance(userId);
      setSettings((prev) =>
        prev ? { ...prev, current_balance: balance } : prev,
      );
    } catch (err) {
      setError(err as Error);
    }
  }, [userId]);

  const updateSettings = useCallback(
    async (updates: UserSettingsUpdate) => {
      if (!userId) throw new Error("Not authenticated");
      if (isDemoMode()) {
        const merged = { ...(DEMO_SETTINGS as UserSettings), ...updates } as UserSettings;
        setSettings(merged);
        toast.message("Demo mode", { description: "Changes aren't saved." });
        return merged;
      }
      try {
        const updated = await updateUserSettings(userId, updates);
        setSettings(updated);
        return updated;
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [userId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Recalculate balance whenever trades change for this user.
  useEffect(() => {
    if (!userId) return;
    if (isDemoMode()) return;
    const channelName = `trades-balance-${userId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trades",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          recalcBalance();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, recalcBalance]);

  return {
    settings,
    updateSettings,
    loading,
    error,
    refresh: load,
    recalcBalance,
  };
}