import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TradeSchema = z.object({
  underlying: z.string().max(20).nullable(),
  strategy: z.string().max(40).nullable(),
  isDebit: z.boolean().nullable(),
  regime: z.string().max(30).nullable(),
  ivr: z.number().nullable(),
  dte: z.number().int().min(0).max(400).nullable(),
  vix: z.number().nullable(),
  dayOfWeek: z.number().int().min(1).max(7).nullable(),
  checklistScore: z.number().int().min(0).max(10).nullable(),
  result: z.string().max(10).nullable(), // Win / Loss / Open
  netPnl: z.number().nullable(),
  pctOfMaxProfit: z.number().nullable(),
});

const InputSchema = z.object({
  trades: z.array(TradeSchema).min(15).max(500),
});

export type DiscoveredOptionsSetup = {
  topSetup: {
    name: string;
    conditions: Record<string, string | number | null>;
    tradeCount: number;
    winRate: number;
    avgPnl: number;
    avgPctOfMaxProfit: number;
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

export type DiscoverOptionsResponse =
  | { ok: true; data: DiscoveredOptionsSetup }
  | { ok: false; error: string };

export const discoverOptionsSetup = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }): Promise<DiscoverOptionsResponse> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "AI is not configured — missing credentials." };
    }

    const header =
      "idx,underlying,strategy,debit,regime,ivr,dte,vix,dow,chk,result,pnl,pctMax";
    const lines = data.trades.map((t, i) =>
      [
        i + 1,
        t.underlying ?? "",
        t.strategy ?? "",
        t.isDebit == null ? "" : t.isDebit ? "D" : "C",
        t.regime ?? "",
        t.ivr ?? "",
        t.dte ?? "",
        t.vix ?? "",
        t.dayOfWeek ?? "",
        t.checklistScore ?? "",
        t.result ?? "",
        t.netPnl ?? "",
        t.pctOfMaxProfit ?? "",
      ].join(","),
    );
    const tradesCsv = [header, ...lines].join("\n");

    const systemPrompt = `You are a quantitative options trading analyst. Given a CSV of options trade records, find the combination of conditions (underlying, strategy, market regime, IVR range, DTE range, VIX range, days to avoid) that produces the HIGHEST win rate with at least 8 matching trades. Also identify the WORST condition combination with at least 6 trades. Return STRICT JSON only, no prose, no markdown fences.

Schema:
{
  "topSetup": {
    "name": "short name (e.g. 'A+ Iron Condor SPY Ranging Market')",
    "conditions": { "underlying": "...", "strategy": "...", "regime": "...", "ivrRange": "X-Y", "dteRange": "X-Y", "vixRange": "X-Y", "daysToAvoid": "Mon/Fri" },
    "tradeCount": number,
    "winRate": number (0..1),
    "avgPnl": number,
    "avgPctOfMaxProfit": number (0..1),
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
              { role: "user", content: `Options trades (${data.trades.length} rows):\n${tradesCsv}` },
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

      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned) as DiscoveredOptionsSetup;
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