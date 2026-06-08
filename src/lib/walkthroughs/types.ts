import type { LucideIcon } from "lucide-react";
import type { TradingMode } from "@/lib/tradingMode";

export type WalkthroughStep = {
  /** CSS selector for the element to highlight. Use `[data-tour="..."]`. */
  selector?: string;
  title: string;
  body: string;
  /** Route to navigate to before showing this step (TanStack route path). */
  route?: string;
  /** Tooltip placement preference. */
  placement?: "auto" | "top" | "bottom";
  /** If set, switch the app trading mode before resolving the step. */
  setMode?: TradingMode;
};

export type Walkthrough = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  steps: WalkthroughStep[];
  /** Restrict this tour to a specific mode. Omit for shared tours. */
  mode?: TradingMode;
};