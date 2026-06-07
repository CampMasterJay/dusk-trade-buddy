/**
 * Options P&L Engine
 *
 * Pure calculation functions for every supported options strategy.
 * All premiums are quoted per-share (e.g. 2.45). Contract multiplier is
 * 100 for equity options. Caller passes `multiplier` for futures options
 * if different.
 */

export type StrategyType =
  | "Long Call"
  | "Long Put"
  | "Bull Call Spread"
  | "Bear Put Spread"
  | "Bull Put Spread"
  | "Bear Call Spread"
  | "Iron Condor"
  | "Iron Butterfly"
  | "Long Straddle"
  | "Long Strangle"
  | "Covered Call"
  | "Cash Secured Put"
  | "Other";

export interface OptionsCalcResult {
  maxRisk: number;
  maxProfit: number;
  breakEven: number | [number, number];
  rrRatio: number;
  currentPnL: number;
  currentPnLPct: number;
  profitTargetPrice: number; // exit premium that yields 50% of max profit
  stopLossPrice: number; // exit premium that yields planned stop loss
}

export interface LegInput {
  type: "Call" | "Put";
  action: "Buy" | "Sell";
  strike: number;
  premium: number; // per-share premium
}

export interface CalcInput {
  strategyType: StrategyType;
  contracts: number;
  multiplier?: number; // default 100
  leg1: LegInput;
  leg2?: LegInput;
  // For iron condor/butterfly, optionally pass 4 legs via extraLegs
  extraLegs?: LegInput[];
  // Live data
  currentPremiumNet?: number; // current net premium per-share of the position
  // Risk plan
  profitTargetPct?: number; // % of max profit, default 50
  stopLossPct?: number; // % of max risk, default 100
}

const DEFAULT_MULT = 100;

function n(x: number | undefined | null): number {
  return typeof x === "number" && isFinite(x) ? x : 0;
}

function safeDiv(a: number, b: number): number {
  if (!b || !isFinite(b)) return 0;
  return a / b;
}

// Compute net debit (positive = pays premium) per-share for a multi-leg position.
function netDebitPerShare(legs: LegInput[]): number {
  return legs.reduce((acc, l) => {
    const sign = l.action === "Buy" ? 1 : -1;
    return acc + sign * n(l.premium);
  }, 0);
}

function buildResult(args: {
  maxRisk: number;
  maxProfit: number;
  breakEven: number | [number, number];
  entryPremiumPerShare: number; // signed: positive = debit paid, negative = credit
  currentPremiumPerShare: number | undefined; // signed in same convention
  contracts: number;
  multiplier: number;
  isDebit: boolean;
  profitTargetPct: number;
  stopLossPct: number;
}): OptionsCalcResult {
  const {
    maxRisk,
    maxProfit,
    breakEven,
    entryPremiumPerShare,
    currentPremiumPerShare,
    contracts,
    multiplier,
    isDebit,
    profitTargetPct,
    stopLossPct,
  } = args;

  // P&L: for a debit position, profit = (current - entry). For credit, profit = (entry - current)
  // Using signed entry/current per-share (debit positive, credit negative):
  //   pnlPerShare = (current - entry) if debit, (entry - current) if credit
  let pnlPerShare = 0;
  if (currentPremiumPerShare !== undefined) {
    pnlPerShare = isDebit
      ? currentPremiumPerShare - entryPremiumPerShare
      : entryPremiumPerShare - currentPremiumPerShare;
  }
  const currentPnL = pnlPerShare * multiplier * contracts;
  const currentPnLPct = safeDiv(currentPnL, maxRisk) * 100;

  const rrRatio = safeDiv(maxProfit, maxRisk);

  // Profit target / stop loss exit premium (per-share) in the same signed convention
  // For debit: target exit premium = entry + (target $ / mult / contracts)
  // For credit: target exit premium = entry - (target $ / mult / contracts)
  const targetDollars = (maxProfit * profitTargetPct) / 100;
  const stopDollars = (maxRisk * stopLossPct) / 100;
  const targetPerShare = safeDiv(targetDollars, multiplier * contracts);
  const stopPerShare = safeDiv(stopDollars, multiplier * contracts);

  const profitTargetPrice = isDebit
    ? entryPremiumPerShare + targetPerShare
    : Math.max(0, entryPremiumPerShare - targetPerShare);
  // For debit positions, "stop loss" means premium dropped: entry - stop loss $
  // For credit positions, "stop loss" means premium rose: entry + stop loss $
  const stopLossPrice = isDebit
    ? Math.max(0, entryPremiumPerShare - stopPerShare)
    : entryPremiumPerShare + stopPerShare;

  return {
    maxRisk,
    maxProfit,
    breakEven,
    rrRatio,
    currentPnL,
    currentPnLPct,
    profitTargetPrice,
    stopLossPrice,
  };
}

