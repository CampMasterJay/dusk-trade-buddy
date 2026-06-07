import { useMemo } from "react";
import {
  calculateOptionsPnL,
  type CalcInput,
  type OptionsCalcResult,
} from "@/lib/optionsPnLEngine";

/**
 * Reactively recalculates options P&L / risk metrics as inputs change.
 * Returns null if required fields are missing.
 */
export function useOptionsCalculator(
  input: Partial<CalcInput> | null | undefined,
): OptionsCalcResult | null {
  return useMemo(() => {
    if (!input || !input.strategyType || !input.leg1 || !input.contracts) {
      return null;
    }
    try {
      return calculateOptionsPnL(input as CalcInput);
    } catch {
      return null;
    }
  }, [input]);
}
