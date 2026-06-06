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

    const singleShape =
      '{"instrument":string|null,"timeframe":string|null,"trend":"bullish"|"bearish"|"sideways","structure":string,"keyLevels":{"support":string[],"resistance":string[]},"patterns":string[],"indicators":string[],"bias":string,"biasDirection":"Long"|"Short"|"Neutral","setupDetected":string,"setupQuality":number,"setupIdea":{"direction":"long"|"short"|"none","entry":string,"stop":string,"target":string,"rr":string},"confluenceFactors":string[],"riskFactors":string[],"risks":string[],"summary":string}';

    const multiShape =
      '{"frames":{"HTF":{"timeframe":string|null,"trend":"bullish"|"bearish"|"sideways","structure":string,"summary":string}|null,"MTF":{"timeframe":string|null,"trend":"bullish"|"bearish"|"sideways","structure":string,"summary":string}|null,"LTF":{"timeframe":string|null,"trend":"bullish"|"bearish"|"sideways","structure":string,"summary":string}|null},"mtfAlignment":{"aligned":number,"total":number,"verdict":string,"htfTrend":string,"mtfStructure":string,"ltfSignal":string},' +
      singleShape.slice(1);

    const systemBase =
      "You are a professional futures day trader and technical analysis expert. setupDetected is the named setup in TITLE CASE (e.g. \"Opening Range Breakout\"). setupQuality is an integer 1-5. confluenceFactors lists reasons to take the trade; riskFactors lists reasons for caution. Keep arrays short (max 5). No markdown, no commentary outside JSON.";

    const systemMulti =
      systemBase +
      " You are given multiple chart screenshots of the same instrument at different timeframes (HTF=higher, MTF=entry, LTF=trigger). Analyze each frame, then produce a COMBINED trade idea using top-down logic (HTF bias → MTF structure → LTF trigger). Respond ONLY with compact JSON matching this shape: " +
      multiShape +
      '. In mtfAlignment: "aligned" is how many frames agree directionally (count out of total provided), "total" is the number of frames provided, "verdict" is one short sentence (e.g. "Full alignment — strongest setup type"), and htfTrend/mtfStructure/ltfSignal are short labels like "Bullish", "At Support", "Breakout forming".';

    const systemSingle =
      systemBase +
      " Analyze the chart screenshot and respond ONLY with compact JSON matching this shape: " +
      singleShape +
      ".";

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
        text: noteText + "Analyze this chart and return the JSON.",
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
            timeoutMs: 15_000,
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
      const cleaned = raw
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {
            parsed = null;
          }
        }
      }

      if (!parsed || typeof parsed !== "object") {
        return {
          ok: false as const,
          error: "Analysis unavailable — try a clearer screenshot.",
          tokensUsed,
          durationMs,
        };
      }
      return { ok: true as const, analysis: parsed, raw: cleaned, tokensUsed, durationMs };
    } catch (err) {
      if (err instanceof TimeoutError) {
        return {
          ok: false as const,
          error: "Analysis took too long (>15s). Check your connection and try again.",
        };
      }
      return {
        ok: false as const,
        error: `Analysis error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });
