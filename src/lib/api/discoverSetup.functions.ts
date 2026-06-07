import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TradeSchema = z.object({
  setup: z.string().max(40).nullable(),
  direction: z.string().max(10).nullable(),
  result: z.string().max(10).nullable(),
  rMultiple: z.number().nullable(),
  pnl: z.number().nullable(),
  hour: z.number().int().min(0).max(23).nullable(),
  dayOfWeek: z.number().int().min(1).max(7).nullable(),
  regime: z.string().max(30).nullable(),
  vix: z.number().nullable(),
  sessionNum: z.number().int().min(0).max(20).nullable(),
  checklistScore: z.number().int().min(0).max(10).nullable(),
  instrument: z.string().max(20).nullable(),
});

const InputSchema = z.object({
  trades: z.array(TradeSchema).min(15).max(500),
});

export type DiscoveredSetup = {
  topSetup: {
    name: string;
    conditions: Record<string, string | number | null>;
    tradeCount: number;
    winRate: number;
    avgR: number;
    ev: number;
    insight: string;
  };
  worstSetup: {
    name: string;
    conditions: Record<string, string | number | null>;
    tradeCount: number;
    winRate: number;
    recommendation: string;
  };
  keyInsights: string[];
};

export type DiscoverResponse =
  | { ok: true; data: DiscoveredSetup }
  | { ok: false; error: string };

export const discoverSetup = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }): Promise<DiscoverResponse> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "AI is not configured — missing credentials." };
    }

    // Compact CSV-style payload to minimize tokens.
    const header =
      "idx,setup,dir,result,R,pnl,hr,dow,regime,vix,sess#,chk,inst";
    const lines = data.trades.map((t, i) =>
      [
        i + 1,
        t.setup ?? "",
        t.direction ?? "",
        t.result ?? "",
        t.rMultiple ?? "",
        t.pnl ?? "",
        t.hour ?? "",
        t.dayOfWeek ?? "",
        t.regime ?? "",
        t.vix ?? "",
        t.sessionNum ?? "",
        t.checklistScore ?? "",
        t.instrument ?? "",
      ].join(","),
    );
    const tradesCsv = [header, ...lines].join("\n");

    const systemPrompt = `You are a quantitative trading analyst. Given a CSV of trade records, find the combination of conditions (setup, direction, time-of-day band, market regime, session trade number, VIX range) that produces the HIGHEST win rate with at least 15 matching trades. Also identify the WORST condition combination with at least 10 trades. Return STRICT JSON only, no prose, no markdown fences.

Schema:
{
  "topSetup": {
    "name": "short name (e.g. 'A+ ORB Long NY Open')",
    "conditions": { "setup": "...", "direction": "Long|Short", "timeBand": "HH:MM-HH:MM CT", "regime": "...", "vix": "X-Y", "sessionNum": "1st|2nd|3rd+" },
    "tradeCount": number,
    "winRate": number (0..1),
    "avgR": number,
    "ev": number (avg pnl per trade in $),
    "insight": "one sentence explaining why it works"
  },
  "worstSetup": {
    "name": "short name",
    "conditions": { ...same shape, omit fields that don't apply },
    "tradeCount": number,
    "winRate": number (0..1),
    "recommendation": "one sentence"
  },
  "keyInsights": ["bullet 1", "bullet 2", "bullet 3"]
}

Only include condition keys that meaningfully narrow the bucket. Omit keys that span the full data range.`;

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
            model: "google/gemini-2.5-pro",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Trades (${data.trades.length} rows):\n${tradesCsv}` },
            ],
          }),
        },
      );

      if (!res.ok) {
        if (res.status === 429) return { ok: false, error: "AI is rate-limited — try again in a moment." };
        if (res.status === 402) return { ok: false, error: "AI credits exhausted. Add credits in workspace settings." };
        const txt = await res.text().catch(() => "");
        return { ok: false, error: `AI request failed (${res.status}). ${txt.slice(0, 160)}` };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) return { ok: false, error: "AI returned no content." };

      // Strip possible code fences just in case.
      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned) as DiscoveredSetup;
        return { ok: true, data: parsed };
      } catch {
        return { ok: false, error: "AI returned malformed JSON. Try again." };
      }
    } catch (err) {
      return {
        ok: false,
        error: `AI error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });