import type { LucideIcon } from "lucide-react";

export type WalkthroughStep = {
  /** CSS selector for the element to highlight. Use `[data-tour="..."]`. */
  selector?: string;
  title: string;
  body: string;
  /** Route to navigate to before showing this step (TanStack route path). */
  route?: string;
  /** Tooltip placement preference. */
  placement?: "auto" | "top" | "bottom";
};

export type Walkthrough = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  steps: WalkthroughStep[];
};