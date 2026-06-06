/**
 * Pure trading-math helpers. Kept dependency-free so they can be unit-tested
 * without React, Supabase, or browser globals.
 */

export type PositionSizeInput = {
  /** Account balance in account currency. */
  balance: number;
  /** Percentage of balance willing to risk on this trade (e.g. 1 = 1%). */
  riskPct: number;
  /** Distance from entry to stop, in instrument price units. */
  stopDistance: number;
  /** Dollar value of a single tick/point for the instrument. */
  tickValue?: number;
};

export type PositionSizeResult = {
  riskDollars: number;
  contracts: number;
  /** Total dollar loss if stop hits at this size. */
  maxLoss: number;
};

/**
 * Standard position-sizing formula:
 *   riskDollars = balance * riskPct / 100
 *   contracts   = floor(riskDollars / (stopDistance * tickValue))
 */
export function computePositionSize(input: PositionSizeInput): PositionSizeResult {
  const tickValue = input.tickValue ?? 1;
  const riskDollars = Math.max(0, (input.balance * input.riskPct) / 100);
  if (input.stopDistance <= 0 || tickValue <= 0) {
    return { riskDollars, contracts: 0, maxLoss: 0 };
  }
  const riskPerContract = input.stopDistance * tickValue;
  const contracts = Math.max(0, Math.floor(riskDollars / riskPerContract));
  return {
    riskDollars,
    contracts,
    maxLoss: contracts * riskPerContract,
  };
}

export type ProjectionRow = {
  win: number;
  balance: number;
  risk: number;
  winTarget: number;
  pctToGoal: number;
  crossed: boolean;
};

export type CompoundingProjectionInput = {
  currentBalance: number;
  targetBalance: number;
  riskPct: number;
  rrRatio: number;
  maxWins?: number;
};

export type CompoundingProjectionResult = {
  rows: ProjectionRow[];
  winsNeeded: number;
  hitTarget: boolean;
};

/**
 * Compounding projection: starting from `currentBalance`, each consecutive win
 * adds `balance * riskPct% * rrRatio` to the running balance until either
 * `targetBalance` is hit or `maxWins` (default 30) is reached.
 */
export function computeCompoundingProjection(
  input: CompoundingProjectionInput,
): CompoundingProjectionResult {
  const max = input.maxWins ?? 30;
  const { currentBalance, targetBalance, riskPct, rrRatio } = input;

  const rows: ProjectionRow[] = [];
  let balance = currentBalance;
  let hitTarget = false;
  let winsNeeded = 0;

  rows.push({
    win: 0,
    balance,
    risk: (balance * riskPct) / 100,
    winTarget: ((balance * riskPct) / 100) * rrRatio,
    pctToGoal: Math.min(100, (balance / targetBalance) * 100),
    crossed: balance >= targetBalance,
  });

  for (let i = 1; i <= max; i++) {
    const risk = (balance * riskPct) / 100;
    const win = risk * rrRatio;
    const prev = balance;
    balance = balance + win;
    const crossed = prev < targetBalance && balance >= targetBalance;
    rows.push({
      win: i,
      balance,
      risk: (balance * riskPct) / 100,
      winTarget: ((balance * riskPct) / 100) * rrRatio,
      pctToGoal: Math.min(100, (balance / targetBalance) * 100),
      crossed,
    });
    if (!hitTarget && balance >= targetBalance) {
      hitTarget = true;
      winsNeeded = i;
    }
    if (balance >= targetBalance) break;
  }
  if (!hitTarget) winsNeeded = max;
  return { rows, winsNeeded, hitTarget };
}