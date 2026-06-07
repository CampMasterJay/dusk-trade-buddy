import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Save,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { SETUP_TAGS } from "@/components/NewTradeSheet";
import { getAllTrades, type Trade } from "@/lib/tradeService";
import {
  type Bias,
  type GamePlan,
  computeReview,
  getPlanForDate,
  saveReview,
  todayLocalDate,
  upsertPlan,
} from "@/lib/gamePlanService";
import {
  MARKET_REGIMES,
  REGIME_GUIDANCE,
  winRateForRegime,
  type MarketRegime,
} from "@/lib/marketRegime";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/game-plan")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Daily Game Plan" },
      { name: "description", content: "Plan your trading day and review discipline at the close." },
      { property: "og:title", content: "EdgeTrader — Daily Game Plan" },
      { property: "og:description", content: "Plan your trading day and review discipline." },
    ],
  }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">Couldn't load your game plan.</p>
        <p className="text-xs text-muted-foreground/70 font-mono">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Try again
        </Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Not found.
    </div>
  ),
  component: GamePlanPage,
});

function GamePlanPage() {
  return (
    <ProtectedRoute>
      <GamePlanScreen />
    </ProtectedRoute>
  );
}

const BIASES: Bias[] = ["Bullish", "Bearish", "Neutral"];

function GamePlanScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useUserSettings();

  // Allow selecting other dates later; default to today
  const [date, setDate] = useState<string>(todayLocalDate());
  const [plan, setPlan] = useState<GamePlan | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  // Form state
  const [bias, setBias] = useState<Bias>("Neutral");
  const [keyLevels, setKeyLevels] = useState<string[]>(["", "", "", "", ""]);
  const [plannedSetups, setPlannedSetups] = useState<string[]>([]);
  const [maxTrades, setMaxTrades] = useState<number>(2);
  const [maxLoss, setMaxLoss] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [regime, setRegime] = useState<MarketRegime | null>(null);

  // Derive default max loss from settings (risk_pct of current balance)
  const defaultMaxLoss = useMemo(() => {
    if (!settings) return null;
    const bal = Number(settings.current_balance ?? 0);
    const pct = Number(settings.risk_pct ?? 0);
    if (!bal || !pct) return null;
    return Math.round(bal * (pct / 100));
  }, [settings]);

  // Load plan + trades when user/date changes
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    Promise.all([getPlanForDate(userId, date), getAllTrades(userId)])
      .then(([planRes, tradesRes]) => {
        if (!active) return;
        const p = planRes.data;
        setPlan(p);
        if (p) {
          setBias((p.bias as Bias) ?? "Neutral");
          const levels = (p.key_levels ?? []).map((n) => String(n));
          while (levels.length < 5) levels.push("");
          setKeyLevels(levels.slice(0, 5));
          setPlannedSetups(p.planned_setups ?? []);
          setMaxTrades(p.max_trades ?? 2);
          setMaxLoss(p.max_loss != null ? String(p.max_loss) : "");
          setNotes(p.notes ?? "");
          setRegime((p.market_regime as MarketRegime | null) ?? null);
        } else {
          setBias("Neutral");
          setKeyLevels(["", "", "", "", ""]);
          setPlannedSetups([]);
          setMaxTrades(2);
          setMaxLoss(defaultMaxLoss != null ? String(defaultMaxLoss) : "");
          setNotes("");
          setRegime(null);
        }
        setTrades(tradesRes.data ?? []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, date]);

  // Auto-fill max loss default once settings arrive (only if blank and no plan)
  useEffect(() => {
    if (!plan && !maxLoss && defaultMaxLoss != null) {
      setMaxLoss(String(defaultMaxLoss));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMaxLoss]);

  const review = useMemo(() => (plan ? computeReview(plan, trades) : null), [plan, trades]);

  function toggleSetup(tag: string) {
    setPlannedSetups((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function updateLevel(i: number, val: string) {
    setKeyLevels((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    const cleanedLevels = keyLevels
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
    const maxLossNum = maxLoss.trim() === "" ? null : Number(maxLoss);
    const { data, error } = await upsertPlan(userId, {
      plan_date: date,
      bias,
      key_levels: cleanedLevels,
      planned_setups: plannedSetups,
      max_trades: Number.isFinite(maxTrades) ? Math.max(1, Math.floor(maxTrades)) : 2,
      max_loss: maxLossNum != null && Number.isFinite(maxLossNum) ? maxLossNum : null,
      notes: notes.trim() || null,
      market_regime: regime,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save game plan", { description: error.message });
      return;
    }
    setPlan(data);
    toast.success("Game plan saved");
  }

  async function handleRunReview() {
    if (!plan) return;
    setReviewing(true);
    const r = computeReview(plan, trades);
    const { data, error } = await saveReview(plan.id, {
      stuck_to_max_trades: r.stuck_to_max_trades,
      stayed_within_loss: r.stayed_within_loss,
      traded_planned_setups: r.traded_planned_setups,
      discipline_score: r.discipline_score,
    });
    setReviewing(false);
    if (error) {
      toast.error("Couldn't save review", { description: error.message });
      return;
    }
    setPlan(data);
    toast.success(`Discipline score saved: ${r.discipline_score}/3`);
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <AppHeader balance={Number(settings?.current_balance ?? 0)} />
      <main className="mx-auto max-w-3xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto h-8 text-xs"
          />
        </div>

        <header className="flex items-center gap-2">
          <Target className="h-5 w-5 text-trade-green" />
          <h1 className="text-lg font-semibold tracking-tight">Daily Game Plan</h1>
        </header>

        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner label="Loading plan…" />
          </div>
        ) : (
          <>
            {/* Bias */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Today's bias
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {BIASES.map((b) => {
                  const Icon = b === "Bullish" ? TrendingUp : b === "Bearish" ? TrendingDown : Minus;
                  const active = bias === b;
                  const color =
                    b === "Bullish"
                      ? "border-trade-green text-trade-green bg-trade-green/10"
                      : b === "Bearish"
                        ? "border-trade-red text-trade-red bg-trade-red/10"
                        : "border-muted-foreground text-muted-foreground bg-muted/30";
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBias(b)}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition",
                        active ? color : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {b}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Key levels */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Key levels to watch (up to 5)
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {keyLevels.map((v, i) => (
                  <div key={i} className="relative">
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder={`Lvl ${i + 1}`}
                      value={v}
                      onChange={(e) => updateLevel(i, e.target.value)}
                      className="font-mono"
                    />
                    {v && (
                      <button
                        type="button"
                        onClick={() => updateLevel(i, "")}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Setups */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Setup(s) to look for
              </Label>
              <div className="flex flex-wrap gap-2">
                {SETUP_TAGS.map((tag) => {
                  const active = plannedSetups.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleSetup(tag)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        active
                          ? "border-trade-green bg-trade-green/15 text-trade-green"
                          : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {tag}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Limits */}
            <section className="rounded-2xl border border-border bg-card p-4 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Max trades today
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={maxTrades}
                  onChange={(e) => setMaxTrades(Number(e.target.value))}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Max loss today ($)
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={maxLoss}
                  onChange={(e) => setMaxLoss(e.target.value)}
                  placeholder={defaultMaxLoss != null ? String(defaultMaxLoss) : "—"}
                  className="mt-1 font-mono"
                />
                {defaultMaxLoss != null && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Default from settings: ${defaultMaxLoss}
                  </p>
                )}
              </div>
            </section>

            {/* Notes */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Notes / catalyst for today
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="FOMC at 1pm. Watch reaction at prior day high…"
                rows={3}
              />
            </section>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-trade-green text-background hover:bg-trade-green/90"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving…" : plan ? "Update Plan" : "Save Plan"}
              </Button>
            </div>

            {/* End-of-session review */}
            {plan && (
              <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold tracking-tight">End-of-Session Review</h2>
                  </div>
                  {plan.reviewed_at && (
                    <span className="text-[10px] text-muted-foreground">
                      Saved {new Date(plan.reviewed_at).toLocaleString()}
                    </span>
                  )}
                </div>

                {review && (
                  <>
                    <ReviewRow
                      label="Stayed within max trades"
                      pass={review.stuck_to_max_trades}
                      detail={`${review.actualTrades} / ${plan.max_trades} taken`}
                    />
                    <ReviewRow
                      label="Stayed within max loss"
                      pass={review.stayed_within_loss}
                      detail={
                        plan.max_loss != null
                          ? `−$${review.actualLoss.toFixed(0)} / $${Number(plan.max_loss).toFixed(0)} cap`
                          : "No cap set"
                      }
                    />
                    <ReviewRow
                      label="Traded planned setups"
                      pass={review.traded_planned_setups}
                      detail={
                        plan.planned_setups.length === 0
                          ? "No setups planned"
                          : review.unplannedSetups.length === 0
                            ? "All trades matched plan"
                            : `Off-plan: ${review.unplannedSetups.join(", ")}`
                      }
                    />

                    <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        Discipline Score
                      </span>
                      <span
                        className={cn(
                          "font-mono text-2xl font-bold",
                          review.discipline_score === 3 && "text-trade-green",
                          review.discipline_score === 2 && "text-amber-500",
                          review.discipline_score <= 1 && "text-trade-red",
                        )}
                      >
                        {review.discipline_score}/3
                      </span>
                    </div>

                    <Button
                      onClick={handleRunReview}
                      disabled={reviewing}
                      variant="outline"
                      className="w-full"
                    >
                      {reviewing ? "Saving…" : plan.reviewed_at ? "Re-save Review" : "Save Today's Review"}
                    </Button>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ReviewRow({
  label,
  pass,
  detail,
}: {
  label: string;
  pass: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {pass ? (
          <CheckCircle2 className="h-4 w-4 text-trade-green" />
        ) : (
          <XCircle className="h-4 w-4 text-trade-red" />
        )}
        <div>
          <div className="text-sm">{label}</div>
          <div className="text-[11px] text-muted-foreground">{detail}</div>
        </div>
      </div>
      <span
        className={cn(
          "text-xs font-medium",
          pass ? "text-trade-green" : "text-trade-red",
        )}
      >
        {pass ? "✓" : "✗"}
      </span>
    </div>
  );
}