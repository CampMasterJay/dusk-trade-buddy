import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  lifetime: z.object({
    totalTrades: z.number(),
    winRate: z.number(),
    avgR: z.number(),
    netPnl: z.number(),
    bestSingleR: z.number(),
    longestWinStreak: z.number(),
    daysTraded: z.number(),
  }),
  topRegimes: z.array(z.object({ regime: z.string(), trades: z.number(), winRate: z.number() })).max(6),
  topSetups: z.array(z.object({ setup: z.string(), trades: z.number(), pnl: z.number() })).max(6),
  hourBuckets: z.array(z.object({ hour: z.number(), trades: z.number(), winRate: z.number() })).max(24),
  skillScores: z.record(z.string(), z.number()),
});

export type TraderProfileResponse =
  | { ok: true; profile: string }
  | { ok: false; error: string };

export const generateTraderProfile = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }): Promise<TraderProfileResponse> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not configured." };

    const systemPrompt = `You are a veteran trading coach. Write a SHORT (~120 words) "Trader Profile Summary" in second person ("You are…"). Use the data to identify: trading style (momentum / mean-reversion / breakout / scalper / swing), best market regime, best time-of-day window, biggest strengths, top weakness, and a one-line growth recommendation. Be specific. No fluff, no markdown headers, plain prose with 2-3 short paragraphs.`;

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
            { role: "system", content: systemPrompt },
            { role: "user", content: `Trader data:\n${JSON.stringify(data, null, 2)}` },
          ],
        }),
      });
      if (!res.ok) {
        if (res.status === 429) return { ok: false, error: "AI is rate-limited — try again shortly." };
        if (res.status === 402) return { ok: false, error: "AI credits exhausted. Add credits in workspace settings." };
        const txt = await res.text().catch(() => "");
        return { ok: false, error: `AI request failed (${res.status}). ${txt.slice(0, 160)}` };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) return { ok: false, error: "AI returned no content." };
      return { ok: true, profile: text };
    } catch (err) {
      return { ok: false, error: `AI error: ${err instanceof Error ? err.message : "unknown"}` };
    }
  });