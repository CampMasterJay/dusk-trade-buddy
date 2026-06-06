import { Compass, ClipboardList, BarChart3, Sparkles } from "lucide-react";
import type { Walkthrough } from "./types";

export const WALKTHROUGHS: Walkthrough[] = [
  {
    id: "app-overview",
    title: "App overview",
    description: "A quick tour of the dashboard and the main navigation.",
    icon: Compass,
    steps: [
      {
        route: "/",
        title: "Welcome to EdgeTrader",
        body: "Let's take a 60-second tour of the app. You can exit anytime with the X.",
      },
      {
        route: "/",
        selector: '[data-tour="dashboard-balance"]',
        title: "Your balance & progress",
        body: "This is your live account balance. It updates automatically as you log trades.",
      },
      {
        route: "/",
        selector: '[data-tour="dashboard-stats"]',
        title: "Performance stats",
        body: "Win rate, P&L, and streaks for your current challenge — at a glance.",
      },
      {
        route: "/",
        selector: '[data-tour="new-trade-fab"]',
        title: "Log a new trade",
        body: "Tap the + button anywhere to record a trade quickly.",
        placement: "top",
      },
      {
        selector: '[data-tour="nav-/"]',
        title: "Bottom navigation",
        body: "Use the bottom bar to switch between Dashboard, Analyzer, Setups, Trade Log, News, and Settings.",
        placement: "top",
      },
      {
        selector: '[data-tour="nav-/settings"]',
        title: "Settings",
        body: "Manage your challenge, risk rules, notifications, and replay these walkthroughs anytime.",
        placement: "top",
      },
    ],
  },
  {
    id: "log-a-trade",
    title: "Log a trade",
    description: "How to record a trade quickly from the dashboard.",
    icon: ClipboardList,
    steps: [
      {
        route: "/",
        selector: '[data-tour="new-trade-fab"]',
        title: "Open the trade sheet",
        body: "Tap the green Quick Log button to open the trade form.",
        placement: "top",
      },
      {
        title: "Pick your instrument",
        body: "Choose the symbol you're trading (MES, MNQ, etc.). It defaults to your primary instrument.",
      },
      {
        title: "Long or short",
        body: "Tap Long if you're buying, Short if you're selling.",
      },
      {
        title: "Entry / Stop / Target",
        body: "Enter your fill, stop loss, and target. Position size is calculated automatically from your risk %.",
      },
      {
        title: "Mark the outcome",
        body: "Win, Loss, or Breakeven. P&L updates your balance immediately on save.",
      },
      {
        route: "/trade-log",
        title: "Review in Trade Log",
        body: "All your saved trades live here, with filters and inline editing.",
      },
    ],
  },
  {
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
        body: "One tap pre-fills the trade form with the suggested levels so you can log it instantly.",
      },
    ],
  },
  {
    id: "all-other-features",
    title: "All other features",
    description: "Setup Advisor, News, Game Plan, and the Weekly Debrief.",
    icon: Sparkles,
    steps: [
      {
        route: "/setup-advisor",
        title: "Setup Advisor",
        body: "Build ORB and VWAP reclaim plans with calculated entries, stops, and targets before the bell.",
      },
      {
        route: "/news",
        title: "News & high-impact events",
        body: "Browse market news, save articles, and get banners when high-impact events are minutes away.",
      },
      {
        route: "/game-plan",
        title: "Daily Game Plan",
        body: "Set your bias, planned setups, and key levels each morning — then score compliance at the end of day.",
      },
      {
        route: "/weekly-debrief",
        title: "Weekly Debrief",
        body: "On weekends, generate an AI debrief covering strengths, weaknesses, patterns, and next week's focus.",
      },
    ],
  },
];

export function getWalkthrough(id: string): Walkthrough | undefined {
  return WALKTHROUGHS.find((w) => w.id === id);
}