/**
 * Options Position Sizing
 *
 * Computes contracts, max risk, max profit, commission estimate,
 * breakeven price, and surfaces warnings for sub-1-contract sizing
 * and account concentration.
 */

import {
  calculateOptionsPnL,
  type CalcInput,
  type OptionsCalcResult,
} from "@/lib/optionsPnLEngine";

export const DEFAULT_COMMISSION_PER_CONTRACT_PER_SIDE = 0.65;
export const CONCENTRATION_THRESHOLD_PCT = 15;
export const OPTIONS_MIN_RECOMMENDED_RISK_PCT = 3;

export interface SizingInput {
  accountBalance: number;
  riskPct: number; // 1..25
  // Strategy definition — same shape as the P&L engine consumes.
  calc: Omit<CalcInput, "contracts"> & { contracts?: number };
  commissionPerContractPerSide?: number;
  // Number of "sides" for the trade (open + close = 2 typically; per-leg multiplier baked in below).
  legsPerContract?: number; // default derived from strategy
}

export interface SizingResult {
  // Recommended sizing
  contracts: number;
  riskDollarBudget: number;
  maxRiskPerContract: number;
  // Position-level numbers (at the recommended contract count)
  maxRisk: number;
  maxProfit: number;
  breakEven: number | [number, number];
  rrRatio: number;
  // Commission estimate (open + close, all legs)
  commissionEstimate: number;
  // Warnings
  warnings: SizingWarning[];
  // Helpful context
  isDebit: boolean;
  // Minimum risk % that would yield ≥1 contract
  minRiskPctForOneContract: number;
  // Position size as % of account (using max risk)
  concentrationPct: number;
  // Raw underlying calc result for the recommended contract count
  calc: OptionsCalcResult | null;
}

export type SizingWarning =
  | {
      kind: "below_one_contract";
      message: string;
      suggestedMinRiskPct: number;
    }
  | {
      kind: "concentration";
      message: string;
      concentrationPct: number;
    }
  | {
      kind: "options_risk_floor";
      message: string;
    }
  | {
      kind: "invalid_inputs";
      message: string;
    };

function legCountForStrategy(strategy: string): number {
  switch (strategy) {
    case "Iron Condor":
    case "Iron Butterfly":
      return 4;
    case "Bull Call Spread":
    case "Bear Put Spread":
    case "Bull Put Spread":
    case "Bear Call Spread":
    case "Long Straddle":
    case "Long Strangle":
      return 2;
    default:
      return 1;
  }
}

/**
 * Compute the max risk per contract for the given strategy by running the
 * engine with contracts = 1.
 */
function maxRiskPerContractFor(calc: SizingInput["calc"]): {
  perContract: number;
  isDebit: boolean;
  oneContractCalc: OptionsCalcResult | null;
} {
  try {
    const result = calculateOptionsPnL({
      ...(calc as CalcInput),
      contracts: 1,
    });
    // Heuristic: debit strategies — Long Call/Put, Long Straddle/Strangle, debit spreads
    const debitSet = new Set([
      "Long Call",
      "Long Put",
      "Bull Call Spread",
      "Bear Put Spread",
      "Long Straddle",
      "Long Strangle",
    ]);
    const isDebit = debitSet.has(calc.strategyType);
    return {
      perContract: result.maxRisk,
      isDebit,
      oneContractCalc: result,
    };
  } catch {
    return { perContract: 0, isDebit: true, oneContractCalc: null };
  }
}

export function computeOptionsSizing(input: SizingInput): SizingResult {
  const warnings: SizingWarning[] = [];
  const accountBalance = Math.max(0, input.accountBalance || 0);
  const riskPct = Math.max(0, input.riskPct || 0);
  const riskDollarBudget = (accountBalance * riskPct) / 100;

  const { perContract, isDebit, oneContractCalc } = maxRiskPerContractFor(
    input.calc,
  );

  if (!accountBalance || !riskPct || !perContract) {
    warnings.push({
      kind: "invalid_inputs",
      message:
        "Enter account balance, risk %, and a valid strategy to compute sizing.",
    });
  }

  const contracts =
    perContract > 0 ? Math.floor(riskDollarBudget / perContract) : 0;

  // Minimum risk % that yields ≥1 contract
  const minRiskPctForOneContract =
    accountBalance > 0 && perContract > 0
      ? Math.ceil((perContract / accountBalance) * 100)
      : 0;

  if (contracts < 1 && perContract > 0 && accountBalance > 0) {
    warnings.push({
      kind: "below_one_contract",
      message: `Risk % too small for even 1 contract. Increase to at least ${minRiskPctForOneContract}% or skip this trade.`,
      suggestedMinRiskPct: minRiskPctForOneContract,
    });
  }

  if (riskPct > 0 && riskPct < OPTIONS_MIN_RECOMMENDED_RISK_PCT) {
    warnings.push({
      kind: "options_risk_floor",
      message:
        "Options sizing typically works best with 3–10% risk per trade minimum.",
    });
  }

  // Re-run engine with chosen contract count for position-level numbers.
  let positionCalc: OptionsCalcResult | null = null;
  if (contracts >= 1) {
    try {
      positionCalc = calculateOptionsPnL({
        ...(input.calc as CalcInput),
        contracts,
      });
    } catch {
      positionCalc = null;
    }
  } else {
    positionCalc = oneContractCalc;
  }

  const maxRisk = positionCalc?.maxRisk ?? 0;
  const maxProfit = positionCalc?.maxProfit ?? 0;
  const breakEven = positionCalc?.breakEven ?? 0;
  const rrRatio = positionCalc?.rrRatio ?? 0;

  // Commission: open + close, all legs
  const legs =
    input.legsPerContract ?? legCountForStrategy(input.calc.strategyType);
  const commissionPerSide =
    input.commissionPerContractPerSide ??
    DEFAULT_COMMISSION_PER_CONTRACT_PER_SIDE;
  const commissionEstimate =
    Math.max(1, contracts) * legs * commissionPerSide * 2;

  // Concentration check
  const concentrationPct =
    accountBalance > 0 ? (maxRisk / accountBalance) * 100 : 0;
  if (contracts >= 1 && concentrationPct > CONCENTRATION_THRESHOLD_PCT) {
    warnings.push({
      kind: "concentration",
      message: `CONCENTRATION: This position is ${concentrationPct.toFixed(1)}% of your account. Consider reducing to 1 contract.`,
      concentrationPct,
    });
  }

  return {
    contracts,
    riskDollarBudget,
    maxRiskPerContract: perContract,
    maxRisk,
    maxProfit,
    breakEven,
    rrRatio,
    commissionEstimate,
    warnings,
    isDebit,
    minRiskPctForOneContract,
    concentrationPct,
    calc: positionCalc,
  };
}
