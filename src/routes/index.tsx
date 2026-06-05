import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, CalendarRange } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { ProjectionModal } from "@/components/ProjectionModal";
import { HighImpactAlertCard } from "@/components/HighImpactAlertCard";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getTrades, getTradeStats, createTrade, type Trade, type TradeStats } from "@/lib/tradeService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Dashboard" },
      { name: "description", content: "Your AI-powered trading dashboard. Real-time market data, portfolio analytics, and intelligent trade signals." },
      { property: "og:title", content: "EdgeTrader — Dashboard" },
      { property: "og:description", content: "Your AI-powered trading dashboard." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings, refresh: refreshSettings } = useUserSettings();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    Promise.all([getTrades(userId, 200, 0), getTradeStats(userId)]).then(
      ([tRes, sRes]) => {
        if (!active) return;
        setTrades(tRes.data ?? []);
        setStats(sRes.data);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  const startingBalance = Number(settings?.starting_balance ?? 100);
  const currentBalance = Number(settings?.current_balance ?? startingBalance);
  const targetBalance = Number(settings?.challenge_target ?? 1000);
  const riskPct = Number(settings?.risk_pct ?? 15);
  const rrRatio = Number(settings?.rr_ratio ?? 1.5);
  const timeframeDays = Number(settings?.timeframe_days ?? 30);

  // Days remaining = timeframe - days since settings created.
  const daysRemaining = useMemo(() => {
    if (!settings?.created_at) return timeframeDays;
    const start = new Date(settings.created_at).getTime();
    const elapsed = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
    return Math.max(0, timeframeDays - elapsed);
  }, [settings?.created_at, timeframeDays]);

  const progressPct = useMemo(() => {
    const denom = targetBalance - startingBalance;
    if (denom <= 0) return 0;
    return Math.max(0, Math.min(100, ((currentBalance - startingBalance) / denom) * 100));
  }, [currentBalance, startingBalance, targetBalance]);

  const dailyGainNeeded = useMemo(() => {
    if (daysRemaining <= 0 || currentBalance <= 0) return 0;
    const ratio = targetBalance / currentBalance;
    if (ratio <= 0) return 0;
    return (Math.pow(ratio, 1 / daysRemaining) - 1) * 100;
  }, [targetBalance, currentBalance, daysRemaining]);

  const streak = useMemo(() => calcStreak(trades), [trades]);

  // Sparkline: balance progression across last 20 trades.
  const sparklineData = useMemo(() => {
    const ordered = [...trades]
      .filter((t) => t.pnl != null)
      .sort((a, b) => {
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        if (da !== db) return da - db;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      })
      .slice(-20);
    let running = startingBalance;
    const series = [{ i: 0, balance: running }];
    ordered.forEach((t, idx) => {
      running += Number(t.pnl) || 0;
      series.push({ i: idx + 1, balance: running });
    });
    return series;
  }, [trades, startingBalance]);

  const sparkLast = sparklineData[sparklineData.length - 1]?.balance ?? startingBalance;
  const sparkColor = sparkLast >= startingBalance ? "var(--trade-green)" : "var(--trade-red)";

  const riskDollar = (currentBalance * riskPct) / 100;
  const targetDollar = riskDollar * rrRatio;

  const onTradeLogged = () => {
    setReloadKey((k) => k + 1);
    refreshSettings();
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <AppHeader balance={currentBalance} />
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <HighImpactAlertCard />
        {loading && !stats ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner label="Loading dashboard…" />
          </div>
        ) : (
          <>
            <ChallengeCard
              currentBalance={currentBalance}
              startingBalance={startingBalance}
              targetBalance={targetBalance}
              progressPct={progressPct}
              daysRemaining={daysRemaining}
              dailyGainNeeded={dailyGainNeeded}
            />

            <StatsRow stats={stats} streak={streak} />

            <SparklineCard
              data={sparklineData}
              color={sparkColor}
              startingBalance={startingBalance}
              currentBalance={sparkLast}
            />

            <NextTradeCard
              currentBalance={currentBalance}
              riskPct={riskPct}
              rrRatio={rrRatio}
              riskDollar={riskDollar}
              targetDollar={targetDollar}
            />

            <ProjectionSection
              currentBalance={currentBalance}
              targetBalance={targetBalance}
              riskPct={riskPct}
              rrRatio={rrRatio}
              winRate={stats?.winRate ?? undefined}
            />

            <Link
              to="/weekly-report"
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 transition hover:border-trade-green/40"
            >
              <div>
                <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
                  Weekly Review
                </div>
                <div className="mt-1 font-data text-sm text-muted-foreground">
                  Auto-generated report with AI insight
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-md bg-trade-green/15 px-3 py-1.5 text-sm font-data text-trade-green">
                <CalendarRange className="h-4 w-4" />
                This Week
              </span>
            </Link>
          </>
        )}
      </main>

      <QuickLogFab onLogged={onTradeLogged} defaultInstrument={settings?.instrument ?? "MES"} />
    </div>
  );
}

