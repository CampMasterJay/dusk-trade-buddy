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
  behavioral_patterns: string;
  regime_performance: string;
  setup_health_update: string;
  vix_impact: string;
  prop_firm_progress: string;
  tier_progress: string;
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
    const [tradesRes, journalsRes, plansRes, allTradesRes, setupStatusRes, propRes, tiersRes, settingsRes] = await Promise.all([
      supabase
        .from("trades")
        .select(
          "date,instrument,direction,result,r_multiple,pnl,setup_tag,notes,news_id,checklist_score,checklist_verdict,hour_of_day,market_regime,vix_at_entry,consecutive_wins_before,consecutive_losses_before,was_revenge_trade,playbook_score",
        )
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
      supabase
        .from("trades")
        .select("market_regime,result,setup_tag")
        .eq("user_id", userId)
        .is("deleted_at", null),
      supabase
        .from("setup_status")
        .select("setup_type,state,paused_at,updated_at,root_causes")
        .eq("user_id", userId)
        .gte("updated_at", `${weekStart}T00:00:00Z`)
        .lte("updated_at", `${weekEnd}T23:59:59Z`),
      supabase
        .from("prop_firm_accounts")
        .select("*, prop_firms(firm_name,account_size,profit_target_amount,profit_target_pct,max_daily_loss_amount,max_drawdown_amount)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("status", "In Challenge")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("scaling_tiers")
        .select("*")
        .eq("user_id", userId)
        .order("tier_number", { ascending: true }),
      supabase
        .from("user_settings")
        .select("current_balance,starting_balance,risk_pct,vix_adjustment_enabled,baseline_vix")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const trades = tradesRes.data ?? [];
    const journals = journalsRes.data ?? [];
    const plans = plansRes.data ?? [];
    const allTrades = allTradesRes.data ?? [];
    const setupStatusChanges = setupStatusRes.data ?? [];
    const prop = propRes.data ?? null;
    const tiers = tiersRes.data ?? [];
    const userSettings = settingsRes.data ?? null;

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

    // ---------------- Phase 9 aggregates ----------------

    // Behavioral patterns
    const tiltCandidates = trades.filter(
      (t) => (t.consecutive_losses_before ?? 0) >= 2 || t.was_revenge_trade,
    );
    const tiltCount = tiltCandidates.length;
    const tiltLosses = tiltCandidates.filter((t) => t.result === "Loss").length;

    const hourBuckets: Record<number, { count: number; wins: number; pnl: number }> = {};
    for (const t of trades) {
      const h = t.hour_of_day;
      if (h == null) continue;
      const b = hourBuckets[h] ?? { count: 0, wins: 0, pnl: 0 };
      b.count++;
      if (t.result === "Win") b.wins++;
      b.pnl += Number(t.pnl ?? 0);
      hourBuckets[h] = b;
    }
    const worstHour = Object.entries(hourBuckets)
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => a[1].pnl - b[1].pnl)[0];

    const overtradeAfterWin = trades.filter((t) => (t.consecutive_wins_before ?? 0) >= 2).length;

    // Regime performance (week vs all-time)
    const regimeWeek: Record<string, { count: number; wins: number; pnl: number }> = {};
    for (const t of trades) {
      const r = t.market_regime ?? "Unspecified";
      const b = regimeWeek[r] ?? { count: 0, wins: 0, pnl: 0 };
      b.count++;
      if (t.result === "Win") b.wins++;
      b.pnl += Number(t.pnl ?? 0);
      regimeWeek[r] = b;
    }
    const regimeAllTime: Record<string, { count: number; wins: number }> = {};
    for (const t of allTrades) {
      const r = t.market_regime ?? "Unspecified";
      const b = regimeAllTime[r] ?? { count: 0, wins: 0 };
      b.count++;
      if (t.result === "Win") b.wins++;
      regimeAllTime[r] = b;
    }
    const regimeCompare = Object.entries(regimeWeek).map(([regime, w]) => {
      const a = regimeAllTime[regime] ?? { count: 0, wins: 0 };
      return {
        regime,
        week_trades: w.count,
        week_win_rate: w.count ? Math.round((w.wins / w.count) * 100) : 0,
        week_pnl: Number(w.pnl.toFixed(2)),
        all_time_trades: a.count,
        all_time_win_rate: a.count ? Math.round((a.wins / a.count) * 100) : 0,
      };
    });

    // Playbook compliance
    const playbookBuckets: Record<string, number> = {};
    for (const t of trades) {
      const k = t.playbook_score ?? "Unscored";
      playbookBuckets[k] = (playbookBuckets[k] ?? 0) + 1;
    }
    const aPlusCount = playbookBuckets["A+ Match"] ?? 0;
    const compliancePct = trades.length ? Math.round((aPlusCount / trades.length) * 100) : 0;

    // VIX impact
    const vixed = trades.filter((t) => t.vix_at_entry != null);
    const avgVix =
      vixed.length > 0
        ? Number(
            (vixed.reduce((s, t) => s + Number(t.vix_at_entry), 0) / vixed.length).toFixed(2),
          )
        : null;
    const baselineVix = Number(userSettings?.baseline_vix ?? 18);
    const vixAdjustmentEnabled = userSettings?.vix_adjustment_enabled !== false;
    const highVixTrades = vixed.filter((t) => Number(t.vix_at_entry) > baselineVix).length;

    // Prop firm progress
    const propProgress = prop
      ? {
          firm_name: (prop.prop_firms as { firm_name?: string } | null)?.firm_name ?? null,
          account_size: (prop.prop_firms as { account_size?: number } | null)?.account_size ?? null,
          starting_balance: Number(prop.starting_balance),
          current_balance: Number(prop.current_balance),
          pnl_total: Number(prop.current_balance) - Number(prop.starting_balance),
          pnl_this_week: Number(totalPnl.toFixed(2)),
          profit_target: (prop.prop_firms as { profit_target_amount?: number } | null)
            ?.profit_target_amount ?? null,
          challenge_start_date: prop.challenge_start_date,
        }
      : null;

    // Tier progress
    const balance = Number(userSettings?.current_balance ?? 0);
    const currentTier = tiers.find(
      (t) =>
        balance >= Number(t.min_balance) &&
        (t.max_balance == null || balance < Number(t.max_balance)),
    );
    const nextTier = currentTier
      ? tiers.find((t) => t.tier_number === currentTier.tier_number + 1)
      : null;
    const tierProgress = currentTier
      ? {
          current_tier: currentTier.tier_number,
          current_name: currentTier.name,
          current_balance: balance,
          next_tier: nextTier?.tier_number ?? null,
          next_threshold: nextTier ? Number(nextTier.min_balance) : null,
          distance_to_next: nextTier ? Number(nextTier.min_balance) - balance : null,
          weekly_pnl: Number(totalPnl.toFixed(2)),
        }
      : null;

    const phase9Stats = {
      behavioral: {
        tilt_trade_count: tiltCount,
        tilt_loss_count: tiltLosses,
        worst_hour: worstHour
          ? {
              hour: Number(worstHour[0]),
              trades: worstHour[1].count,
              win_rate: worstHour[1].count
                ? Math.round((worstHour[1].wins / worstHour[1].count) * 100)
                : 0,
              pnl: Number(worstHour[1].pnl.toFixed(2)),
            }
          : null,
        trades_after_win_streak: overtradeAfterWin,
      },
      regime_compare: regimeCompare,
      setup_status_changes: setupStatusChanges,
      playbook_compliance: {
        compliance_pct: compliancePct,
        breakdown: playbookBuckets,
      },
      vix: {
        avg_vix: avgVix,
        baseline_vix: baselineVix,
        adjustment_enabled: vixAdjustmentEnabled,
        high_vix_trade_count: highVixTrades,
      },
      prop: propProgress,
      tier: tierProgress,
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

PHASE 9 INTELLIGENCE: ${JSON.stringify(phase9Stats)}

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
  "position_sizing_recommendation": "Adjusted position-sizing advice based on current win rate (${winRate}%) and recent R distribution",
  "behavioral_patterns": "From PHASE 9 behavioral data: most common tilt trigger (cite tilt_trade_count + tilt_loss_count), worst hour of the week with its win rate, and whether the user overtraded after wins (trades_after_win_streak). Reference numbers. 3-4 sentences.",
  "regime_performance": "From regime_compare: list regimes traded this week, week win rate vs all-time win rate per regime, and call out where the user is improving vs slipping. 3-5 sentences. If empty/Unspecified, say no regime tagging.",
  "setup_health_update": "From setup_status_changes: any setups that entered Softening / Degrading / Paused this week (cite setup_type + state). Then state playbook compliance: ${compliancePct}% A+ matches this week. 2-4 sentences.",
  "vix_impact": "From vix: average VIX this week, whether VIX adjustment is enabled, how many trades were above baseline VIX (${baselineVix}), and what that meant for sizing. 2-4 sentences. If no VIX data, say so plainly.",
  "prop_firm_progress": "From prop: if no active prop challenge, return 'No active prop firm challenge.' Otherwise summarize firm name + account size, weekly P&L vs total challenge P&L, distance to profit target, and whether the user is on track / ahead / behind. 3-4 sentences.",
  "tier_progress": "From tier: current tier number + name, current balance, distance to next tier, and an estimated number of weeks to next tier based on weekly_pnl (if positive). If at top tier, say so. 2-3 sentences."
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