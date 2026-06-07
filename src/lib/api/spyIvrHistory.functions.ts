import { createServerFn } from "@tanstack/react-start";

export type IvrHistoryPoint = { date: string; ivr: number; iv?: number };

/**
 * Ask the Lovable AI gateway to web-search recent SPY implied volatility data
 * and return a 30-day IV Rank history. This is a proxy for "is the market
 * paying for vol right now?" — not a precise dataset.
 */
export const fetchSpyIvrHistory = createServerFn({ method: "POST" }).handler(
  async (): Promise<
    | { ok: true; points: IvrHistoryPoint[]; note: string | null; as_of: string | null }
    | { ok: false; error: string }
  > => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "AI is not configured on the server." };
    }

    const system =
      "You are a market-data assistant. Provide an approximate 30-day daily history of " +
      "SPY 30-day implied volatility (or VIX as a proxy), normalized to IV Rank " +
      "(0–100 vs the past 52 weeks). " +
      "Respond ONLY with strict JSON: " +
      '{"as_of":"<short human description>","note":"<one short sentence about source/caveats>",' +
      '"points":[{"date":"YYYY-MM-DD","ivr":<0-100 number>,"iv":<optional number>}]}. ' +
      "Provide ~30 daily points in chronological order ending at the most recent trading day. " +
      "No markdown, no prose outside the JSON.";

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
                  "Give a 30-day SPY IV Rank history. JSON only, ~30 points, normalize to 0–100.",
              },
            ],
          }),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429) return { ok: false, error: "Rate-limited. Try again shortly." };
        if (res.status === 402) return { ok: false, error: "AI credits exhausted." };
        return { ok: false, error: `Failed (${res.status}). ${txt.slice(0, 160)}` };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
      const cleaned = raw
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();

      let parsed: {
        points?: unknown;
        note?: unknown;
        as_of?: unknown;
      };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return { ok: false, error: `Could not parse SPY IVR response: ${raw.slice(0, 120)}` };
      }

      if (!Array.isArray(parsed.points)) {
        return { ok: false, error: "Response missing 'points' array." };
      }

      const points: IvrHistoryPoint[] = [];
      for (const p of parsed.points) {
        if (!p || typeof p !== "object") continue;
        const o = p as { date?: unknown; ivr?: unknown; iv?: unknown };
        const date = typeof o.date === "string" ? o.date : null;
        const ivr = Number(o.ivr);
        if (!date || !Number.isFinite(ivr)) continue;
        const clamped = Math.max(0, Math.min(100, ivr));
        const iv = Number(o.iv);
        points.push({
          date,
          ivr: clamped,
          iv: Number.isFinite(iv) ? iv : undefined,
        });
      }

      if (points.length === 0) {
        return { ok: false, error: "No valid IVR points returned." };
      }

      return {
        ok: true,
        points,
        as_of: typeof parsed.as_of === "string" ? parsed.as_of : null,
        note: typeof parsed.note === "string" ? parsed.note : null,
      };
    } catch (err) {
      return {
        ok: false,
        error: `Error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  },
);