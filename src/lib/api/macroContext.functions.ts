import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  indicators: z.string().min(1).max(2000),
});

export const getMacroSummary = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI is not configured on the server." };
    }

    const system =
      "You are a macro market analyst writing for a futures day trader. " +
      "Given a snapshot of macro indicators, write a SHORT plain-English market context summary " +
      "(3 to 5 sentences, max ~70 words). Be specific: reference the actual numbers. " +
      "End with one concrete trading-posture suggestion (e.g. 'trade smaller', 'normal size', 'wait for clarity'). " +
      "No hedging fluff, no disclaimers, no markdown — plain prose only.";

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
              { role: "system", content: system },
              { role: "user", content: `Macro snapshot:\n${data.indicators}` },
            ],
          }),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429)
          return { ok: false as const, error: "Rate-limited. Try again in a moment." };
        if (res.status === 402)
          return { ok: false as const, error: "AI credits exhausted." };
        return { ok: false as const, error: `Failed (${res.status}). ${txt.slice(0, 160)}` };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const summary = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!summary) return { ok: false as const, error: "Empty response." };
      return { ok: true as const, summary };
    } catch (err) {
      return {
        ok: false as const,
        error: `Error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });