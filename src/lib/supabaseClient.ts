/**
 * Re-export of the single canonical Supabase client.
 *
 * Previously this file created its OWN Supabase client with the same
 * storage key as `@/integrations/supabase/client`, which triggered the
 * "Multiple GoTrueClient instances detected" warning and risked
 * divergent auth state. We now re-export the auto-generated client so
 * all callers share one instance.
 */
import { supabase } from "@/integrations/supabase/client";

export { supabase };

/**
 * Lightweight connection health check.
 * Resolves with true if the Supabase API is reachable, false otherwise.
 */
export async function checkSupabaseHealth(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      console.error("[EdgeTrader Supabase] Health check failed:", error.message);
      return false;
    }
    console.log("[EdgeTrader Supabase] Health check passed");
    return true;
  } catch (err) {
    console.error(
      "[EdgeTrader Supabase] Health check error:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}
