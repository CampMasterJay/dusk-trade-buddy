import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ItemSchema = z.object({
  id: z.string().min(1).max(64),
  headline: z.string().min(1).max(400),
  summary: z.string().max(1000).optional(),
  symbols: z.array(z.string().max(20)).max(20).optional(),
});

const InputSchema = z.object({
  items: z.array(ItemSchema).min(1).max(5),
});

export type ImpactLevel = "HIGH" | "MEDIUM" | "LOW";
export type ImpactSentiment = "BULLISH" | "BEARISH" | "NEUTRAL";
export type TradingAction =
  | "Consider Long"
  | "Consider Short"
  | "Wait for Reaction"
  | "No Action"
  | "Monitor";

export type ImpactScore = {
  id: string;
  impactLevel: ImpactLevel;
  sentiment: ImpactSentiment;
  affectedAssets: string[];
  traderImplication: string;
  tradingAction: TradingAction;
};

const SYSTEM = `You are a senior futures trading analyst. For each news item, return ONE JSON object with exactly these fields:
- impactLevel: "HIGH" | "MEDIUM" | "LOW"
- sentiment: "BULLISH" | "BEARISH" | "NEUTRAL"
- affectedAssets: string[] (tickers/asset names like ["SPY","NQ","DXY"])
- traderImplication: string (ONE sentence, max 15 words)
- tradingAction: "Consider Long" | "Consider Short" | "Wait for Reaction" | "No Action" | "Monitor"

Respond with ONLY a JSON object of the shape:
{ "scores": [ { "id": "<item.id>", ...fields } ] }
Preserve every input id. No prose, no markdown, no code fences.`;

export const scoreNewsBatch = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI is not configured on the server." };
    }

    const user = data.items
      .map(
        (it, i) =>
          `Item ${i + 1} (id=${it.id})\n` +
          `Headline: ${it.headline}\n` +
          (it.summary ? `Summary: ${it.summary}\n` : "") +
          (it.symbols?.length ? `Symbols: ${it.symbols.join(", ")}\n` : ""),
      )
      .join("\n---\n");

    try {
      const aiStart = Date.now();
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429)
          return { ok: false as const, error: "Rate-limited. Try again shortly." };
        if (res.status === 402)
          return { ok: false as const, error: "AI credits exhausted." };
        return { ok: false as const, error: `Score failed (${res.status}). ${txt.slice(0, 160)}` };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { total_tokens?: number };
      };
      const tokensUsed = json.usage?.total_tokens ?? null;
      const durationMs = Date.now() - aiStart;
      const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!raw) return { ok: false as const, error: "Empty response." };

      const parsed = safeParse(raw);
      if (!parsed) return { ok: false as const, error: "Could not parse AI JSON." };

      const validated = z
        .object({
          scores: z.array(
            z.object({
              id: z.string(),
              impactLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
              sentiment: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
              affectedAssets: z.array(z.string()).default([]),
              traderImplication: z.string(),
              tradingAction: z.enum([
                "Consider Long",
                "Consider Short",
                "Wait for Reaction",
                "No Action",
                "Monitor",
              ]),
            }),
          ),
        })
        .safeParse(parsed);

      if (!validated.success) {
        return { ok: false as const, error: "AI returned unexpected shape." };
      }

      return {
        ok: true as const,
        scores: validated.data.scores as ImpactScore[],
        tokensUsed,
        durationMs,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: `Error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Strip code fences if model added them
    const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}