import { describe, it, expect } from "vitest";
import { computeTradeStats } from "./tradeStats";

describe("computeTradeStats", () => {
  it("returns zeroed stats for an empty list", () => {
    const s = computeTradeStats([]);
    expect(s.totalTrades).toBe(0);
    expect(s.wins).toBe(0);
    expect(s.losses).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.ev).toBe(0);
    expect(s.totalPnl).toBe(0);
    expect(s.totalR).toBe(0);
  });

  it("computes win rate over decided trades only (excludes Breakeven)", () => {
    const s = computeTradeStats([
      { result: "Win", pnl: 200, r_multiple: 2 },
      { result: "Win", pnl: 100, r_multiple: 1 },
      { result: "Loss", pnl: -100, r_multiple: -1 },
      { result: "Breakeven", pnl: 0, r_multiple: 0 },
    ]);
    expect(s.totalTrades).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    // 2 wins / (2 wins + 1 loss) = 0.6666...
    expect(s.winRate).toBeCloseTo(2 / 3, 5);
  });

  it("computes totalPnl, totalR, and avg win/loss", () => {
    const s = computeTradeStats([
      { result: "Win", pnl: 200, r_multiple: 2 },
      { result: "Win", pnl: 100, r_multiple: 1 },
      { result: "Loss", pnl: -150, r_multiple: -1.5 },
    ]);
    expect(s.totalPnl).toBe(150);
    expect(s.totalR).toBeCloseTo(1.5, 5);
    expect(s.avgWin).toBe(150);
    expect(s.avgLoss).toBe(-150);
    expect(s.largestWin).toBe(200);
    expect(s.largestLoss).toBe(-150);
  });

  it("computes expected value (EV) per trade from win/loss frequencies and averages", () => {
    const s = computeTradeStats([
      { result: "Win", pnl: 200, r_multiple: 2 },
      { result: "Win", pnl: 200, r_multiple: 2 },
      { result: "Loss", pnl: -100, r_multiple: -1 },
      { result: "Loss", pnl: -100, r_multiple: -1 },
    ]);
    // 50% win-rate, avg win 200, avg loss -100 → EV = 0.5*200 + 0.5*-100 = 50
    expect(s.ev).toBeCloseTo(50, 5);
  });

  it("coerces string/null pnl values safely", () => {
    const s = computeTradeStats([
      { result: "Win", pnl: "150" as unknown as string, r_multiple: "1.5" as unknown as string },
      { result: "Loss", pnl: null, r_multiple: null },
    ]);
    expect(s.totalPnl).toBe(150);
    expect(s.totalR).toBeCloseTo(1.5, 5);
  });
});