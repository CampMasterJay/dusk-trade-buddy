// Per-mode navigation registry. Futures and Options each expose a focused
// set of nav items so the bottom nav, drawer, and any future quick-jump menu
// only show what's relevant to the active market.

import {
  BarChart3,
  Building2,
  CalendarDays,
  CircleDot,
  Home,
  Layers,
  List,
  Newspaper,
  Settings,
  Shield,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { TradingMode } from "./tradingMode";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const FUTURES_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/chart-analyzer", label: "Analyzer", icon: BarChart3 },
  { to: "/setup-advisor", label: "Setups", icon: Target },
  { to: "/trade-log", label: "Trade Log", icon: List },
  { to: "/prop-firms", label: "Prop Firms", icon: Building2 },
  { to: "/news", label: "News", icon: Newspaper },
  { to: "/settings", label: "Settings", icon: Settings },
];

const OPTIONS_NAV: NavItem[] = [
  { to: "/", label: "Options Desk", icon: CircleDot },
  { to: "/chart-analyzer", label: "Analyzer", icon: BarChart3 },
  { to: "/playbook", label: "Strategy", icon: Layers },
  { to: "/trade-log", label: "Positions", icon: List },
  { to: "/options-risk", label: "Risk", icon: Shield },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function getNav(mode: TradingMode): NavItem[] {
  return mode === "options" ? OPTIONS_NAV : FUTURES_NAV;
}