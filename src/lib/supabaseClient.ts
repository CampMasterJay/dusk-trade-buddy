import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * EdgeTrader typed Supabase client.
 *
 * Reads from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or
 * VITE_SUPABASE_PUBLISHABLE_KEY as fallback) which are injected at build time.
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missing = [
    ...(!SUPABASE_URL ? ["VITE_SUPABASE_URL / SUPABASE_URL"] : []),
    ...(!SUPABASE_ANON_KEY
      ? ["VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY"]
      : []),
  ];
  const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Connect Lovable Cloud.`;
  console.error(`[EdgeTrader Supabase] ${message}`);
  throw new Error(message);
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Lightweight connection health check.
 * Resolves with true if the Supabase API is reachable, false otherwise.
 */
export async function checkSupabaseHealth(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("[EdgeTrader Supabase] Health check failed:", error.message);
      return false;
    }
    console.log(
      "[EdgeTrader Supabase] Health check passed — connected to",
      SUPABASE_URL
    );
    return true;
  } catch (err) {
    console.error(
      "[EdgeTrader Supabase] Health check error:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}