/**
 * Single-leg long option (Long Call / Long Put).
 */
export function calcLongOption(input: CalcInput): OptionsCalcResult {
  const mult = input.multiplier ?? DEFAULT_MULT;
  const { leg1, contracts } = input;
  const premium = n(leg1.premium);
  const maxRisk = premium * mult * contracts;
  // Long call: unbounded; long put: strike - premium (down to 0)
  const maxProfit =
    leg1.type === "Call"
      ? Number.POSITIVE_INFINITY
      : Math.max(0, (leg1.strike - premium) * mult * contracts);
  const breakEven =
    leg1.type === "Call" ? leg1.strike + premium : leg1.strike - premium;

  return buildResult({
    maxRisk,
    maxProfit,
    breakEven,
    entryPremiumPerShare: premium,
    currentPremiumPerShare: input.currentPremiumNet,
    contracts,
    multiplier: mult,
    isDebit: true,
    profitTargetPct: input.profitTargetPct ?? 50,
    stopLossPct: input.stopLossPct ?? 100,
  });
}

/**
 * Vertical debit spread (Bull Call / Bear Put).
 * leg1 = long leg, leg2 = short leg.
 */
export function calcDebitSpread(input: CalcInput): OptionsCalcResult {
  const mult = input.multiplier ?? DEFAULT_MULT;
  const { leg1, leg2, contracts } = input;
  if (!leg2) throw new Error("Debit spread requires leg2");

  const netDebit = netDebitPerShare([leg1, leg2]); // positive
  const width = Math.abs(leg1.strike - leg2.strike);
  const maxRisk = Math.max(0, netDebit) * mult * contracts;
  const maxProfit = Math.max(0, width - netDebit) * mult * contracts;
  const isBullCall = input.strategyType === "Bull Call Spread";
  const lowerStrike = Math.min(leg1.strike, leg2.strike);
  const higherStrike = Math.max(leg1.strike, leg2.strike);
  const breakEven = isBullCall
    ? lowerStrike + netDebit
    : higherStrike - netDebit;

  return buildResult({
    maxRisk,
    maxProfit,
    breakEven,
    entryPremiumPerShare: netDebit,
    currentPremiumPerShare: input.currentPremiumNet,
    contracts,
    multiplier: mult,
    isDebit: true,
    profitTargetPct: input.profitTargetPct ?? 50,
    stopLossPct: input.stopLossPct ?? 100,
  });
}

/**
 * Vertical credit spread (Bull Put / Bear Call).
 * leg1 = short leg (the one collecting premium), leg2 = long protective leg.
 */
export function calcCreditSpread(input: CalcInput): OptionsCalcResult {
  const mult = input.multiplier ?? DEFAULT_MULT;
  const { leg1, leg2, contracts } = input;
  if (!leg2) throw new Error("Credit spread requires leg2");

  const netDebit = netDebitPerShare([leg1, leg2]); // negative for credit
  const credit = Math.max(0, -netDebit);
  const width = Math.abs(leg1.strike - leg2.strike);
  const maxProfit = credit * mult * contracts;
  const maxRisk = Math.max(0, width - credit) * mult * contracts;

  const isBullPut = input.strategyType === "Bull Put Spread";
  // Short strike = the leg that is being sold
  const shortStrike = (leg1.action === "Sell" ? leg1.strike : leg2.strike);
  const breakEven = isBullPut ? shortStrike - credit : shortStrike + credit;

  return buildResult({
    maxRisk,
    maxProfit,
    breakEven,
    entryPremiumPerShare: -credit, // signed credit
    currentPremiumPerShare: input.currentPremiumNet,
    contracts,
    multiplier: mult,
    isDebit: false,
    profitTargetPct: input.profitTargetPct ?? 50,
    stopLossPct: input.stopLossPct ?? 100,
  });
}

/**
 * Long straddle (same strike) / Long strangle (different strikes).
 * leg1 = long call, leg2 = long put.
 */
export function calcLongStraddleOrStrangle(input: CalcInput): OptionsCalcResult {
  const mult = input.multiplier ?? DEFAULT_MULT;
  const { leg1, leg2, contracts } = input;
  if (!leg2) throw new Error("Straddle/strangle requires leg2");

  const totalPremium = n(leg1.premium) + n(leg2.premium);
  const maxRisk = totalPremium * mult * contracts;
  const maxProfit = Number.POSITIVE_INFINITY;

  const callStrike = leg1.type === "Call" ? leg1.strike : leg2.strike;
  const putStrike = leg1.type === "Put" ? leg1.strike : leg2.strike;
  const breakEven: [number, number] = [
    putStrike - totalPremium,
    callStrike + totalPremium,
  ];

  return buildResult({
    maxRisk,
    maxProfit,
    breakEven,
    entryPremiumPerShare: totalPremium,
    currentPremiumPerShare: input.currentPremiumNet,
    contracts,
    multiplier: mult,
    isDebit: true,
    profitTargetPct: input.profitTargetPct ?? 50,
    stopLossPct: input.stopLossPct ?? 100,
  });
}

/**
 * Iron Condor — 4 legs: short put, long put (lower), short call, long call (higher).
 * Caller passes leg1 = short put, leg2 = long put, extraLegs = [short call, long call].
 */
export function calcIronCondor(input: CalcInput): OptionsCalcResult {
  const mult = input.multiplier ?? DEFAULT_MULT;
  const { leg1, leg2, extraLegs, contracts } = input;
  if (!leg2 || !extraLegs || extraLegs.length < 2)
    throw new Error("Iron condor requires 4 legs");
  const [shortCall, longCall] = extraLegs;

  const allLegs = [leg1, leg2, shortCall, longCall];
  const netDebit = netDebitPerShare(allLegs);
  const credit = Math.max(0, -netDebit);

  const putWidth = Math.abs(leg1.strike - leg2.strike);
  const callWidth = Math.abs(shortCall.strike - longCall.strike);
  const widerWidth = Math.max(putWidth, callWidth);

  const maxProfit = credit * mult * contracts;
  const maxRisk = Math.max(0, widerWidth - credit) * mult * contracts;

  const shortPutStrike = leg1.action === "Sell" ? leg1.strike : leg2.strike;
  const shortCallStrike =
    shortCall.action === "Sell" ? shortCall.strike : longCall.strike;
  const breakEven: [number, number] = [
    shortPutStrike - credit,
    shortCallStrike + credit,
  ];

  return buildResult({
    maxRisk,
    maxProfit,
    breakEven,
    entryPremiumPerShare: -credit,
    currentPremiumPerShare: input.currentPremiumNet,
    contracts,
    multiplier: mult,
    isDebit: false,
    profitTargetPct: input.profitTargetPct ?? 50,
    stopLossPct: input.stopLossPct ?? 100,
  });
}

/**
 * Iron Butterfly — 4 legs at 3 strikes: long put (lower wing),
 * short put + short call at center, long call (upper wing).
 */
export function calcIronButterfly(input: CalcInput): OptionsCalcResult {
  const mult = input.multiplier ?? DEFAULT_MULT;
  const { leg1, leg2, extraLegs, contracts } = input;
  if (!leg2 || !extraLegs || extraLegs.length < 2)
    throw new Error("Iron butterfly requires 4 legs");
  const [shortCall, longCall] = extraLegs;

  const allLegs = [leg1, leg2, shortCall, longCall];
  const netDebit = netDebitPerShare(allLegs);
  const credit = Math.max(0, -netDebit);

  // Wing width = distance from center to either wing (symmetric)
  const centerStrike = leg1.action === "Sell" ? leg1.strike : leg2.strike;
  const longPutStrike = leg2.action === "Buy" ? leg2.strike : leg1.strike;
  const wingWidth = Math.abs(centerStrike - longPutStrike);

  const maxProfit = credit * mult * contracts;
  const maxRisk = Math.max(0, wingWidth - credit) * mult * contracts;

  const breakEven: [number, number] = [
    centerStrike - credit,
    centerStrike + credit,
  ];

  return buildResult({
    maxRisk,
    maxProfit,
    breakEven,
    entryPremiumPerShare: -credit,
    currentPremiumPerShare: input.currentPremiumNet,
    contracts,
    multiplier: mult,
    isDebit: false,
    profitTargetPct: input.profitTargetPct ?? 50,
    stopLossPct: input.stopLossPct ?? 100,
  });
}

/**
 * Covered Call — long 100 shares of underlying + short 1 call per contract.
 * Requires `underlyingCostBasis` passed via leg1.premium repurposed?
 * For simplicity: leg1 = short call, and we treat max risk as
 * (cost basis - 0) - premium received per share. Caller must pass
 * `extraLegs[0].premium` as cost basis per share (long stock entry).
 */
export function calcCoveredCall(input: CalcInput): OptionsCalcResult {
  const mult = input.multiplier ?? DEFAULT_MULT;
  const { leg1, extraLegs, contracts } = input;
  const costBasis = extraLegs?.[0]?.premium ?? 0;
  const credit = n(leg1.premium);

  const maxProfit = (leg1.strike - costBasis + credit) * mult * contracts;
  const maxRisk = Math.max(0, costBasis - credit) * mult * contracts;
  const breakEven = costBasis - credit;

  return buildResult({
    maxRisk,
    maxProfit,
    breakEven,
    entryPremiumPerShare: -credit,
    currentPremiumPerShare: input.currentPremiumNet,
    contracts,
    multiplier: mult,
    isDebit: false,
    profitTargetPct: input.profitTargetPct ?? 50,
    stopLossPct: input.stopLossPct ?? 100,
  });
}

/**
 * Cash-Secured Put — short put, cash collateral = strike × 100 per contract.
 */
export function calcCashSecuredPut(input: CalcInput): OptionsCalcResult {
  const mult = input.multiplier ?? DEFAULT_MULT;
  const { leg1, contracts } = input;
  const credit = n(leg1.premium);

  const maxProfit = credit * mult * contracts;
  const maxRisk = Math.max(0, leg1.strike - credit) * mult * contracts;
  const breakEven = leg1.strike - credit;

  return buildResult({
    maxRisk,
    maxProfit,
    breakEven,
    entryPremiumPerShare: -credit,
    currentPremiumPerShare: input.currentPremiumNet,
    contracts,
    multiplier: mult,
    isDebit: false,
    profitTargetPct: input.profitTargetPct ?? 50,
    stopLossPct: input.stopLossPct ?? 100,
  });
}

/**
 * Dispatcher: route to the correct strategy calculator.
 */
export function calculateOptionsPnL(
  input: CalcInput,
): OptionsCalcResult {
  switch (input.strategyType) {
    case "Long Call":
    case "Long Put":
      return calcLongOption(input);
    case "Bull Call Spread":
    case "Bear Put Spread":
      return calcDebitSpread(input);
    case "Bull Put Spread":
    case "Bear Call Spread":
      return calcCreditSpread(input);
    case "Long Straddle":
    case "Long Strangle":
      return calcLongStraddleOrStrangle(input);
    case "Iron Condor":
      return calcIronCondor(input);
    case "Iron Butterfly":
      return calcIronButterfly(input);
    case "Covered Call":
      return calcCoveredCall(input);
    case "Cash Secured Put":
      return calcCashSecuredPut(input);
    default: {
      // "Other" — best-effort: treat leg1 as long option
      return calcLongOption(input);
    }
  }
}
