import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import {
  calculateCurrentBalance,
  getUserSettings,
  updateUserSettings,
  type UserSettings,
  type UserSettingsUpdate,
} from "@/lib/userSettingsService";
import { isDemoMode, getDemoSettings, useDemoMode } from "@/lib/demoMode";

export function useUserSettings() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const demo = useDemoMode();

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (isDemoMode()) {
      setSettings(getDemoSettings());
      setLoading(false);
      return;
    }
    if (!userId) {
      setSettings(null);
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
  }, [userId, demo]);

  const recalcBalance = useCallback(async () => {
    if (isDemoMode()) return;
    if (!userId) return;
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
      if (isDemoMode()) {
        setSettings((prev) => (prev ? { ...prev, ...updates } as UserSettings : prev));
        return (settings ?? getDemoSettings());
      }
      if (!userId) throw new Error("Not authenticated");
      try {
        const updated = await updateUserSettings(userId, updates);
        setSettings(updated);
        return updated;
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [userId, settings],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Recalculate balance whenever trades change for this user.
  useEffect(() => {
    if (isDemoMode()) return;
    if (!userId) return;
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