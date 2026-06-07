import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  summary: z.string().min(1).max(6000),
});

/**
 * Generate 1–2 concise insight sentences about how the trader performs
 * across different market regimes. The summary is built client-side from
 * the per-regime stats table.
 */
export const generateRegimeInsight = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        insights: [] as string[],
        error: "AI insight unavailable — server is missing credentials.",
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
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are a concise trading coach analyzing market-regime performance. From the stats provided, return 1-3 short insight cards (max 2 sentences each), each highlighting a clear actionable edge or risk tied to a specific regime and setup. Use the actual numbers. Return ONLY a JSON array of strings, no markdown, no preamble.",
              },
              { role: "user", content: data.summary },
            ],
          }),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429) {
          return { insights: [], error: "AI is rate-limited — try again shortly." };
        }
        if (res.status === 402) {
          return { insights: [], error: "AI credits exhausted." };
        }
        return { insights: [], error: `AI insight failed (${res.status}). ${txt.slice(0, 120)}` };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
      let parsed: unknown = null;
      try {
        // strip code fences if present
        const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback: split into sentences
        const sentences = raw
          .split(/(?<=\.)\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3);
        return { insights: sentences, error: null as string | null };
      }
      const insights = Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 3)
        : [];
      return { insights, error: null as string | null };
    } catch (err) {
      return {
        insights: [],
        error: `AI insight error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });