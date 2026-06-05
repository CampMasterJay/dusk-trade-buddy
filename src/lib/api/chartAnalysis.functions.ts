import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  imageDataUrl: z
    .string()
    .min(32)
    .max(8_000_000)
    .refine((s) => s.startsWith("data:image/"), "Must be an image data URL"),
  note: z.string().max(500).optional(),
});

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
                  "You are a professional futures day trader and technical analysis expert. Analyze the chart screenshot and respond ONLY with compact JSON matching this shape: {\"instrument\":string|null,\"timeframe\":string|null,\"trend\":\"bullish\"|\"bearish\"|\"sideways\",\"structure\":string,\"keyLevels\":{\"support\":string[],\"resistance\":string[]},\"patterns\":string[],\"indicators\":string[],\"bias\":string,\"biasDirection\":\"Long\"|\"Short\"|\"Neutral\",\"setupDetected\":string,\"setupQuality\":number,\"setupIdea\":{\"direction\":\"long\"|\"short\"|\"none\",\"entry\":string,\"stop\":string,\"target\":string,\"rr\":string},\"confluenceFactors\":string[],\"riskFactors\":string[],\"risks\":string[],\"summary\":string}. setupDetected is the named setup in TITLE CASE (e.g. \"Opening Range Breakout\"). setupQuality is an integer 1-5 rating the trade quality. confluenceFactors lists reasons to take the trade; riskFactors lists reasons for caution. Keep arrays short (max 5). No markdown, no commentary outside JSON.",
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text:
                      (data.note?.trim() ? `Trader note: ${data.note.trim()}\n\n` : "") +
                      "Analyze this chart and return the JSON.",
                  },
                  { type: "image_url", image_url: { url: data.imageDataUrl } },
                ],
              },
            ],
          }),
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
      };
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
          ok: true as const,
          analysis: null,
          raw: cleaned || "No content returned.",
        };
      }
      return { ok: true as const, analysis: parsed, raw: cleaned };
    } catch (err) {
      return {
        ok: false as const,
        error: `Analysis error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });