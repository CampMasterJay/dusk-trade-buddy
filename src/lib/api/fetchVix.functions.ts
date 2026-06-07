import { createServerFn } from "@tanstack/react-start";

/**
 * Ask the Lovable AI gateway for an approximate current VIX (CBOE Volatility Index)
 * by web-searching public reporting. Returns a numeric value plus the model's note.
 */
export const fetchCurrentVix = createServerFn({ method: "POST" }).handler(
  async () => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI is not configured on the server." };
    }

    const system =
      "You are a market-data assistant. Estimate the most recent CBOE Volatility " +
      "Index (^VIX) closing or intraday level using publicly reported financial " +
      "news. Respond ONLY with strict JSON in the form " +
      '{"vix": <number>, "as_of": "<short human description>", "note": "<one short sentence>"}. ' +
      "No markdown, no prose outside the JSON. Numbers only, no % sign.";

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
              {
                role: "user",
                content:
                  "What is the most recent VIX level you are aware of? Reply with the JSON only.",
              },
            ],
          }),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429)
          return { ok: false as const, error: "Rate-limited. Try again shortly." };
        if (res.status === 402)
          return { ok: false as const, error: "AI credits exhausted." };
        return {
          ok: false as const,
          error: `Failed (${res.status}). ${txt.slice(0, 160)}`,
        };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
      // Strip optional ```json fences just in case.
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      let parsed: { vix?: unknown; as_of?: unknown; note?: unknown };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return {
          ok: false as const,
          error: `Could not parse VIX response: ${raw.slice(0, 120)}`,
        };
      }
      const vix = Number(parsed.vix);
      if (!Number.isFinite(vix) || vix < 5 || vix > 150) {
        return {
          ok: false as const,
          error: `Got implausible VIX value: ${String(parsed.vix)}`,
        };
      }
      return {
        ok: true as const,
        vix,
        as_of: typeof parsed.as_of === "string" ? parsed.as_of : null,
        note: typeof parsed.note === "string" ? parsed.note : null,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: `Error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  },
);