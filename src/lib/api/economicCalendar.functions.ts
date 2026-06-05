import { createServerFn } from "@tanstack/react-start";

export type CalendarImpact = "HIGH" | "MEDIUM" | "LOW" | "HOLIDAY";

export type CalendarEvent = {
  id: string;
  title: string;
  country: string; // e.g. "USD", "EUR"
  dateMs: number; // event time in epoch ms
  impact: CalendarImpact;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
};

type RawForexFactoryEvent = {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
  actual?: string;
};

function normalizeImpact(raw: string | undefined): CalendarImpact {
  const v = (raw ?? "").toLowerCase();
  if (v.startsWith("high")) return "HIGH";
  if (v.startsWith("med")) return "MEDIUM";
  if (v.startsWith("low")) return "LOW";
  return "HOLIDAY";
}

function nullable(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * Fetch this week's economic calendar from ForexFactory's free JSON feed.
 * Runs on the server to bypass CORS.
 */
export const getEconomicCalendar = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const res = await fetch(
        "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; EdgeTraderBot/1.0; +https://edgetrader.app)",
            Accept: "application/json,text/plain,*/*",
          },
        },
      );
      if (!res.ok) {
        return {
          ok: false as const,
          error: `Calendar feed returned ${res.status}`,
        };
      }
      const raw = (await res.json()) as RawForexFactoryEvent[];
      const events: CalendarEvent[] = raw
        .map((e, idx): CalendarEvent | null => {
          if (!e.date || !e.title) return null;
          const ms = Date.parse(e.date);
          if (!Number.isFinite(ms)) return null;
          return {
            id: `${e.country ?? "X"}-${ms}-${idx}`,
            title: e.title,
            country: (e.country ?? "").toUpperCase(),
            dateMs: ms,
            impact: normalizeImpact(e.impact),
            forecast: nullable(e.forecast),
            previous: nullable(e.previous),
            actual: nullable(e.actual),
          };
        })
        .filter((x): x is CalendarEvent => x !== null)
        .sort((a, b) => a.dateMs - b.dateMs);

      return { ok: true as const, events, fetchedAt: Date.now() };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false as const, error: message };
    }
  },
);