function calcStreak(trades: Trade[]): { type: "W" | "L" | null; count: number } {
  const ordered = [...trades]
    .filter((t) => t.result === "Win" || t.result === "Loss")
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return db - da;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  if (ordered.length === 0) return { type: null, count: 0 };
  const first = ordered[0].result === "Win" ? "W" : "L";
  let count = 0;
  for (const t of ordered) {
    const r = t.result === "Win" ? "W" : "L";
    if (r === first) count += 1;
    else break;
  }
  return { type: first, count };
}

function ProjectionSection({
  currentBalance,
  targetBalance,
  riskPct,
  rrRatio,
  winRate,
}: {
  currentBalance: number;
  targetBalance: number;
  riskPct: number;
  rrRatio: number;
  winRate?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
          Projection
        </div>
        <div className="mt-1 font-data text-sm text-muted-foreground">
          See the compounding path to your target
        </div>
      </div>
      <Button
        onClick={() => setOpen(true)}
        className="bg-trade-green text-background hover:bg-trade-green/90 font-data"
      >
        See Projection
      </Button>
      <ProjectionModal
        open={open}
        onOpenChange={setOpen}
        currentBalance={currentBalance}
        targetBalance={targetBalance}
        riskPct={riskPct}
        rrRatio={rrRatio}
        winRate={winRate}
      />
    </section>
  );
}

function fmtUSD(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function ChallengeCard({
  currentBalance,
  startingBalance,
  targetBalance,
  progressPct,
  daysRemaining,
  dailyGainNeeded,
}: {
  currentBalance: number;
  startingBalance: number;
  targetBalance: number;
  progressPct: number;
  daysRemaining: number;
  dailyGainNeeded: number;
}) {
  return (
    <section
      className="rounded-2xl border border-trade-green/30 bg-card p-5"
      style={{
        boxShadow:
          "0 0 28px rgba(0, 255, 170, 0.15), inset 0 0 1px rgba(0, 255, 170, 0.2)",
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
          Current Balance
        </span>
        <span className="text-xs text-muted-foreground font-data">
          Target {fmtUSD(targetBalance, 0)}
        </span>
      </div>
      <div
        className="mt-2 font-data text-4xl font-bold tracking-tight text-trade-green sm:text-5xl"
        style={{ textShadow: "0 0 18px rgba(0, 255, 170, 0.55)" }}
      >
        {fmtUSD(currentBalance)}
      </div>

      <div className="mt-5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-trade-green transition-all"
            style={{
              width: `${progressPct}%`,
              boxShadow: "0 0 10px rgba(0, 255, 170, 0.6)",
            }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground font-data">
          <span>{fmtUSD(startingBalance, 0)}</span>
          <span>{progressPct.toFixed(1)}%</span>
          <span>{fmtUSD(targetBalance, 0)}</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniStat label="Days Remaining" value={String(daysRemaining)} />
        <MiniStat
          label="% / day needed"
          value={`${dailyGainNeeded.toFixed(2)}%`}
          accent={dailyGainNeeded > 5 ? "amber" : "green"}
        />
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: string;
  accent?: "default" | "green" | "red" | "amber";
}) {
  const color =
    accent === "green"
      ? "text-trade-green"
      : accent === "red"
        ? "text-trade-red"
        : accent === "amber"
          ? "text-trade-amber"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {label}
      </div>
      <div className={`mt-1 font-data text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function StatsRow({
  stats,
  streak,
}: {
  stats: TradeStats | null;
  streak: { type: "W" | "L" | null; count: number };
}) {
  const items: { label: string; value: string; accent?: "green" | "red" | "default" }[] = [
    { label: "Trades", value: String(stats?.totalTrades ?? 0) },
    { label: "Win Rate", value: `${((stats?.winRate ?? 0) * 100).toFixed(0)}%` },
    {
      label: "EV / trade",
      value: fmtUSD(stats?.ev ?? 0),
      accent: (stats?.ev ?? 0) >= 0 ? "green" : "red",
    },
    {
      label: "Total R",
      value: `${(stats?.totalR ?? 0).toFixed(2)}R`,
      accent: (stats?.totalR ?? 0) >= 0 ? "green" : "red",
    },
    {
      label: "Net P&L",
      value: fmtUSD(stats?.totalPnl ?? 0),
      accent: (stats?.totalPnl ?? 0) >= 0 ? "green" : "red",
    },
    {
      label: "Streak",
      value: streak.type ? `${streak.count}${streak.type}` : "—",
      accent: streak.type === "W" ? "green" : streak.type === "L" ? "red" : "default",
    },
  ];

  return (
    <section className="-mx-4">
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => {
          const color =
            it.accent === "green"
              ? "text-trade-green"
              : it.accent === "red"
                ? "text-trade-red"
                : "text-foreground";
          return (
            <div
              key={it.label}
              className="min-w-[120px] flex-shrink-0 rounded-lg border border-border bg-card p-3"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
                {it.label}
              </div>
              <div className={`mt-1 font-data text-base font-semibold ${color}`}>
                {it.value}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SparklineCard({
  data,
  color,
  startingBalance,
  currentBalance,
}: {
  data: { i: number; balance: number }[];
  color: string;
  startingBalance: number;
  currentBalance: number;
}) {
  const delta = currentBalance - startingBalance;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Balance · Last 20 Trades
          </div>
          <div className="mt-1 font-data text-sm" style={{ color }}>
            {delta >= 0 ? "+" : "−"}
            {fmtUSD(Math.abs(delta))}
          </div>
        </div>
      </div>
      <div className="mt-3 h-32">
        {data.length <= 1 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground font-data">
            Log trades to see your balance curve.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line
                type="monotone"
                dataKey="balance"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function NextTradeCard({
  currentBalance,
  riskPct,
  rrRatio,
  riskDollar,
  targetDollar,
}: {
  currentBalance: number;
  riskPct: number;
  rrRatio: number;
  riskDollar: number;
  targetDollar: number;
}) {
  const balanceIfWin = currentBalance + targetDollar;
  const balanceIfLoss = currentBalance - riskDollar;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-base font-semibold">Next Trade</h2>
        <span className="text-xs text-muted-foreground font-data">
          {riskPct}% · {rrRatio}R
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Tile label="Risk" value={fmtUSD(riskDollar)} accent="red" />
        <Tile label="Target" value={fmtUSD(targetDollar)} accent="green" />
        <Tile label="If Win" value={fmtUSD(balanceIfWin)} accent="green" />
        <Tile label="If Loss" value={fmtUSD(balanceIfLoss)} accent="red" />
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "green" | "red";
}) {
  const isGreen = accent === "green";
  return (
    <div
      className={`rounded-lg border p-3 ${
        isGreen
          ? "border-trade-green/30 bg-trade-green/5"
          : "border-trade-red/30 bg-trade-red/5"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {label}
      </div>
      <div
        className={`mt-1 font-data text-lg font-semibold ${
          isGreen ? "text-trade-green" : "text-trade-red"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function QuickLogFab({
  onLogged,
  defaultInstrument,
}: {
  onLogged: () => void;
  defaultInstrument: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [instrument, setInstrument] = useState(defaultInstrument);
  const [direction, setDirection] = useState<"Long" | "Short">("Long");
  const [result, setResult] = useState<"Win" | "Loss" | "Scratch">("Win");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [pnl, setPnl] = useState("");
  const [rMultiple, setRMultiple] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setInstrument(defaultInstrument);
  }, [defaultInstrument]);

  const reset = () => {
    setEntry("");
    setStop("");
    setTarget("");
    setPnl("");
    setRMultiple("");
    setNotes("");
    setResult("Win");
    setDirection("Long");
  };

  const submit = async () => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await createTrade({
      user_id: user.id,
      date: new Date().toISOString().slice(0, 10),
      instrument,
      direction,
      entry: Number(entry) || 0,
      stop: Number(stop) || 0,
      target: Number(target) || 0,
      result,
      pnl: pnl === "" ? null : Number(pnl),
      r_multiple: rMultiple === "" ? null : Number(rMultiple),
      notes: notes || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Trade logged");
    reset();
    setOpen(false);
    onLogged();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-6 right-6 z-40 h-14 rounded-full px-5 bg-trade-green text-background hover:bg-trade-green/90 font-data uppercase tracking-wider"
          style={{ boxShadow: "0 0 24px rgba(0,255,170,0.45)" }}
        >
          <Plus className="mr-1 h-5 w-5" />
          Quick Log
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Quick Log Trade</SheetTitle>
          <SheetDescription>Record a trade in seconds.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ql-inst">Instrument</Label>
            <Input
              id="ql-inst"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "Long" | "Short")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Long">Long</SelectItem>
                <SelectItem value="Short">Short</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Result</Label>
            <Select value={result} onValueChange={(v) => setResult(v as "Win" | "Loss" | "Scratch")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Win">Win</SelectItem>
                <SelectItem value="Loss">Loss</SelectItem>
                <SelectItem value="Scratch">Scratch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ql-pnl">P&L ($)</Label>
            <Input id="ql-pnl" type="number" step="0.01" value={pnl} onChange={(e) => setPnl(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ql-entry">Entry</Label>
            <Input id="ql-entry" type="number" step="0.01" value={entry} onChange={(e) => setEntry(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ql-stop">Stop</Label>
            <Input id="ql-stop" type="number" step="0.01" value={stop} onChange={(e) => setStop(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ql-target">Target</Label>
            <Input id="ql-target" type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ql-r">R Multiple</Label>
            <Input id="ql-r" type="number" step="0.01" value={rMultiple} onChange={(e) => setRMultiple(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ql-notes">Notes</Label>
            <Input id="ql-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <SheetFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-trade-green text-background hover:bg-trade-green/90">
            {submitting ? "Saving..." : "Log Trade"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
