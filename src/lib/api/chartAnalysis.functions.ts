import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchWithTimeout, retryWithBackoff, TimeoutError } from "@/lib/retry";

const FrameSchema = z.object({
  slot: z.enum(["HTF", "MTF", "LTF"]),
  timeframe: z.string().max(40).optional(),
  imageDataUrl: z
    .string()
    .min(32)
    .max(8_000_000)
    .refine((s) => s.startsWith("data:image/"), "Must be an image data URL"),
});

const InputSchema = z
  .object({
    // Multi-timeframe input (preferred)
    frames: z.array(FrameSchema).min(1).max(3).optional(),
    // Legacy single-image input
    imageDataUrl: z
      .string()
      .min(32)
      .max(8_000_000)
      .refine((s) => s.startsWith("data:image/"), "Must be an image data URL")
      .optional(),
    note: z.string().max(500).optional(),
    marketType: z.enum(["standard", "options"]).optional(),
  })
  .refine((v) => !!v.frames?.length || !!v.imageDataUrl, {
    message: "Provide either frames or imageDataUrl",
  });

const SLOT_LABEL: Record<"HTF" | "MTF" | "LTF", string> = {
  HTF: "Higher Timeframe (context / bias)",
  MTF: "Entry Timeframe (structure / levels)",
  LTF: "Trigger Timeframe (entry signal)",
};

