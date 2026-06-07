import { createServerFn } from "@tanstack/react-start";

/**
 * Ask Lovable AI to generate a concrete recovery checklist for a failing setup,
 * based on the user-identified root causes.
 */
export const generateRecoveryPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const v = input as { setupName?: unknown; rootCauses?: unknown; allTimeWinRate?: unknown; recentWinRate?: unknown };
    return {
      setupName: typeof v.setupName === "string" ? v.setupName : "Setup",
      rootCauses: Array.isArray(v.rootCauses) ? v.rootCauses.filter((x): x is string => typeof x === "string") : [],
      allTimeWinRate: typeof v.allTimeWinRate === "number" ? v.allTimeWinRate : 0,
      recentWinRate: typeof v.recentWinRate === "number" ? v.recentWinRate : 0,
    };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI is not configured on the server." };
    }
    if (data.rootCauses.length === 0) {
      return { ok: false as const, error: "Select at least one root cause first." };
    }

    const system =
      "You are a disciplined day-trading coach. Given a setup's recent degradation " +
      "and the trader's self-identified root causes, generate a SHORT recovery plan: " +
      "3-5 concrete rule additions the trader must check off for the next 10 trades " +
      "of this setup. Keep each rule under 22 words, specific and measurable. " +
      "Respond in plain text as a numbered list (1. 2. 3.) followed by one " +
      "short paragraph (max 2 sentences) explaining the focus. No markdown headers.";

    const user =
      `Setup: ${data.setupName}\n` +
      `All-time win rate: ${(data.allTimeWinRate * 100).toFixed(0)}%\n` +
      `Recent (last 20) win rate: ${(data.recentWinRate * 100).toFixed(0)}%\n` +
      `Root causes the trader identified:\n- ${data.rootCauses.join("\n- ")}\n\n` +
      `Write the recovery checklist for the next 10 trades of this setup.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429) return { ok: false as const, error: "Rate-limited. Try again shortly." };
        if (res.status === 402) return { ok: false as const, error: "AI credits exhausted." };
        return { ok: false as const, error: `Failed (${res.status}). ${txt.slice(0, 160)}` };
      }

      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const plan = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!plan) return { ok: false as const, error: "Empty plan from AI." };
      return { ok: true as const, plan };
    } catch (err) {
      return { ok: false as const, error: `Error: ${err instanceof Error ? err.message : "unknown"}` };
    }
  });