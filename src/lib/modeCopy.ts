// Per-mode terminology dictionary. Every label that differs between Futures
// and Options trading modes lives here so shared UI can swap copy by mode
// without conditionals scattered through the app.

import { useMemo } from "react";
import { useTradingMode, type TradingMode } from "./tradingMode";

export type ModeCopy = {
  modeLabel: string;
  tradeNoun: string;
  tradeNounPlural: string;
  newCta: string;
  instrumentLabel: string;
  sizeLabel: string;
  riskLabel: string;
  targetLabel: string;
  stopLabel: string;
  pnlLabel: string;
  dashboardTitle: string;
  dashboardSubtitle: string;
  playbookTitle: string;
  playbookSubtitle: string;
  tradeLogTitle: string;
  weeklyDebriefTitle: string;
  coachPersona: string;
  emptyStateTrades: string;
  /** Tailwind text color class for the mode accent. */
  accentText: string;
  /** Tailwind border color class for the mode accent. */
  accentBorder: string;
  /** Tailwind background tint class for the mode accent (subtle). */
  accentBg: string;
  /** CSS variable name pointing at the mode-accent OKLCH value. */
  accentVar: string;
};

const FUTURES: ModeCopy = {
  modeLabel: "Futures",
  tradeNoun: "Trade",
  tradeNounPlural: "Trades",
  newCta: "New Trade",
  instrumentLabel: "Instrument",
  sizeLabel: "Contracts",
  riskLabel: "Risk ($)",
  targetLabel: "Target",
  stopLabel: "Stop",
  pnlLabel: "P&L",
  dashboardTitle: "Trading Floor",
  dashboardSubtitle: "Live execution dashboard",
  playbookTitle: "Setup Playbook",
  playbookSubtitle: "Filter trades, find your edge, save winning setups.",
  tradeLogTitle: "Trade Log",
  weeklyDebriefTitle: "Weekly Trader Debrief",
  coachPersona: "Pit boss — tactical, scalper-flavored",
  emptyStateTrades: "No trades logged yet. Log your first contract.",
  accentText: "text-trade-green",
  accentBorder: "border-trade-green/40",
  accentBg: "bg-trade-green/10",
  accentVar: "--trade-green",
};

const OPTIONS: ModeCopy = {
  modeLabel: "Options",
  tradeNoun: "Position",
  tradeNounPlural: "Positions",
  newCta: "New Position",
  instrumentLabel: "Underlying",
  sizeLabel: "Contracts × Leg",
  riskLabel: "Max Risk / Net Debit",
  targetLabel: "Profit Target %",
  stopLabel: "Stop (% of credit/debit)",
  pnlLabel: "Net P&L",
  dashboardTitle: "Options Desk",
  dashboardSubtitle: "Greeks, IV & expirations",
  playbookTitle: "Strategy Playbook",
  playbookSubtitle: "Catalog spreads, condors, and earnings plays by regime + IVR.",
  tradeLogTitle: "Positions",
  weeklyDebriefTitle: "Options Week in Review",
  coachPersona: "Strategist — IV/Greeks-flavored",
  emptyStateTrades: "No positions yet. Open your first spread.",
  accentText: "text-trade-amber",
  accentBorder: "border-trade-amber/40",
  accentBg: "bg-trade-amber/10",
  accentVar: "--trade-amber",
};

export function getModeCopy(mode: TradingMode): ModeCopy {
  return mode === "options" ? OPTIONS : FUTURES;
}

export function useModeCopy(): ModeCopy {
  const [mode] = useTradingMode();
  return useMemo(() => getModeCopy(mode), [mode]);
}