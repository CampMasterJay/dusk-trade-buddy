import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BucketSchema = z.object({
  setup: z.string().min(1).max(40),
  trades: z.number().int().min(0),
  winRate: z.number().min(0).max(1),
  avgR: z.number(),
  totalPnl: z.number(),
});

const InputSchema = z.object({
  buckets: z.array(BucketSchema).min(1).max(20),
});

export const generateSetupInsight = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { insight: "AI insight unavailable — missing credentials." };
    }

    const summary = data.buckets
      .map(
        (b) =>
          `${b.setup}: ${b.trades} trades, ${(b.winRate * 100).toFixed(0)}% win, avg ${b.avgR.toFixed(2)}R, P&L $${b.totalPnl.toFixed(2)}`,
      )
      .join("\n");

    try {
      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "You are a concise trading coach. Given per-setup performance stats, return EXACTLY two sentences (no preamble, no quotes, no emojis). Sentence 1: 'Your best setup is [name] with [X]% win rate.' Sentence 2: 'Your worst is [name] — consider skipping it until you review the rules.' Pick best/worst by a blend of win rate, expectancy (avgR), and sample size (ignore setups with fewer than 3 trades when possible).",
              },
              { role: "user", content: summary },
            ],
          }),
        },
      );

      if (!res.ok) {
        if (res.status === 429) {
          return { insight: "AI is rate-limited — try again in a moment." };
        }
        if (res.status === 402) {
          return { insight: "AI credits exhausted. Add credits in workspace settings." };
        }
        const txt = await res.text().catch(() => "");
        return { insight: `AI insight failed (${res.status}). ${txt.slice(0, 120)}` };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const insight = json.choices?.[0]?.message?.content?.trim();
      return {
        insight: insight && insight.length > 0
          ? insight
          : "Not enough signal yet — tag more trades by setup type.",
      };
    } catch (err) {
      return {
        insight: `AI insight error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });