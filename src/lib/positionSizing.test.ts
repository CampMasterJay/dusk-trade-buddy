import { describe, it, expect } from "vitest";
import {
  computePositionSize,
  computeCompoundingProjection,
} from "./positionSizing";

describe("computePositionSize", () => {
  it("computes risk dollars from balance and risk%", () => {
    const r = computePositionSize({
      balance: 10_000,
      riskPct: 1,
      stopDistance: 5,
      tickValue: 5, // e.g. ES = $5/tick at 0.25? — use simple values
    });
    expect(r.riskDollars).toBe(100);
    // contracts = floor(100 / (5 * 5)) = floor(4) = 4
    expect(r.contracts).toBe(4);
    expect(r.maxLoss).toBe(100);
  });

  it("defaults tickValue to 1 when omitted", () => {
    const r = computePositionSize({
      balance: 5_000,
      riskPct: 2,
      stopDistance: 10,
    });
    expect(r.riskDollars).toBe(100);
    expect(r.contracts).toBe(10); // floor(100 / 10)
  });

  it("rounds contracts down to a whole number", () => {
    const r = computePositionSize({
      balance: 1_000,
      riskPct: 1,
      stopDistance: 3,
      tickValue: 1,
    });
    // risk = 10, riskPerContract = 3 → floor(10/3) = 3
    expect(r.contracts).toBe(3);
    expect(r.maxLoss).toBe(9);
  });

  it("returns 0 contracts when stop distance is zero or negative", () => {
    const r = computePositionSize({
      balance: 10_000,
      riskPct: 1,
      stopDistance: 0,
      tickValue: 5,
    });
    expect(r.contracts).toBe(0);
    expect(r.maxLoss).toBe(0);
  });
});

describe("computeCompoundingProjection", () => {
  it("includes a row 0 snapshot of the current balance", () => {
    const r = computeCompoundingProjection({
      currentBalance: 1_000,
      targetBalance: 2_000,
      riskPct: 1,
      rrRatio: 2,
    });
    expect(r.rows[0]).toMatchObject({
      win: 0,
      balance: 1_000,
      risk: 10, // 1% of 1000
      winTarget: 20, // risk * rrRatio
    });
  });

  it("compounds the win amount into the next risk calculation", () => {
    const r = computeCompoundingProjection({
      currentBalance: 1_000,
      targetBalance: 1_000_000, // never hit, so we get a long series
      riskPct: 1,
      rrRatio: 2,
      maxWins: 3,
    });
    // After win 1: balance 1020, after win 2: 1020 + 20.4 = 1040.4, after win 3: 1040.4 + 20.808 = 1061.208
    expect(r.rows[1].balance).toBeCloseTo(1020, 5);
    expect(r.rows[2].balance).toBeCloseTo(1040.4, 5);
    expect(r.rows[3].balance).toBeCloseTo(1061.208, 3);
    expect(r.hitTarget).toBe(false);
    expect(r.winsNeeded).toBe(3);
  });

  it("reports hitTarget=true and exact winsNeeded when target is reached", () => {
    // balance grows by 2% each win (1% risk * 2R). 1.02^n ≥ 1.5 → n = 21
    const r = computeCompoundingProjection({
      currentBalance: 1_000,
      targetBalance: 1_500,
      riskPct: 1,
      rrRatio: 2,
    });
    expect(r.hitTarget).toBe(true);
    expect(r.winsNeeded).toBe(21);
    const last = r.rows[r.rows.length - 1];
    expect(last.balance).toBeGreaterThanOrEqual(1_500);
  });
});