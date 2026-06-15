import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Brain, Layers, Shield, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useCountUp } from "@/hooks/useCountUp";
import { HighImpactAlertCard } from "@/components/HighImpactAlertCard";
import { OptionsDashboardSection } from "@/components/OptionsDashboardSection";
import { OptionsSummaryCard } from "@/components/OptionsSummaryCard";
import { DailyThetaCard } from "@/components/DailyThetaCard";
import { OptionsRollingPerformance } from "@/components/OptionsRollingPerformance";
import { OptionsTradesList } from "@/components/OptionsTradesList";
import { OptionsQuickLogFab } from "@/components/OptionsQuickLogFab";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useTradingMode, getActiveBalance } from "@/lib/tradingMode";
import { useModeCopy } from "@/lib/modeCopy";
import { getAllTrades, type Trade } from "@/lib/tradeService";

function fmtUSD(n: number, decimals = 0) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function OptionsDashboard() {
  const { user } = useAuth();
  const { settings, refresh, recalcBalance } = useUserSettings();
  const [mode] = useTradingMode();
  const copy = useModeCopy();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getAllTrades(user.id)
      .then(({ data }) => {
        if (!cancelled && data) setTrades(data);
      })
      .catch(() => {
        if (!cancelled) setTrades([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, reloadKey]);

  const bal = getActiveBalance(settings, mode);
  const startingBalance = bal.starting;
  const currentBalance = bal.current;
  const targetBalance = bal.target;
  const animatedBalance = useCountUp(currentBalance, 600);

  const progressPct = useMemo(() => {
    const denom = targetBalance - startingBalance;
    if (denom <= 0) return 0;
    return Math.max(
      0,
      Math.min(100, ((currentBalance - startingBalance) / denom) * 100),
    );
  }, [currentBalance, startingBalance, targetBalance]);

  const onLogged = () => {
    setReloadKey((k) => k + 1);
    refresh();
    recalcBalance();
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <AppHeader balance={currentBalance} />
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <HighImpactAlertCard />

        {/* Hero — Options Desk */}
        <section
          data-tour="options-dashboard-summary"
          className="rounded-2xl border border-trade-amber/30 bg-card p-5 mode-accent-ring"
          style={{
            background:
              "radial-gradient(circle at 0% 0%, color-mix(in oklab, var(--trade-amber) 8%, transparent), transparent 60%)",
          }}
        >
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[3px] text-trade-amber font-data">
                {copy.dashboardTitle}
              </div>
              <div className="text-xs text-muted-foreground font-data mt-0.5">
                {copy.dashboardSubtitle}
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-data">
              Target {fmtUSD(targetBalance, 0)}
            </span>
          </div>
          <div
            className="mt-3 font-data text-4xl font-bold tracking-tight text-trade-amber sm:text-5xl"
            style={{ textShadow: "0 0 18px color-mix(in oklab, var(--trade-amber) 50%, transparent)" }}
          >
            {fmtUSD(animatedBalance, 2)}
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-trade-amber transition-all"
              style={{
                width: `${progressPct}%`,
                boxShadow: "0 0 10px color-mix(in oklab, var(--trade-amber) 50%, transparent)",
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground font-data">
            <span>{fmtUSD(startingBalance, 0)}</span>
            <span>{progressPct.toFixed(1)}%</span>
            <span>{fmtUSD(targetBalance, 0)}</span>
          </div>
        </section>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Link
            to="/options-risk"
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-data px-3 py-1.5 rounded-md border border-trade-amber/40 bg-trade-amber/10 text-trade-amber hover:bg-trade-amber/20 transition"
          >
            <Shield className="h-3.5 w-3.5" />
            Options Risk
          </Link>
          <Link
            to="/playbook"
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-data px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition"
          >
            <Layers className="h-3.5 w-3.5" />
            Strategy Playbook
          </Link>
          <Link
            to="/weekly-debrief"
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-data px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition"
          >
            <Brain className="h-3.5 w-3.5" />
            {copy.weeklyDebriefTitle}
          </Link>
        </div>

        <OptionsDashboardSection onLogged={onLogged} />
        <OptionsSummaryCard />
        <DailyThetaCard />
        <OptionsRollingPerformance trades={trades} />

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-[2px] font-data text-muted-foreground">
              Recent positions
            </h2>
            <Link
              to="/trade-log"
              className="text-[10px] uppercase tracking-wider font-data text-trade-amber hover:opacity-80"
            >
              View all →
            </Link>
          </div>
          <OptionsTradesList />
        </section>

        <Link
          to="/chart-analyzer"
          className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 transition hover:border-trade-amber/40"
        >
          <div>
            <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
              Chart Analyzer
            </div>
            <div className="mt-1 font-data text-sm text-muted-foreground">
              Snap a chart for AI commentary on regime + setup.
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md bg-trade-amber/15 px-3 py-1.5 text-sm font-data text-trade-amber">
            <Sparkles className="h-4 w-4" />
            Analyze
          </span>
        </Link>
      </main>
      <OptionsQuickLogFab onLogged={onLogged} />
    </div>
  );
}