export const analyzeChart = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        error: "AI is not configured on the server.",
      };
    }

    const frames =
      data.frames && data.frames.length > 0
        ? data.frames
        : data.imageDataUrl
          ? [{ slot: "MTF" as const, timeframe: undefined, imageDataUrl: data.imageDataUrl }]
          : [];

    const isMulti = frames.length > 1;
    const isOptions = data.marketType === "options";

    const optionsShape =
      ',"optionsRecommendation":{"primaryStrategy":string,"alternativeStrategy":string,"reasoning":string,"idealDTE":string,"idealDelta":string,"ivRankNote":string,"strikeGuidance":string,"expirationGuidance":string,"maxRiskGuidance":string,"earningsWarning":boolean,"keyRisk":string}';

    const optionsInstruction = isOptions
      ? ' Also recommend the most appropriate options strategy. primaryStrategy must be one of: "Long Call","Long Put","Bull Call Spread","Bear Put Spread","Bull Put Spread","Bear Call Spread","Iron Condor","Iron Butterfly","Long Straddle","Long Strangle","Covered Call","Cash Secured Put","0DTE Play". idealDTE is a short range (e.g. "7–21 days"). idealDelta is a short range (e.g. "0.40–0.55 for long call"). earningsWarning=true if earnings appear within 7 days based on visible price action / news. Append optionsRecommendation to the JSON.'
      : "";

    const singleShape =
      '{"instrument":string|null,"timeframe":string|null,"trend":"bullish"|"bearish"|"sideways","structure":string,"keyLevels":{"support":string[],"resistance":string[]},"patterns":string[],"indicators":string[],"bias":string,"biasDirection":"Long"|"Short"|"Neutral","setupDetected":string,"setupQuality":number,"setupIdea":{"direction":"long"|"short"|"none","entry":string,"stop":string,"target":string,"rr":string},"confluenceFactors":string[],"riskFactors":string[],"risks":string[],"summary":string' +
      (isOptions ? optionsShape : "") +
      "}";

    const multiShape =
      '{"frames":{"HTF":{"timeframe":string|null,"trend":"bullish"|"bearish"|"sideways","structure":string,"summary":string}|null,"MTF":{"timeframe":string|null,"trend":"bullish"|"bearish"|"sideways","structure":string,"summary":string}|null,"LTF":{"timeframe":string|null,"trend":"bullish"|"bearish"|"sideways","structure":string,"summary":string}|null},"mtfAlignment":{"aligned":number,"total":number,"verdict":string,"htfTrend":string,"mtfStructure":string,"ltfSignal":string},' +
      singleShape.slice(1);

    const systemBase =
      "You are a professional futures and options day trader with 15 years of experience analyzing price action, volume, and market structure. You specialize in Opening Range Breakout (ORB), VWAP-based setups, trend continuation, and mean reversion strategies on micro futures (MES, MNQ, MBT) and index options (SPY, QQQ, SPX).\n\nWhen analyzing a chart image, you examine:\n- Overall trend direction and market structure\n- Key support and resistance levels\n- VWAP position and relationship to price\n- Volume patterns and anomalies\n- Candlestick patterns and price action signals\n- Opening range if visible (first 15-minute candle)\n- Distance from key moving averages if visible\n\nYou return ONLY a valid JSON object with zero markdown, zero explanation text, zero code fences. Raw JSON only. If you cannot analyze the chart clearly, return JSON with null values and a reason in the summary field.";

    const systemMulti =
      systemBase +
      " You are given multiple chart screenshots of the same instrument at different timeframes (HTF=higher, MTF=entry, LTF=trigger). Analyze each frame, then produce a COMBINED trade idea using top-down logic (HTF bias → MTF structure → LTF trigger). Respond ONLY with compact JSON matching this shape: " +
      multiShape +
      '. In mtfAlignment: "aligned" is how many frames agree directionally (count out of total provided), "total" is the number of frames provided, "verdict" is one short sentence (e.g. "Full alignment — strongest setup type"), and htfTrend/mtfStructure/ltfSignal are short labels like "Bullish", "At Support", "Breakout forming".' +
      optionsInstruction;

    const systemSingle = systemBase + optionsInstruction;

    const singleUserPrompt =
      "Analyze this trading chart in detail. Examine the price action, structure, key levels, and any visible indicators. Return this exact JSON:\n{\n  instrument: string or null,\n  timeframe: string or null,\n  currentPrice: number or null,\n  trend: 'Strong Uptrend' | 'Uptrend' | 'Ranging' | 'Downtrend' | 'Strong Downtrend' | null,\n  marketStructure: string,\n  vwapPosition: 'Above VWAP' | 'Below VWAP' | 'At VWAP' | 'VWAP not visible' | null,\n  keySupport: number[],\n  keyResistance: number[],\n  setupDetected: string,\n  setupQuality: 1 | 2 | 3 | 4 | 5,\n  setupQualityReason: string,\n  biasDirection: 'Long' | 'Short' | 'Neutral',\n  suggestedEntry: number or null,\n  suggestedStop: number or null,\n  suggestedTarget: number or null,\n  rrRatio: number or null,\n  riskRewardJustification: string,\n  confluenceFactors: string[],\n  riskFactors: string[],\n  optionsPlay: string or null,\n  keyLevelToWatch: number or null,\n  summary: string\n}";

    const userContent: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [];
    const noteText = data.note?.trim() ? `Trader note: ${data.note.trim()}\n\n` : "";
    if (isMulti) {
      userContent.push({
        type: "text",
        text:
          noteText +
          "Top-down multi-timeframe analysis. The next " +
          frames.length +
          " images are labeled below. Combine them into a single trade idea and return the JSON.",
      });
      for (const f of frames) {
        userContent.push({
          type: "text",
          text: `[${f.slot}] ${SLOT_LABEL[f.slot]}${f.timeframe ? ` · ${f.timeframe}` : ""}`,
        });
        userContent.push({ type: "image_url", image_url: { url: f.imageDataUrl } });
      }
    } else {
      userContent.push({
        type: "text",
        text: noteText + singleUserPrompt,
      });
      userContent.push({ type: "image_url", image_url: { url: frames[0].imageDataUrl } });
    }

    try {
      const aiStart = Date.now();
      const res = await retryWithBackoff(
        () =>
          fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": apiKey,
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: isMulti ? systemMulti : systemSingle },
                { role: "user", content: userContent },
              ],
            }),
            timeoutMs: 20_000,
            label: "Chart analysis",
          }),
        {
          retries: 3,
          baseMs: 1000,
          // Retry on network/timeout/5xx; don't retry on 4xx (other than 429)
          shouldRetry: (err) => {
            if (err instanceof TimeoutError) return true;
            if (err instanceof Error && /fetch|network/i.test(err.message)) return true;
            return false;
          },
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.log(
          `[chartAnalysis ${new Date().toISOString()}] FAIL status=${res.status}`,
          txt.slice(0, 500),
        );
        if (res.status === 429)
          return { ok: false as const, error: "AI is rate-limited. Try again in a moment." };
        if (res.status === 402)
          return { ok: false as const, error: "AI credits exhausted. Add credits in workspace settings." };
        return { ok: false as const, error: `Analysis failed (${res.status}). ${txt.slice(0, 160)}` };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
      };
      const tokensUsed = json.usage?.total_tokens ?? null;
      const durationMs = Date.now() - aiStart;
      const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
      console.log(
        `[chartAnalysis ${new Date().toISOString()}] OK tokens=${tokensUsed} duration=${durationMs}ms rawLen=${raw.length}`,
      );
      const cleaned = raw
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Extract first { to last } as a fallback.
        const first = cleaned.indexOf("{");
        const last = cleaned.lastIndexOf("}");
        if (first !== -1 && last > first) {
          try {
            parsed = JSON.parse(cleaned.slice(first, last + 1));
          } catch {
            parsed = null;
          }
        }
      }

      if (!parsed || typeof parsed !== "object") {
        console.log(
          `[chartAnalysis ${new Date().toISOString()}] PARSE_FAIL raw="${raw.slice(0, 300)}"`,
        );
        return {
          ok: false as const,
          error:
            "Analysis returned an unexpected format. Please try uploading a clearer chart screenshot.",
          tokensUsed,
          durationMs,
        };
      }
      return { ok: true as const, analysis: parsed, raw: cleaned, tokensUsed, durationMs };
    } catch (err) {
      if (err instanceof TimeoutError) {
        console.log(
          `[chartAnalysis ${new Date().toISOString()}] TIMEOUT after 20s`,
        );
        return {
          ok: false as const,
          error:
            "Analysis is taking too long. The chart may be too complex — try a simpler view.",
        };
      }
      console.log(
        `[chartAnalysis ${new Date().toISOString()}] ERROR`,
        err instanceof Error ? err.message : err,
      );
      return {
        ok: false as const,
        error: `Analysis error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });
