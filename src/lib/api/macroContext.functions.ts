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

// ---------- Live macro indicators ----------

export type MacroIndicators = {
  fedFundsRate: number;
  fedFundsLastChange: string; // ISO date
  nextFomcDate: string; // ISO date
  vix: number;
  vixChangePct: number;
  us10y: number;
  us10yChangePct: number;
  dxy: number;
  dxyChangePct: number;
  advancing: number;
  declining: number;
  sources: {
    quotes: "live" | "fallback";
    breadth: "live" | "fallback";
    fed: "static";
  };
  fetchedAt: number;
};

// Known FOMC meeting end-dates. Update yearly.
const FOMC_DATES = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
  "2027-01-27",
];

// Most recent known Fed Funds target (upper bound) + last change date.
// Update when the Fed moves.
const FED_FUNDS_FALLBACK = {
  rate: 4.5,
  lastChange: "2025-12-18",
};

function nextFomc(nowMs: number): string {
  for (const d of FOMC_DATES) {
    if (new Date(d + "T19:00:00Z").getTime() > nowMs) return d;
  }
  return FOMC_DATES[FOMC_DATES.length - 1];
}

type YahooQuote = {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
};

async function fetchYahooQuotes(symbols: string[]): Promise<YahooQuote[] | null> {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EdgeTrader/1.0; +https://lovable.dev)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      quoteResponse?: { result?: YahooQuote[] };
    };
    return json.quoteResponse?.result ?? null;
  } catch {
    return null;
  }
}

const FALLBACK: Omit<MacroIndicators, "sources" | "fetchedAt" | "nextFomcDate" | "fedFundsRate" | "fedFundsLastChange"> = {
  vix: 17.8,
  vixChangePct: 0,
  us10y: 4.21,
  us10yChangePct: 0,
  dxy: 103.4,
  dxyChangePct: -0.18,
  advancing: 1820,
  declining: 1140,
};

export const getMacroIndicators = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ok: true; data: MacroIndicators } | { ok: false; error: string }> => {
    const now = Date.now();
    // ^VIX, ^TNX (10Y yield x10), DX-Y.NYB (DXY)
    const quotes = await fetchYahooQuotes(["^VIX", "^TNX", "DX-Y.NYB"]);
    const byId = new Map<string, YahooQuote>();
    for (const q of quotes ?? []) byId.set(q.symbol, q);

    const vixQ = byId.get("^VIX");
    const tnxQ = byId.get("^TNX");
    const dxyQ = byId.get("DX-Y.NYB");
    const live = Boolean(vixQ?.regularMarketPrice && tnxQ?.regularMarketPrice && dxyQ?.regularMarketPrice);

    const vix = vixQ?.regularMarketPrice ?? FALLBACK.vix;
    const vixChangePct = vixQ?.regularMarketChangePercent ?? FALLBACK.vixChangePct;
    const us10y = tnxQ?.regularMarketPrice != null ? Number((tnxQ.regularMarketPrice / 10).toFixed(2)) : FALLBACK.us10y;
    const us10yChangePct = tnxQ?.regularMarketChangePercent ?? FALLBACK.us10yChangePct;
    const dxy = dxyQ?.regularMarketPrice ?? FALLBACK.dxy;
    const dxyChangePct = dxyQ?.regularMarketChangePercent ?? FALLBACK.dxyChangePct;

    // Breadth: no reliable keyless feed; use fallback for now.
    const advancing = FALLBACK.advancing;
    const declining = FALLBACK.declining;

    return {
      ok: true,
      data: {
        fedFundsRate: FED_FUNDS_FALLBACK.rate,
        fedFundsLastChange: FED_FUNDS_FALLBACK.lastChange,
        nextFomcDate: nextFomc(now),
        vix: Number(vix.toFixed(2)),
        vixChangePct: Number(vixChangePct.toFixed(2)),
        us10y,
        us10yChangePct: Number(us10yChangePct.toFixed(2)),
        dxy: Number(dxy.toFixed(2)),
        dxyChangePct: Number(dxyChangePct.toFixed(2)),
        advancing,
        declining,
        sources: {
          quotes: live ? "live" : "fallback",
          breadth: "fallback",
          fed: "static",
        },
        fetchedAt: now,
      },
    };
  },
);