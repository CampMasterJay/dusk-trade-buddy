import type { Trade } from "@/lib/tradeService";

export type RiskLevel = "none" | "yellow" | "red";

export type DrawdownStats = {
  peak: number;
  trough: number;
  current: number;
  currentDdPct: number;
  maxDdPct: number;
  consecutiveLosses: number;
  daysSinceWinningDay: number | null;
  level: RiskLevel;
  alertTitle: string | null;
  alertMessage: string | null;
  lockTrading: boolean;
  triggers: string[];
};

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

function orderedByDate(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return da - db;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export function computeDrawdown(
  trades: Trade[],
  startingBalance: number,
): DrawdownStats {
  const ordered = orderedByDate(trades);

  let balance = startingBalance;
  let peak = startingBalance;
  let trough = startingBalance;
  let maxDdPct = 0;

  for (const t of ordered) {
    balance += num(t.pnl);
    if (balance > peak) {
      peak = balance;
      trough = balance;
    }
    if (balance < trough) trough = balance;
    if (peak > 0) {
      const ddPct = ((peak - balance) / peak) * 100;
      if (ddPct > maxDdPct) maxDdPct = ddPct;
    }
  }

  const currentDdPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;

  // Consecutive losses (most recent)
  const decisive = [...ordered]
    .filter((t) => t.result === "Win" || t.result === "Loss")
    .reverse();
  let consecutiveLosses = 0;
  for (const t of decisive) {
    if (t.result === "Loss") consecutiveLosses += 1;
    else break;
  }

  // Days since last winning day (a day with positive net P&L)
  const byDay = new Map<string, number>();
  for (const t of ordered) {
    const d = (t.date ?? "").slice(0, 10);
    if (!d) continue;
    byDay.set(d, (byDay.get(d) ?? 0) + num(t.pnl));
  }
  const winningDays = [...byDay.entries()]
    .filter(([, pnl]) => pnl > 0)
    .map(([d]) => d)
    .sort();
  const lastWinDay = winningDays.length > 0 ? winningDays[winningDays.length - 1] : null;
  let daysSinceWinningDay: number | null = null;
  if (lastWinDay) {
    const lw = new Date(lastWinDay + "T00:00:00").getTime();
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
    daysSinceWinningDay = Math.max(0, Math.round((today - lw) / 86400000));
  } else if (byDay.size > 0) {
    daysSinceWinningDay = byDay.size;
  }

  // Alerts
  const triggers: string[] = [];
  let level: RiskLevel = "none";
  if (consecutiveLosses >= 5) {
    triggers.push(`${consecutiveLosses} losses in a row`);
    level = "red";
  } else if (consecutiveLosses >= 3) {
    triggers.push(`${consecutiveLosses} losses in a row`);
    level = "yellow";
  }
  if (currentDdPct >= 30) {
    triggers.push(`${currentDdPct.toFixed(0)}% drawdown`);
    level = "red";
  } else if (currentDdPct >= 20 && level !== "red") {
    triggers.push(`${currentDdPct.toFixed(0)}% drawdown`);
    if (level === "none") level = "yellow";
  }

  let alertTitle: string | null = null;
  let alertMessage: string | null = null;
  if (level === "yellow") {
    alertTitle = "Take a breath";
    alertMessage = "Consider taking a break — review your last 3 trades.";
  } else if (level === "red") {
    alertTitle = "Daily loss limit reached";
    alertMessage = "STOP TRADING TODAY. Review your rules tomorrow.";
  }

  return {
    peak,
    trough,
    current: balance,
    currentDdPct,
    maxDdPct,
    consecutiveLosses,
    daysSinceWinningDay,
    level,
    alertTitle,
    alertMessage,
    lockTrading: level === "red",
    triggers,
  };
}

// Local-storage override key (per day)
export function lockOverrideKey(): string {
  return `edgetrader.lockOverride.${new Date().toISOString().slice(0, 10)}`;
}

export function isLockOverridden(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(lockOverrideKey()) === "1";
}

export function setLockOverride(v: boolean) {
  if (typeof window === "undefined") return;
  if (v) localStorage.setItem(lockOverrideKey(), "1");
  else localStorage.removeItem(lockOverrideKey());
}