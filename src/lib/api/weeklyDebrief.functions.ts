import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  force: z.boolean().optional(),
});

type DebriefFields = {
  performance_summary: string;
  top_strength: string;
  top_weakness: string;
  pattern_analysis: string;
  rule_violations: string;
  next_week_focus: string;
  position_sizing_recommendation: string;
};

export const generateWeeklyDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(InputSchema)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { weekStart, weekEnd, force } = data;

    // Return cached debrief unless force regen
    if (!force) {
      const { data: existing } = await supabase
        .from("weekly_debriefs")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (existing) return { debrief: existing, cached: true };
    }

    // Pull source data for the window
    const [tradesRes, journalsRes, plansRes] = await Promise.all([
      supabase
        .from("trades")
        .select("date,instrument,direction,result,r_multiple,pnl,setup_tag,notes,news_id,checklist_score,checklist_verdict")
        .eq("user_id", userId)
        .gte("date", weekStart)
        .lte("date", weekEnd)
        .is("deleted_at", null)
        .order("date", { ascending: true }),
      supabase
        .from("trade_journals")
        .select("trade_id,emotion,pre_thoughts,post_reflection,execution_quality,would_repeat,created_at")
        .eq("user_id", userId)
        .gte("created_at", `${weekStart}T00:00:00Z`)
        .lte("created_at", `${weekEnd}T23:59:59Z`),
      supabase
        .from("daily_game_plans")
        .select("plan_date,bias,max_trades,max_loss,stuck_to_max_trades,stayed_within_loss,traded_planned_setups,discipline_score,notes")
        .eq("user_id", userId)
        .gte("plan_date", weekStart)
        .lte("plan_date", weekEnd),
    ]);

    const trades = tradesRes.data ?? [];
    const journals = journalsRes.data ?? [];
    const plans = plansRes.data ?? [];

    // Aggregate stats
    const wins = trades.filter((t) => t.result === "Win").length;
    const losses = trades.filter((t) => t.result === "Loss").length;
    const totalPnl = trades.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
    const totalR = trades.reduce((s, t) => s + Number(t.r_multiple ?? 0), 0);
    const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0;
    const newsTagged = trades.filter((t) => t.news_id).length;

    const setupBreakdown: Record<string, { count: number; wins: number; r: number }> = {};
    for (const t of trades) {
      const tag = t.setup_tag ?? "Untagged";
      const b = setupBreakdown[tag] ?? { count: 0, wins: 0, r: 0 };
      b.count++;
      if (t.result === "Win") b.wins++;
      b.r += Number(t.r_multiple ?? 0);
      setupBreakdown[tag] = b;
    }

    const planCompliance =
      plans.length > 0
        ? Math.round(
            (plans.filter((p) => p.stuck_to_max_trades && p.stayed_within_loss && p.traded_planned_setups).length /
              plans.length) *
              100,
          )
        : null;

    const sourceStats = {
      total_trades: trades.length,
      wins,
      losses,
      win_rate_pct: winRate,
      total_pnl: Number(totalPnl.toFixed(2)),
      total_r: Number(totalR.toFixed(2)),
      news_tagged: newsTagged,
      plan_count: plans.length,
      plan_compliance_pct: planCompliance,
      setup_breakdown: setupBreakdown,
    };

    if (trades.length === 0) {
      return {
        debrief: null,
        cached: false,
        empty: true,
        message: "No trades logged this week — nothing to debrief.",
      };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { debrief: null, cached: false, error: "AI unavailable: missing credentials." };
    }

    // Build compact context for the model
    const tradeLines = trades.map((t) =>
      `${t.date} ${t.instrument} ${t.direction} ${t.result} R=${t.r_multiple ?? "?"} P&L=${t.pnl ?? "?"} setup=${t.setup_tag ?? "-"}${t.news_id ? " news" : ""}${t.checklist_verdict ? ` chk=${t.checklist_verdict}` : ""}${t.notes ? ` // ${String(t.notes).slice(0, 120)}` : ""}`,
    );
    const journalLines = journals.map((j) =>
      `emotion=${j.emotion ?? "-"} exec=${j.execution_quality ?? "-"} repeat=${j.would_repeat ?? "-"} pre="${String(j.pre_thoughts ?? "").slice(0, 100)}" post="${String(j.post_reflection ?? "").slice(0, 160)}"`,
    );
    const planLines = plans.map((p) =>
      `${p.plan_date} bias=${p.bias} max=${p.max_trades}/${p.max_loss} stuck=${p.stuck_to_max_trades} loss=${p.stayed_within_loss} planned=${p.traded_planned_setups} score=${p.discipline_score ?? "-"}`,
    );

    const userPrompt = `Weekly trading debrief for ${weekStart} → ${weekEnd}.

AGGREGATE: ${JSON.stringify(sourceStats)}

TRADES (${trades.length}):
${tradeLines.join("\n")}

JOURNAL ENTRIES (${journals.length}):
${journalLines.join("\n") || "(none)"}

GAME PLANS (${plans.length}):
${planLines.join("\n") || "(none)"}

Return STRICT JSON with these keys (no markdown, no preamble):
{
  "performance_summary": "3-4 sentences on the week's overall performance, P&L, and tone",
  "top_strength": "What you did well this week — be specific, reference data",
  "top_weakness": "What cost you money — be specific, reference data",
  "pattern_analysis": "Which setups worked vs didn't, with win rates / R if possible",
  "rule_violations": "Rule violations detected from journal notes & plan compliance (or 'No major violations detected.')",
  "next_week_focus": "ONE specific, actionable thing to improve next week",
  "position_sizing_recommendation": "Adjusted position-sizing advice based on current win rate (${winRate}%) and recent R distribution"
}`;

    let aiJson: DebriefFields;
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a brutally honest, data-driven trading coach. You write concise, specific debriefs that reference numbers from the user's data. No fluff, no generic platitudes. Output ONLY valid JSON matching the requested schema.",
            },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429) return { debrief: null, cached: false, error: "AI rate-limited. Try again shortly." };
        if (res.status === 402)
          return { debrief: null, cached: false, error: "AI credits exhausted. Add credits in workspace settings." };
        return { debrief: null, cached: false, error: `AI failed (${res.status}). ${txt.slice(0, 160)}` };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      aiJson = JSON.parse(content) as DebriefFields;
    } catch (err) {
      return { debrief: null, cached: false, error: `AI error: ${err instanceof Error ? err.message : "unknown"}` };
    }

    const row = {
      user_id: userId,
      week_start: weekStart,
      week_end: weekEnd,
      performance_summary: String(aiJson.performance_summary ?? "").slice(0, 2000),
      top_strength: String(aiJson.top_strength ?? "").slice(0, 1000),
      top_weakness: String(aiJson.top_weakness ?? "").slice(0, 1000),
      pattern_analysis: String(aiJson.pattern_analysis ?? "").slice(0, 2000),
      rule_violations: String(aiJson.rule_violations ?? "").slice(0, 1500),
      next_week_focus: String(aiJson.next_week_focus ?? "").slice(0, 800),
      position_sizing_recommendation: String(aiJson.position_sizing_recommendation ?? "").slice(0, 800),
      source_stats: sourceStats,
    };

    const { data: upserted, error: upErr } = await supabase
      .from("weekly_debriefs")
      .upsert(row, { onConflict: "user_id,week_start" })
      .select()
      .single();

    if (upErr) return { debrief: null, cached: false, error: `Save failed: ${upErr.message}` };
    return { debrief: upserted, cached: false };
  });

export const listWeeklyDebriefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("weekly_debriefs")
      .select("*")
      .eq("user_id", userId)
      .order("week_start", { ascending: false });
    if (error) throw error;
    return { debriefs: data ?? [] };
  });