/**
 * Futures options registry — multiplier, tick size, settlement style.
 *
 * Premiums on futures options are quoted in the same "points" units as the
 * underlying futures contract. Dollar P&L per contract is:
 *   (exit premium − entry premium) × multiplier × contracts
 */

export type FuturesOptionSpec = {
  symbol: string; // e.g. "/ES"
  name: string;
  /** $ per 1.00 point of premium change. */
  multiplier: number;
  /** Smallest premium increment in points. */
  tickSize: number;
  /** $ value of one tick = tickSize × multiplier. */
  tickValue: number;
  /** Cash-settled (no underlying delivery) vs Physical. */
  settlement: "Cash" | "Physical";
  /** Exercise style. */
  style: "American" | "European";
  notes: string;
};

export const FUTURES_OPTIONS: FuturesOptionSpec[] = [
  {
    symbol: "/ES",
    name: "S&P 500 futures",
    multiplier: 50,
    tickSize: 0.05,
    tickValue: 2.5,
    settlement: "Cash",
    style: "American",
    notes:
      "Weekly options very popular. Cash-settled — no assignment risk at expiration.",
  },
  {
    symbol: "/NQ",
    name: "Nasdaq-100 futures",
    multiplier: 20,
    tickSize: 0.05,
    tickValue: 1.0,
    settlement: "Cash",
    style: "American",
    notes: "Weekly options available. Cash-settled — no assignment risk.",
  },
  {
    symbol: "/GC",
    name: "Gold futures",
    multiplier: 100,
    tickSize: 0.1,
    tickValue: 10,
    settlement: "Physical",
    style: "American",
    notes:
      "Settles into the underlying gold futures contract. Close before expiration to avoid delivery.",
  },
  {
    symbol: "/CL",
    name: "Crude Oil futures",
    multiplier: 1000,
    tickSize: 0.01,
    tickValue: 10,
    settlement: "Physical",
    style: "American",
    notes:
      "Settles into the underlying crude oil futures. Close early to avoid physical exposure.",
  },
  {
    symbol: "/ZB",
    name: "30yr Treasury futures",
    multiplier: 1000,
    tickSize: 1 / 64,
    tickValue: 1000 / 64,
    settlement: "Physical",
    style: "American",
    notes:
      "Quoted in 32nds. Settles into the underlying bond futures contract.",
  },
];

export const EQUITY_OPTION_MULTIPLIER = 100;

export function getFuturesOption(symbol: string): FuturesOptionSpec | null {
  if (!symbol) return null;
  const s = symbol.toUpperCase().startsWith("/") ? symbol.toUpperCase() : `/${symbol.toUpperCase()}`;
  return FUTURES_OPTIONS.find((f) => f.symbol === s) ?? null;
}

export function isFuturesUnderlying(symbol: string): boolean {
  return !!getFuturesOption(symbol) || symbol.trim().startsWith("/");
}

/** Returns the dollar multiplier to use in P&L calculations for an underlying. */
export function multiplierFor(symbol: string): number {
  return getFuturesOption(symbol)?.multiplier ?? EQUITY_OPTION_MULTIPLIER;
}