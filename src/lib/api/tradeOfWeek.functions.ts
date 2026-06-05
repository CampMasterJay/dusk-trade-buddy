import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  weekId: z.string().min(1).max(20),
  context: z.string().min(0).max(4000).optional(),
});

export type TradeOfWeek = {
  instrument: string;
  direction: "Long" | "Short";
  pattern: string;
  thesis: string;
  trigger: string;
  invalidation: string;
  rr: string;
};

const FALLBACK: TradeOfWeek = {
  instrument: "ES",
  direction: "Long",
  pattern: "VWAP Reclaim",
  thesis:
    "Range-bound week with macro data on deck; a clean VWAP reclaim after the data print typically marks the day's directional bias.",
  trigger: "5-min close back above VWAP on rising volume after a flush.",
  invalidation: "Two 5-min closes back below VWAP.",
  rr: "1.5R minimum to first liquidity pool.",
};

export const generateTradeOfWeek = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }): Promise<{ trade: TradeOfWeek; source: "ai" | "fallback"; note?: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { trade: FALLBACK, source: "fallback", note: "AI credentials missing." };
    }

    const systemPrompt =
      "You are a trading-education author. Given the current market context, propose ONE theoretical, educational setup for the week. " +
      "It is NOT trading advice — it is a teaching example. Be specific but concise. " +
      "Return ONLY a single JSON object with these exact keys and string values: " +
      `{"instrument":"e.g. ES, NQ, BTC", "direction":"Long" or "Short", "pattern":"e.g. VWAP Reclaim, Bull Flag", ` +
      `"thesis":"one sentence on why this setup makes sense given context", ` +
      `"trigger":"one sentence on the entry trigger", ` +
      `"invalidation":"one sentence on what would void the idea", ` +
      `"rr":"target risk:reward, e.g. '1.5R to prior high'"}. ` +
      "No prose outside the JSON. No markdown fences.";

    const userPrompt =
      `Week: ${data.weekId}\n` +
      (data.context ? `Market context:\n${data.context}` : "Market context: not provided; use general macro themes.");

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          return { trade: FALLBACK, source: "fallback", note: "AI rate-limited — showing a stock example." };
        }
        if (res.status === 402) {
          return { trade: FALLBACK, source: "fallback", note: "AI credits exhausted — add credits in workspace settings." };
        }
        return { trade: FALLBACK, source: "fallback", note: `AI error ${res.status}.` };
      }

      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
      const jsonStr = extractJson(raw);
      if (!jsonStr) {
        return { trade: FALLBACK, source: "fallback", note: "AI returned no parseable JSON." };
      }
      const parsed = JSON.parse(jsonStr) as Partial<TradeOfWeek>;
      const trade: TradeOfWeek = {
        instrument: String(parsed.instrument ?? FALLBACK.instrument).slice(0, 24),
        direction: parsed.direction === "Short" ? "Short" : "Long",
        pattern: String(parsed.pattern ?? FALLBACK.pattern).slice(0, 64),
        thesis: String(parsed.thesis ?? FALLBACK.thesis).slice(0, 360),
        trigger: String(parsed.trigger ?? FALLBACK.trigger).slice(0, 240),
        invalidation: String(parsed.invalidation ?? FALLBACK.invalidation).slice(0, 240),
        rr: String(parsed.rr ?? FALLBACK.rr).slice(0, 60),
      };
      return { trade, source: "ai" };
    } catch (err) {
      return {
        trade: FALLBACK,
        source: "fallback",
        note: `AI error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });

function extractJson(text: string): string | null {
  if (!text) return null;
  // Strip ```json fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : text.trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return body.slice(start, end + 1);
}