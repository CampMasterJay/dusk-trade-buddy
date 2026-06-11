import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchWithTimeout, retryWithBackoff, TimeoutError } from "@/lib/retry";

const InputSchema = z.object({
  imageDataUrl: z
    .string()
    .min(32)
    .max(8_000_000)
    .refine((s) => s.startsWith("data:image/"), "Must be an image data URL"),
  mode: z.enum(["futures", "options"]),
});

const FUTURES_SHAPE =
  '{"instrument":string|null,"direction":"Long"|"Short"|null,"entry":number|null,"stop":number|null,"target":number|null,"exit":number|null,"pnl":number|null,"r_multiple":number|null,"result":"Win"|"Loss"|"Scratch"|null,"notes":string|null}';

const OPTIONS_SHAPE =
  '{"underlying":string|null,"strategy_type":string|null,"direction_bias":"Bullish"|"Bearish"|"Neutral"|"Volatility"|null,"leg1_type":"Call"|"Put"|null,"leg1_action":"Buy"|"Sell"|null,"leg1_strike":number|null,"leg1_premium":number|null,"leg1_contracts":number|null,"leg1_expiration":"YYYY-MM-DD"|null,"status":"Open"|"Closed"|null,"net_pnl":number|null,"exit_premium":number|null,"notes":string|null}';

/**
 * Vision-powered trade-photo parser. Given a screenshot of a broker P&L,
 * order ticket, or position summary, return structured fields to prefill
 * the Quick Log form. Best-effort — fields the model can't read come back
 * as null and the user can fill them in manually.
 */
export const extractTradeFromPhoto = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI is not configured on the server." };
    }

    const shape = data.mode === "options" ? OPTIONS_SHAPE : FUTURES_SHAPE;
    const modeHint =
      data.mode === "options"
        ? "This is a screenshot of an OPTIONS trade (order ticket, position summary, or P&L screen from a broker). Extract the underlying symbol, strategy if visible, the first leg (type/action/strike/premium/contracts/expiration in YYYY-MM-DD), status (Open or Closed). IMPORTANT: always extract BOTH leg1_premium (entry/fill price per share) and exit_premium (closing fill price per share) when both are visible — they are needed to compute P/L. Also extract realized net_pnl in dollars if explicitly shown."
        : "This is a screenshot of a FUTURES or stock trade (order ticket or P&L). Extract instrument symbol, direction (Long/Short), and ALL prices visible: entry, stop, target, and exit fill price. These prices let us compute P/L even when the broker doesn't print a dollar amount. Also extract realized P&L in dollars and R-multiple if shown, and overall result.";

    const system =
      "You extract trade data from broker screenshots. The screenshot may contain MULTIPLE distinct trades (e.g. a positions list, fills blotter, or P&L statement with several rows). Respond ONLY with compact JSON of the form {\"trades\":[T,...]} where each T matches this shape — one object per distinct trade visible. If only one trade is visible, return a single-item array. Use null for any field you can't read confidently. No markdown, no commentary outside JSON. T = " +
      shape;

    try {
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
                { role: "system", content: system },
                {
                  role: "user",
                  content: [
                    { type: "text", text: modeHint },
                    { type: "image_url", image_url: { url: data.imageDataUrl } },
                  ],
                },
              ],
            }),
            timeoutMs: 15_000,
            label: "Trade photo extraction",
          }),
        {
          retries: 2,
          baseMs: 800,
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
          return { ok: false as const, error: "AI credits exhausted." };
        return { ok: false as const, error: `Extraction failed (${res.status}). ${txt.slice(0, 160)}` };
      }

      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            parsed = JSON.parse(m[0]);
          } catch {
            parsed = null;
          }
        }
      }
      if (!parsed || typeof parsed !== "object") {
        return { ok: false as const, error: "Couldn't read the trade. Try a clearer screenshot." };
      }
      type Fields = Record<string, string | number | boolean | null>;
      const obj = parsed as { trades?: unknown } & Fields;
      let trades: Fields[] = [];
      if (Array.isArray(obj.trades)) {
        trades = (obj.trades as unknown[]).filter(
          (t): t is Fields => !!t && typeof t === "object",
        );
      } else {
        // Backwards-compat: model returned a single flat object.
        trades = [obj as Fields];
      }
      // Drop empty rows (every field null/empty).
      trades = trades.filter((t) =>
        Object.values(t).some((v) => v != null && v !== ""),
      );
      if (trades.length === 0) {
        return { ok: false as const, error: "Couldn't read any trades. Try a clearer screenshot." };
      }
      return { ok: true as const, trades };
    } catch (err) {
      if (err instanceof TimeoutError) {
        return { ok: false as const, error: "Extraction timed out (>15s)." };
      }
      return {
        ok: false as const,
        error: `Extraction error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });