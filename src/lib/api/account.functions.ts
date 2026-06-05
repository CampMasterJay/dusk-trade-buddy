import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Best-effort: wipe user-owned rows. RLS-protected tables will cascade via auth deletion,
    // but we explicitly clear known tables first to avoid orphans.
    const tables = [
      "trades",
      "trade_journals",
      "chart_analyses",
      "watch_setups",
      "daily_game_plans",
      "user_settings",
    ] as const;
    for (const t of tables) {
      await supabaseAdmin.from(t).delete().eq("user_id", userId);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });