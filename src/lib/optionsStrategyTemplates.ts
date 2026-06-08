// Curated starter playbook entries for options traders. Each template seeds
// the OptionsPlaybookBuilder filter panel and a suggested name/notes block,
// so a brand-new user can save a playbook entry without trade history.

import type { LucideIcon } from "lucide-react";
import {
  Anchor,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Diamond,
  Flame,
  LineChart,
  Mountain,
  Rocket,
  Shield,
  Sparkles,
  Wind,
  Zap,
} from "lucide-react";

export type TemplateBucket = "high-ivr" | "low-ivr" | "neutral";

export type OptionsTemplateFilters = {
  underlyings?: string[];
  strategies?: string[];
  regimes?: string[];
  ivrRange?: [number, number];
  dteRange?: [number, number];
  vixRange?: [number, number];
  daysToAvoid?: number[];
  checklistMin?: number;
  direction?: "Debit" | "Credit" | "Both";
  deltaBand?: [number, number];
  maxThetaPerDay?: number;
  maxVega?: number;
  pctMaxRange?: [number, number];
  earnings?: "Hold" | "Avoid" | "Either";
};

export type OptionsTemplate = {
  id: string;
  bucket: TemplateBucket;
  icon: LucideIcon;
  name: string;
  blurb: string;
  notes: string;
  filters: OptionsTemplateFilters;
};

export const OPTIONS_TEMPLATES: OptionsTemplate[] = [
  // ───── HIGH-IVR CREDIT (seller bias) ─────
  {
    id: "ic-45dte",
    bucket: "high-ivr",
    icon: Mountain,
    name: "Iron Condor · 45 DTE · High IVR",
    blurb: "Premium-rich, range-bound. Sell wings, manage at 25–50% max.",
    notes:
      "Open with IVR > 60. 15–20Δ short strikes, 45 DTE. Take profit at 50% of max credit. Roll or close at 21 DTE.",
    filters: {
      strategies: ["Iron Condor"],
      direction: "Credit",
      ivrRange: [60, 100],
      dteRange: [30, 60],
      deltaBand: [-0.2, 0.2],
      pctMaxRange: [25, 100],
      earnings: "Avoid",
    },
  },
  {
    id: "bull-put-credit",
    bucket: "high-ivr",
    icon: Shield,
    name: "Bull Put Credit Spread · 30–45 DTE",
    blurb: "Bullish, high IVR. Sell support, define risk on the floor.",
    notes:
      "30Δ short put at/below support, 5–10 wide. Close at 50% credit. Stop if short delta doubles.",
    filters: {
      strategies: ["Bull Put Spread", "Put Credit Spread"],
      direction: "Credit",
      ivrRange: [40, 100],
      dteRange: [25, 50],
      deltaBand: [0.1, 0.45],
      earnings: "Avoid",
    },
  },
  {
    id: "bear-call-credit",
    bucket: "high-ivr",
    icon: Wind,
    name: "Bear Call Credit Spread · 30–45 DTE",
    blurb: "Bearish, high IVR. Sell resistance, capped upside risk.",
    notes:
      "30Δ short call at/above resistance, 5–10 wide. Take 50%. Stop at 2× credit.",
    filters: {
      strategies: ["Bear Call Spread", "Call Credit Spread"],
      direction: "Credit",
      ivrRange: [40, 100],
      dteRange: [25, 50],
      deltaBand: [-0.45, -0.1],
      earnings: "Avoid",
    },
  },
  {
    id: "covered-call",
    bucket: "high-ivr",
    icon: CircleDollarSign,
    name: "Covered Call · 30–45 DTE",
    blurb: "Long stock + sold OTM call. Income on holdings.",
    notes:
      "Sell 20–30Δ call ~30 DTE on shares you'd be glad to part with. Roll up-and-out near expiration.",
    filters: {
      strategies: ["Covered Call"],
      direction: "Credit",
      ivrRange: [30, 100],
      dteRange: [21, 45],
    },
  },
  {
    id: "csp",
    bucket: "high-ivr",
    icon: Banknote,
    name: "Cash-Secured Put · 30–45 DTE",
    blurb: "Sell put on a name you'd own. Assignment = discount entry.",
    notes:
      "Sell 25–30Δ put on a strong underlying. Close at 50% or take assignment at the strike.",
    filters: {
      strategies: ["Cash Secured Put"],
      direction: "Credit",
      ivrRange: [30, 100],
      dteRange: [21, 45],
      deltaBand: [0.15, 0.4],
      earnings: "Avoid",
    },
  },

  // ───── LOW-IVR DEBIT (buyer bias) ─────
  {
    id: "long-call",
    bucket: "low-ivr",
    icon: Rocket,
    name: "Long Call · 30–60 DTE",
    blurb: "Directional bullish, cheap premium environment.",
    notes:
      "50–70Δ ITM/ATM call, 45 DTE+. Cut at -50% of debit. Roll or scale at +50% on the trade.",
    filters: {
      strategies: ["Long Call"],
      direction: "Debit",
      ivrRange: [0, 35],
      dteRange: [21, 60],
      deltaBand: [0.45, 0.85],
    },
  },
  {
    id: "long-put",
    bucket: "low-ivr",
    icon: LineChart,
    name: "Long Put · 30–60 DTE",
    blurb: "Directional bearish hedge or speculative downside.",
    notes:
      "50–70Δ put, 45 DTE+. Use for hedges or breakdowns. Cut at -50% debit.",
    filters: {
      strategies: ["Long Put"],
      direction: "Debit",
      ivrRange: [0, 35],
      dteRange: [21, 60],
      deltaBand: [-0.85, -0.45],
    },
  },
  {
    id: "bull-call-debit",
    bucket: "low-ivr",
    icon: Sparkles,
    name: "Bull Call Debit Spread · 30–45 DTE",
    blurb: "Bullish with defined risk, lower cost than long call.",
    notes:
      "Buy ATM call, sell 0.30Δ short, 5–10 wide. Manage at +50% intrinsic.",
    filters: {
      strategies: ["Bull Call Spread", "Call Debit Spread"],
      direction: "Debit",
      ivrRange: [0, 50],
      dteRange: [25, 50],
      deltaBand: [0.3, 0.75],
    },
  },
  {
    id: "bear-put-debit",
    bucket: "low-ivr",
    icon: Anchor,
    name: "Bear Put Debit Spread · 30–45 DTE",
    blurb: "Bearish with defined risk, lower cost than long put.",
    notes:
      "Buy ATM put, sell 0.30Δ short, 5–10 wide. Take +50% intrinsic.",
    filters: {
      strategies: ["Bear Put Spread", "Put Debit Spread"],
      direction: "Debit",
      ivrRange: [0, 50],
      dteRange: [25, 50],
      deltaBand: [-0.75, -0.3],
    },
  },
  {
    id: "long-straddle",
    bucket: "low-ivr",
    icon: Diamond,
    name: "Long Straddle · 30–60 DTE",
    blurb: "Volatility expansion play. Low IVR, expected catalyst.",
    notes:
      "Buy ATM call + put. Sized to small percentage of account. Exit on IV crush or directional break.",
    filters: {
      strategies: ["Long Straddle"],
      direction: "Debit",
      ivrRange: [0, 30],
      dteRange: [21, 60],
    },
  },
  {
    id: "long-strangle",
    bucket: "low-ivr",
    icon: Wind,
    name: "Long Strangle · 30–60 DTE",
    blurb: "Cheaper vol-expansion bet vs straddle. Wider breakevens.",
    notes:
      "Buy 25Δ call + 25Δ put. Time vol expansion. Cut at -50% combined debit.",
    filters: {
      strategies: ["Long Strangle"],
      direction: "Debit",
      ivrRange: [0, 30],
      dteRange: [21, 60],
    },
  },

  // ───── NEUTRAL / TACTICAL ─────
  {
    id: "0dte-iron-fly",
    bucket: "neutral",
    icon: Zap,
    name: "0DTE Iron Fly · SPX/SPY",
    blurb: "Same-day expiry pin play. Tight wings, hard rules.",
    notes:
      "ATM short straddle + far OTM wings. Risk capped. Only with clear range/pin thesis. Max 1–2 per day.",
    filters: {
      strategies: ["Iron Butterfly", "0DTE", "Iron Fly"],
      direction: "Credit",
      dteRange: [0, 1],
      deltaBand: [-0.15, 0.15],
      earnings: "Avoid",
    },
  },
  {
    id: "calendar",
    bucket: "neutral",
    icon: CalendarClock,
    name: "Calendar Spread · ATM",
    blurb: "Sell front, buy back — theta with positive vega.",
    notes:
      "Short 7–14 DTE, long 30–45 DTE same strike. Profits if underlying pins and front IV holds.",
    filters: {
      strategies: ["Calendar Spread", "Calendar"],
      ivrRange: [20, 60],
      dteRange: [7, 45],
    },
  },
  {
    id: "diagonal",
    bucket: "neutral",
    icon: Shield,
    name: "Diagonal Spread · Directional Income",
    blurb: "Long-dated long leg + rolling short premium.",
    notes:
      "Long 60+ DTE ITM call/put, short 14–21 DTE OTM same direction. Roll short weekly.",
    filters: {
      strategies: ["Diagonal Spread", "Diagonal"],
      dteRange: [14, 60],
    },
  },
  {
    id: "earnings-strangle",
    bucket: "neutral",
    icon: Flame,
    name: "Earnings Strangle · Pre-Print",
    blurb: "Position before earnings if expected move underprices.",
    notes:
      "Open T-1 to earnings. Compare expected move to ATM straddle pricing. Exit T+1 morning.",
    filters: {
      strategies: ["Long Strangle", "Earnings Strangle"],
      direction: "Debit",
      earnings: "Hold",
      dteRange: [0, 14],
    },
  },
];

export const TEMPLATE_BUCKET_LABEL: Record<TemplateBucket, string> = {
  "high-ivr": "High IVR · Credit Sellers",
  "low-ivr": "Low IVR · Debit Buyers",
  neutral: "Neutral · Tactical",
};