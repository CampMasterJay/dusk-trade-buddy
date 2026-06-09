/**
 * Lightweight P/L calculators used by Quick Log auto-fill so that an
 * uploaded order screenshot can produce a dollar P/L even when the broker
 * image only shows entry + exit prices.
 */

// Point value per 1.0 price move for common futures contracts.
const FUTURES_POINT_VALUE: Record<string, number> = {
  ES: 50, MES: 5,
  NQ: 20, MNQ: 2,
  YM: 5, MYM: 0.5,
  RTY: 50, M2K: 5,
  CL: 1000, MCL: 100,
  GC: 100, MGC: 10,
  SI: 5000, SIL: 1000,
  NG: 10000,
  ZB: 1000, ZN: 1000, ZF: 1000, ZT: 2000,
  "6E": 125000, "6B": 62500, "6J": 12500000,
};

function pointValueFor(symbol: string): number {
  const s = symbol.replace(/^\//, "").toUpperCase().replace(/[!.].*$/, "");
  // Strip month/year suffixes like ESZ4 -> ES
  const root = s.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, "");
  return FUTURES_POINT_VALUE[root] ?? FUTURES_POINT_VALUE[s] ?? 0;
}

/** Futures / stock dollar P/L from entry, exit, direction, and contracts. */
export function calcFuturesPnl(args: {
  symbol: string;
  direction: "Long" | "Short";
  entry: number;
  exit: number;
  contracts?: number;
}): number | null {
  if (!Number.isFinite(args.entry) || !Number.isFinite(args.exit)) return null;
  const pv = pointValueFor(args.symbol);
  if (pv <= 0) return null;
  const qty = Math.max(1, args.contracts ?? 1);
  const dir = args.direction === "Long" ? 1 : -1;
  return (args.exit - args.entry) * dir * pv * qty;
}

/** Options dollar P/L from entry/exit premium per share, action, contracts. */
export function calcOptionsPnl(args: {
  action: "Buy" | "Sell";
  entryPremium: number;
  exitPremium: number;
  contracts: number;
  multiplier?: number; // 100 for equity options; futures options vary
}): number | null {
  if (!Number.isFinite(args.entryPremium) || !Number.isFinite(args.exitPremium)) return null;
  const mult = args.multiplier ?? 100;
  const qty = Math.max(1, args.contracts || 1);
  const dir = args.action === "Buy" ? 1 : -1;
  return (args.exitPremium - args.entryPremium) * dir * mult * qty;
}
