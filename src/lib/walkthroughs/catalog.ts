import {
  Compass,
  ClipboardList,
  BarChart3,
  Sparkles,
  Layers,
  Activity,
  Shield,
  CalendarRange,
  Brain,
  Zap,
  TrendingUp,
} from "lucide-react";
import type { Walkthrough } from "./types";
import type { TradingMode } from "@/lib/tradingMode";

// ────────────────────────────────────────────────────────────────────────────
// SHARED tours — appear in both Futures and Options walkthrough menus.
// ────────────────────────────────────────────────────────────────────────────

const APP_OVERVIEW: Walkthrough = {
  id: "app-overview",
  title: "Full app tour",
  description: "Detailed walk through every main screen in both Futures and Options modes.",
  icon: Compass,
  steps: [
    {
      route: "/",
      title: "Welcome to EdgeTrader",
      body: "EdgeTrader is two trading cockpits in one app — a Futures floor and an Options desk. This tour walks you through both. Exit anytime with the X or Escape.",
    },
    {
      route: "/",
      selector: '[data-tour="app-mode-toggle"]',
      title: "Mode switch lives here",
      body: "Tap the EDGE TRADER badge in the header at any time to swap between FUTURES and OPTIONS. A small dot appears when the other mode has something worth checking.",
      placement: "bottom",
    },
    // ── FUTURES leg ──────────────────────────────────────────────────────
    {
      setMode: "futures",
      route: "/",
      title: "Futures mode — Trading Floor",
      body: "We just switched you into Futures. The dashboard shows your live execution data: balance, contracts, P&L per session.",
    },
    {
      route: "/",
      selector: '[data-tour="dashboard-balance"]',
      title: "Live balance & challenge progress",
      body: "Your running balance updates the moment a trade is logged. The bar tracks progress toward your challenge target.",
    },
    {
      route: "/",
      selector: '[data-tour="dashboard-stats"]',
      title: "Futures stats strip",
      body: "Win rate, expectancy, average R, and streaks for the current challenge.",
    },
    {
      route: "/",
      selector: '[data-tour="new-trade-fab"]',
      title: "Quick Log — log a contract",
      body: "Tap + anywhere to record a futures trade in seconds. Position size is auto-calculated from your risk %.",
      placement: "top",
    },
    {
      setMode: "futures",
      route: "/trade-log",
      title: "Futures Trade Log",
      body: "Every saved contract with filters, setup-edge analytics, Edge Health, and Exit Analytics — only futures show here while in Futures mode.",
    },
    {
      setMode: "futures",
      route: "/playbook",
      title: "Setup Playbook",
      body: "Save the filter combos that actually print — instrument, time-of-day, setup tag — and track each entry's live health.",
    },
    // ── OPTIONS leg ──────────────────────────────────────────────────────
    {
      setMode: "options",
      route: "/",
      title: "Options mode — Options Desk",
      body: "Same app, different cockpit. The dashboard now centers on Greeks, IV, expirations, and open spreads.",
    },
    {
      route: "/",
      selector: '[data-tour="options-dashboard-summary"]',
      title: "Options balance & target",
      body: "Options balance is tracked independently from futures, with its own starting balance and challenge target.",
    },
    {
      route: "/",
      selector: '[data-tour="new-options-fab"]',
      title: "New Options Trade",
      body: "Open the position sheet to log spreads, condors, calls or puts. Strategy, legs, IVR snapshot and net debit/credit are all captured.",
    },
    {
      setMode: "options",
      route: "/trade-log",
      title: "Options Positions",
      body: "The same Trade Log screen — but in Options mode it shows positions, 0DTE module, Credit Spread manager, Earnings plays, IVR tracker, and theta.",
    },
    {
      setMode: "options",
      route: "/playbook",
      title: "Strategy Playbook + AI scan",
      body: "Catalog spreads and earnings plays by regime + IVR. Use the AI scan to discover edges across your options history.",
    },
    // ── SHARED tools ─────────────────────────────────────────────────────
    {
      route: "/",
      selector: '[data-tour="edgecoach-fab"]',
      title: "EdgeCoach AI — adapts to mode",
      body: "The coach reads whichever mode is active: pit-boss tone for futures, IV/Greeks strategist for options.",
      placement: "top",
    },
    {
      route: "/chart-analyzer",
      title: "Chart Analyzer",
      body: "Snap any chart for an AI breakdown of trend, setup, and suggested levels. Works for both modes.",
    },
    {
      selector: '[data-tour="nav-/settings"]',
      title: "Settings & replays",
      body: "Manage your challenge, risk rules, notifications, and replay any of these walkthroughs whenever you need.",
      placement: "top",
    },
    {
      route: "/",
      title: "You're set",
      body: "Tap the EDGE TRADER badge in the header to toggle modes any time. The menu of walkthroughs in Settings is different for each mode — explore the one you're trading.",
    },
  ],
};

const CHART_ANALYZER: Walkthrough = {
  id: "chart-analyzer",
  title: "Chart Analyzer",
  description: "Upload a chart screenshot and get an AI breakdown.",
  icon: BarChart3,
  steps: [
    {
      route: "/chart-analyzer",
      title: "Upload a chart",
      body: "Snap or paste a chart screenshot. Include the price axis and at least 50 candles for the best results.",
    },
    {
      route: "/chart-analyzer",
      title: "Read the analysis",
      body: "The AI returns the trend, setup, suggested entry/stop/target, and a quality score.",
    },
    {
      route: "/chart-analyzer",
      title: "Execute from analysis",
      body: "One tap pre-fills the trade form (futures or options, depending on your active mode) with the suggested levels.",
    },
  ],
};

const EDGECOACH: Walkthrough = {
  id: "edgecoach",
  title: "EdgeCoach AI",
  description: "Your personal coach — reads your trades and answers in the active mode's voice.",
  icon: Brain,
  steps: [
    {
      route: "/",
      selector: '[data-tour="edgecoach-fab"]',
      title: "Open EdgeCoach",
      body: "Tap the chat bubble to open the coach. It pulls your real trades into context.",
      placement: "top",
    },
    {
      title: "Mode-aware persona",
      body: "In Futures it talks like a pit boss — tactical and scalper-flavored. In Options it shifts to a strategist focused on IV, Greeks, and structure.",
    },
    {
      title: "Ask anything",
      body: "\"Where am I leaking R?\", \"Best day of week for MES longs?\", \"Which credit spreads have negative EV?\" — it answers from your data.",
    },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// FUTURES-only tours
// ────────────────────────────────────────────────────────────────────────────

const FUTURES_LOG_TRADE: Walkthrough = {
  id: "futures-log-trade",
  title: "Log a futures trade",
  description: "Record a contract from the trading floor in under 30 seconds.",
  icon: ClipboardList,
  steps: [
    {
      setMode: "futures",
      route: "/",
      selector: '[data-tour="new-trade-fab"]',
      title: "Open Quick Log",
      body: "Tap the green + button to open the futures trade sheet.",
      placement: "top",
    },
    {
      title: "Pick your instrument",
      body: "MES, MNQ, MGC, MCL — defaults to your primary instrument from Settings.",
    },
    {
      title: "Long or short",
      body: "Long if you're buying, Short if you're selling.",
    },
    {
      title: "Entry / Stop / Target",
      body: "Enter the fill, stop, and target. Contract size is calculated from your account-risk % — no math required.",
    },
    {
      title: "Mark outcome",
      body: "Win, Loss, or Breakeven. P&L hits your balance immediately on save.",
    },
    {
      setMode: "futures",
      route: "/trade-log",
      title: "Review",
      body: "Your new trade appears at the top of the Trade Log with filters, inline editing, and setup analytics underneath.",
    },
  ],
};

const FUTURES_TRADE_LOG: Walkthrough = {
  id: "futures-trade-log",
  title: "Trade Log & Setup edge",
  description: "Filter trades, find which setups print, and watch edge health drift.",
  icon: Activity,
  steps: [
    {
      setMode: "futures",
      route: "/trade-log",
      title: "Filter tabs",
      body: "All / Wins / Losses, instrument selector, date filter, and sort — all scoped to futures.",
    },
    {
      route: "/trade-log",
      title: "Edge Health Score",
      body: "A composite score that fires red when your edge is decaying so you can pull back before damage piles up.",
    },
    {
      route: "/trade-log",
      title: "Setup Performance Breakdown",
      body: "Win rate, expectancy, and average R per setup tag. Drop the losers, double the winners.",
    },
    {
      route: "/trade-log",
      title: "Exit Analytics",
      body: "How close did you get to max favorable excursion? Where do your stops actually hit?",
    },
  ],
};

const FUTURES_SETUP_ADVISOR: Walkthrough = {
  id: "futures-setup-advisor",
  title: "Setup Advisor (ORB & VWAP)",
  description: "Plan ORB and VWAP-reclaim trades with levels before the bell.",
  icon: TrendingUp,
  steps: [
    {
      setMode: "futures",
      route: "/setup-advisor",
      title: "ORB builder",
      body: "Punch in the opening range, get entries, stops, and targets calculated automatically.",
    },
    {
      route: "/setup-advisor",
      title: "VWAP reclaim builder",
      body: "Build a reclaim plan with anchor level, invalidation, and R multiples.",
    },
    {
      route: "/setup-advisor",
      title: "Send to Quick Log",
      body: "Once a setup triggers, one tap pre-fills the trade sheet with the planned levels.",
    },
  ],
};

const FUTURES_RISK: Walkthrough = {
  id: "futures-risk",
  title: "Risk-of-Ruin & Scaling",
  description: "Size risk per trade and plan how you scale contracts as you grow.",
  icon: Shield,
  steps: [
    {
      setMode: "futures",
      route: "/risk-of-ruin",
      title: "Risk-of-Ruin calculator",
      body: "Plug in win rate, R-multiple, and risk % to see your blow-up probability.",
    },
    {
      route: "/scaling-plan",
      title: "Scaling tiers",
      body: "Plan how many contracts you trade at each balance tier — and lock the rules before greed takes over.",
    },
    {
      route: "/prop-firms",
      title: "Prop-firm constraints",
      body: "Configure daily-loss and trailing-drawdown rules per firm; the dashboard will warn you before you violate them.",
    },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// OPTIONS-only tours
// ────────────────────────────────────────────────────────────────────────────

const OPTIONS_OPEN_POSITION: Walkthrough = {
  id: "options-open-position",
  title: "Open your first position",
  description: "Log a spread, condor, or single-leg play with the options sheet.",
  icon: ClipboardList,
  steps: [
    {
      setMode: "options",
      route: "/",
      selector: '[data-tour="new-options-fab"]',
      title: "Open New Options Trade",
      body: "Tap the New Options Trade button on the dashboard to start logging a position.",
      placement: "top",
    },
    {
      title: "Pick a strategy",
      body: "Long call/put, vertical spread, iron condor, calendar — the sheet adapts legs and Greeks per strategy.",
    },
    {
      title: "Underlying & legs",
      body: "Set the underlying, expiration, strikes, and quantities. Net debit/credit calculates automatically.",
    },
    {
      title: "IVR snapshot",
      body: "Current IVR is captured at entry so you can later filter by high-IV credit plays vs low-IV debit plays.",
    },
    {
      title: "Save & track",
      body: "Position appears in Open Positions until you close it. Then it rolls into stats and the IVR performance tracker.",
    },
  ],
};

const OPTIONS_PLAYBOOK: Walkthrough = {
  id: "options-playbook",
  title: "Strategy Playbook + AI scan",
  description: "Catalog spreads by regime + IVR, and let AI discover edges in your history.",
  icon: Layers,
  steps: [
    {
      setMode: "options",
      route: "/playbook",
      title: "Filters & live results",
      body: "Dial in IVR range, DTE, strategy, debit/credit — the live results card shows win rate, % max profit, EV.",
    },
    {
      route: "/playbook",
      title: "AI scan",
      body: "Tap AI scan to surface combinations you haven't tried — it reads your closed positions and ranks edges.",
    },
    {
      route: "/playbook",
      title: "Save as playbook entry",
      body: "Lock the winning filter set as an entry with a baseline. The card monitors live health and labels it Healthy, Softening, or Degrading.",
    },
    {
      route: "/playbook",
      title: "Status switcher",
      body: "Toggle entries between Active, Testing, and Retired so your live edge list stays clean.",
    },
  ],
};

const OPTIONS_IVR_GREEKS: Walkthrough = {
  id: "options-ivr-greeks",
  title: "IVR, Greeks & risk",
  description: "Portfolio Greeks, daily theta, IVR history and the options risk dashboard.",
  icon: Activity,
  steps: [
    {
      setMode: "options",
      route: "/options-risk",
      title: "Options Risk dashboard",
      body: "Portfolio delta, gamma, theta, vega and worst-case loss across all open positions.",
    },
    {
      setMode: "options",
      route: "/",
      title: "Daily theta card",
      body: "Back on the dashboard, the daily theta card shows what your book earns just by holding through today.",
    },
    {
      setMode: "options",
      route: "/trade-log",
      title: "IVR history & performance",
      body: "Inside Positions you'll find the IVR history chart and the IVR performance tracker — see which IV regimes you actually win in.",
    },
  ],
};

const OPTIONS_0DTE_EARNINGS: Walkthrough = {
  id: "options-0dte-earnings",
  title: "0DTE, Earnings & Spreads",
  description: "Specialty options modules: zero-DTE, earnings plays, and credit spreads.",
  icon: Zap,
  steps: [
    {
      setMode: "options",
      route: "/trade-log",
      title: "Zero-DTE module",
      body: "Tracks same-day expiration plays with their own win rate, average duration, and risk warnings.",
    },
    {
      route: "/trade-log",
      title: "Credit Spread manager",
      body: "All open credit spreads in one card with % max profit, days to expiration, and one-tap close.",
    },
    {
      route: "/trade-log",
      title: "Earnings calendar & plays",
      body: "Browse upcoming earnings, tag plays, and let Earnings Play Stats tell you whether your earnings book is +EV.",
    },
  ],
};

const OPTIONS_WEEKLY: Walkthrough = {
  id: "options-weekly",
  title: "Options Week in Review",
  description: "Weekly AI debrief tuned for options structure, IV, and Greeks.",
  icon: CalendarRange,
  steps: [
    {
      setMode: "options",
      route: "/weekly-debrief",
      title: "Generate the debrief",
      body: "On weekends, generate an AI debrief covering IV regime, strategy mix, and theta capture for the week.",
    },
    {
      route: "/weekly-debrief",
      title: "P&L attribution",
      body: "See how much of your weekly P&L came from direction vs IV crush vs theta.",
    },
    {
      route: "/weekly-debrief",
      title: "Next-week focus",
      body: "The debrief ends with a single focus item — usually a strategy to lean into or one to pause.",
    },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export const WALKTHROUGHS_SHARED: Walkthrough[] = [APP_OVERVIEW, CHART_ANALYZER, EDGECOACH];
export const WALKTHROUGHS_FUTURES: Walkthrough[] = [
  FUTURES_LOG_TRADE,
  FUTURES_TRADE_LOG,
  FUTURES_SETUP_ADVISOR,
  FUTURES_RISK,
];
export const WALKTHROUGHS_OPTIONS: Walkthrough[] = [
  OPTIONS_OPEN_POSITION,
  OPTIONS_PLAYBOOK,
  OPTIONS_IVR_GREEKS,
  OPTIONS_0DTE_EARNINGS,
  OPTIONS_WEEKLY,
];

/** Tag each walkthrough with its `mode` so consumers can filter. */
function tag(list: Walkthrough[], mode: TradingMode | undefined): Walkthrough[] {
  return list.map((w) => (mode ? { ...w, mode } : w));
}

/** All walkthroughs in a flat list — kept for back-compat. */
export const WALKTHROUGHS: Walkthrough[] = [
  ...WALKTHROUGHS_SHARED,
  ...tag(WALKTHROUGHS_FUTURES, "futures"),
  ...tag(WALKTHROUGHS_OPTIONS, "options"),
];

/** Returns shared + mode-specific tours for the active mode. */
export function getWalkthroughsForMode(mode: TradingMode): Walkthrough[] {
  const specific = mode === "options" ? WALKTHROUGHS_OPTIONS : WALKTHROUGHS_FUTURES;
  return [...WALKTHROUGHS_SHARED, ...tag(specific, mode)];
}

export function getWalkthrough(id: string): Walkthrough | undefined {
  return WALKTHROUGHS.find((w) => w.id === id);
}