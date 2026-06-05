import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  summary: z.string().min(1).max(4000),
});

export const generateWeeklyInsight = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        insight:
          "AI insight unavailable — server is missing credentials. Reflect on your trades manually this week.",
      };
    }

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
                  "You are a concise trading coach. Given a weekly trading summary, return ONE sentence (max 28 words) that names the dominant pattern, an emotional trend if relevant, and one actionable nudge. No preamble, no quotes, no emojis.",
              },
              { role: "user", content: data.summary },
            ],
          }),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429) {
          return { insight: "AI is rate-limited right now — try again in a moment." };
        }
        if (res.status === 402) {
          return { insight: "AI credits exhausted. Add credits in workspace settings to enable insights." };
        }
        return { insight: `AI insight failed (${res.status}). ${txt.slice(0, 120)}` };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const insight = json.choices?.[0]?.message?.content?.trim();
      return {
        insight:
          insight && insight.length > 0
            ? insight
            : "Not enough signal this week — log more trades for a sharper read.",
      };
    } catch (err) {
      return {
        insight: `AI insight error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });