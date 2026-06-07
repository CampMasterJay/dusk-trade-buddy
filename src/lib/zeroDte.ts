import { supabase } from "@/integrations/supabase/client";

export type ZeroDteRow = {
  id: string;
  underlying: string;
  strategy_type: string | null;
  status: string;
  trade_date: string;
  is_debit: boolean;
  is_0dte: boolean;
  leg1_contracts: number;
  premium_paid_or_received: number | null;
  max_risk: number | null;
  net_pnl: number | null;
  created_at: string;
  updated_at: string;
};

/** Minutes until 4:00 PM ET ("America/New_York") for the current instant. */
export function minutesUntilMarketClose(now: Date = new Date()): number {
  // Get current time in NY
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const h = get("hour");
  const m = get("minute");
  const s = get("second");
  const nowMin = h * 60 + m + s / 60;
  const closeMin = 16 * 60; // 4 PM ET
  return closeMin - nowMin;
}

export type UrgencyTier = {
  level: "pre" | "morning" | "afternoon" | "late" | "critical" | "closed";
  label: string;
  tone: "green" | "amber" | "red" | "muted";
  pulse: boolean;
  message: string;
};

export function urgencyFromMinutes(mins: number): UrgencyTier {
  if (mins <= 0)
    return {
      level: "closed",
      label: "Market closed",
      tone: "muted",
      pulse: false,
      message: "Cash settled — all 0DTE options expired.",
    };
  if (mins <= 15)
    return {
      level: "critical",
      label: "EXIT NOW",
      tone: "red",
      pulse: true,
      message: `Positions expire in ${Math.ceil(mins)} min. Close or accept full loss.`,
    };
  if (mins <= 60)
    return {
      level: "late",
      label: "Manage / exit",
      tone: "red",
      pulse: true,
      message: "Final hour — high gamma. Close winners, cut losers.",
    };
  if (mins <= 120)
    return {
      level: "afternoon",
      label: "High gamma",
      tone: "red",
      pulse: false,
      message: "2 PM – 3 PM ET. Manage active positions.",
    };
  if (mins <= 240)
    return {
      level: "afternoon",
      label: "Theta acceleration",
      tone: "amber",
      pulse: false,
      message: "12 PM – 2 PM ET. Theta decay accelerates.",
    };
  // Determine morning vs pre based on NY hour
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
  });
  const hr = Number(fmt.formatToParts(new Date()).find((p) => p.type === "hour")?.value ?? 0);
  if (hr < 10)
    return {
      level: "pre",
      label: "Full day",
      tone: "green",
      pulse: false,
      message: "Before 10 AM ET — full session ahead.",
    };
  return {
    level: "morning",
    label: "Morning session",
    tone: "green",
    pulse: false,
    message: "Good liquidity, normal 0DTE conditions.",
  };
}

export function formatCountdown(mins: number): string {
  if (mins <= 0) return "00:00";
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  const s = Math.floor((mins - Math.floor(mins)) * 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function fetchZeroDteTrades(): Promise<ZeroDteRow[]> {
  const { data, error } = await supabase
    .from("options_trades")
    .select(
      "id, underlying, strategy_type, status, trade_date, is_debit, is_0dte, leg1_contracts, premium_paid_or_received, max_risk, net_pnl, created_at, updated_at",
    )
    .eq("is_0dte", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ZeroDteRow[];
}

export type ZeroDteStats = {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgHoldMinutes: number;
  totalPnl: number;
  verdict: string | null;
  verdictTone: "green" | "amber" | "red" | "muted";
};

export function aggregateZeroDte(rows: ZeroDteRow[]): ZeroDteStats {
  const closed = rows.filter((r) => r.status !== "Open" && r.net_pnl != null);
  const wins = closed.filter((r) => (r.net_pnl ?? 0) > 0).length;
  const losses = closed.filter((r) => (r.net_pnl ?? 0) < 0).length;
  const totalPnl = closed.reduce((s, r) => s + (Number(r.net_pnl) || 0), 0);
  const holdMinutes = closed.map((r) => {
    const open = new Date(r.created_at).getTime();
    const close = new Date(r.updated_at).getTime();
    return Math.max(0, (close - open) / 60000);
  });
  const avgHold = holdMinutes.length
    ? holdMinutes.reduce((a, b) => a + b, 0) / holdMinutes.length
    : 0;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;

  let verdict: string | null = null;
  let tone: ZeroDteStats["verdictTone"] = "muted";
  if (closed.length >= 20) {
    if (totalPnl < 0) {
      verdict =
        "Your 0DTE trading is unprofitable over 20+ trades. Consider eliminating until you have a proven 0DTE setup.";
      tone = "red";
    } else if (totalPnl > 0 && winRate >= 50) {
      verdict = "Sustained edge in 0DTE — keep size disciplined.";
      tone = "green";
    } else {
      verdict = "0DTE results mixed — review setup quality before scaling size.";
      tone = "amber";
    }
  }
  return {
    total: rows.length,
    wins,
    losses,
    winRate,
    avgHoldMinutes: avgHold,
    totalPnl,
    verdict,
    verdictTone: tone,
  };
}

/** Position size as percent of account given premium paid (debit) or max risk. */
export function positionSizePct(row: ZeroDteRow, accountBalance: number): number {
  if (!accountBalance) return 0;
  const contracts = row.leg1_contracts || 1;
  const risk = row.is_debit
    ? Math.abs(Number(row.premium_paid_or_received) || 0) * 100 * contracts
    : Math.abs(Number(row.max_risk) || 0);
  return (risk / accountBalance) * 100;
}