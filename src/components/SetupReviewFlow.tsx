import { useEffect, useState } from "react";
import { AlertTriangle, X, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { generateRecoveryPlan } from "@/lib/api/setupRecoveryPlan.functions";
import type { SetupHealth } from "@/lib/setupHealth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

const ROOT_CAUSES = [
  "Market regime has changed (now ranging, was trending)",
  "I've been entering late (chasing)",
  "Stops are too tight for current volatility",
  "I've been trading it in the wrong session",
  "News is disrupting patterns",
  "I deviated from the rules",
] as const;

export type SetupReviewFlowProps = {
  setupTag: string;
  setupName: string;
  health: SetupHealth;
  totalTradesCount: number; // total decisive trades across all setups (used for snooze)
  onClose: () => void;
  onActionLogged: (action: "Paused" | "Continued" | "Reviewed") => void;
};

export function SetupReviewFlow({
  setupTag,
  setupName,
  health,
  totalTradesCount,
  onClose,
  onActionLogged,
}: SetupReviewFlowProps) {
  const { user } = useAuth();
  const callPlan = useServerFn(generateRecoveryPlan);
  const [step, setStep] = useState<Step>(1);
  const [causes, setCauses] = useState<Set<string>>(new Set());
  const [other, setOther] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function logHealth(action: "Paused" | "Continued" | "Reviewed") {
    if (!user) return;
    await supabase.from("setup_health_log").insert({
      user_id: user.id,
      setup_type: setupTag,
      all_time_win_rate: Number(health.allTimeWinRate.toFixed(4)),
      recent_win_rate: Number((health.last20WinRate ?? 0).toFixed(4)),
      recent_sample_size: 20,
      action_taken: action,
    });
    onActionLogged(action);
  }

  async function upsertStatus(patch: Record<string, unknown>) {
    if (!user) return;
    const { error } = await supabase
      .from("setup_status")
      .upsert(
        { user_id: user.id, setup_type: setupTag, ...patch },
        { onConflict: "user_id,setup_type" },
      );
    if (error) toast.error("Could not save setup status");
  }

  async function handleContinueMonitor() {
    setSaving(true);
    await Promise.all([
      upsertStatus({
        state: "active",
        snooze_until_trade_count: totalTradesCount + 10,
        trade_count_at_change: totalTradesCount,
      }),
      logHealth("Continued"),
    ]);
    setSaving(false);
    toast.success("Alert snoozed for 10 more trades");
    onClose();
  }

  async function handlePause() {
    setSaving(true);
    await Promise.all([
      upsertStatus({
        state: "paused",
        paused_at: new Date().toISOString(),
        trade_count_at_change: totalTradesCount,
      }),
      logHealth("Paused"),
    ]);
    setSaving(false);
    setStep(2);
  }

  function toggleCause(c: string) {
    setCauses((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  async function handleGeneratePlan() {
    const all = [...causes];
    if (other.trim()) all.push(`Other: ${other.trim()}`);
    if (all.length === 0) {
      toast.error("Pick at least one root cause");
      return;
    }
    setLoadingPlan(true);
    setStep(3);
    try {
      const res = await callPlan({
        data: {
          setupName,
          rootCauses: all,
          allTimeWinRate: health.allTimeWinRate,
          recentWinRate: health.last20WinRate ?? 0,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        setPlan(null);
      } else {
        setPlan(res.plan);
        await upsertStatus({ root_causes: all, recovery_plan: res.plan });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setLoadingPlan(false);
    }
  }

  async function handleFinish() {
    setStep(4);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-trade-red/40 bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-trade-red" />
            <span className="text-[10px] font-data uppercase tracking-[3px] text-trade-red">
              Setup Review · Step {step} / 4
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background p-1.5 hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {step === 1 && (
            <Step1
              setupName={setupName}
              health={health}
              saving={saving}
              onPause={handlePause}
              onContinue={handleContinueMonitor}
            />
          )}
          {step === 2 && (
            <Step2
              causes={causes}
              other={other}
              onToggle={toggleCause}
              onOtherChange={setOther}
              onNext={handleGeneratePlan}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step3
              loading={loadingPlan}
              plan={plan}
              setupName={setupName}
              onRetry={handleGeneratePlan}
              onNext={handleFinish}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && <Step4 setupName={setupName} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

function Step1({
  setupName,
  health,
  saving,
  onPause,
  onContinue,
}: {
  setupName: string;
  health: SetupHealth;
  saving: boolean;
  onPause: () => void;
  onContinue: () => void;
}) {
  const all = (health.allTimeWinRate * 100).toFixed(0);
  const recent = ((health.last20WinRate ?? 0) * 100).toFixed(0);
  const drop = Math.max(0, health.allTimeWinRate - (health.last20WinRate ?? 0));
  const dropPct = (drop * 100).toFixed(0);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">{setupName} is degrading</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your performance on this setup has dropped meaningfully versus its
          all-time baseline. Pause it or keep monitoring.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="All-time" value={`${all}%`} tone="muted" />
        <Metric label="Last 20" value={`${recent}%`} tone="danger" />
        <Metric label="Drop" value={`-${dropPct}%`} tone="danger" />
      </div>

      <div className="rounded-lg border border-trade-red/30 bg-trade-red/10 p-3 text-xs leading-relaxed text-foreground/90">
        Continuing to trade a degrading setup without changes usually compounds
        losses. The safest move is to pause and review what changed.
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          disabled={saving}
          onClick={onPause}
          className="flex-1 rounded-md border border-trade-red/50 bg-trade-red/15 px-3 py-2 text-xs font-data uppercase tracking-wider text-trade-red hover:bg-trade-red/25 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Pause Setup"}
        </button>
        <button
          disabled={saving}
          onClick={onContinue}
          className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs font-data uppercase tracking-wider hover:bg-accent disabled:opacity-50"
        >
          Continue & Monitor
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Pause: removes the setup from your trade-entry options. Continue:
        snoozes this alert for the next 10 trades.
      </p>
    </div>
  );
}

function Step2({
  causes,
  other,
  onToggle,
  onOtherChange,
  onNext,
  onBack,
}: {
  causes: Set<string>;
  other: string;
  onToggle: (c: string) => void;
  onOtherChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const hasAny = causes.size > 0 || other.trim().length > 0;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-foreground">Root cause analysis</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Why might this setup be failing? Pick everything that applies.
        </p>
      </div>
      <div className="space-y-1.5">
        {ROOT_CAUSES.map((c) => {
          const on = causes.has(c);
          return (
            <label
              key={c}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-xs transition-colors",
                on
                  ? "border-trade-amber/40 bg-trade-amber/10"
                  : "border-border bg-background hover:bg-accent/30",
              )}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(c)}
                className="mt-0.5 h-3.5 w-3.5 accent-amber-500"
              />
              <span className="text-foreground">{c}</span>
            </label>
          );
        })}
        <div className="rounded-md border border-border bg-background p-2.5">
          <label className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            Other
          </label>
          <input
            value={other}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Describe…"
            className="mt-1 w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="rounded-md border border-border bg-card px-3 py-2 text-xs font-data uppercase tracking-wider hover:bg-accent"
        >
          Back
        </button>
        <button
          disabled={!hasAny}
          onClick={onNext}
          className="flex-1 rounded-md border border-trade-green/40 bg-trade-green/15 px-3 py-2 text-xs font-data uppercase tracking-wider text-trade-green hover:bg-trade-green/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Generate Recovery Plan
        </button>
      </div>
    </div>
  );
}

function Step3({
  loading,
  plan,
  setupName,
  onRetry,
  onNext,
  onBack,
}: {
  loading: boolean;
  plan: string | null;
  setupName: string;
  onRetry: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-trade-green" />
          <h2 className="text-base font-bold text-foreground">Recovery plan</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          AI-generated checklist for the next 10 {setupName} trades.
        </p>
      </div>

      <div className="min-h-32 rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Building your recovery plan…
          </div>
        )}
        {!loading && plan && <pre className="whitespace-pre-wrap font-sans">{plan}</pre>}
        {!loading && !plan && (
          <div className="text-muted-foreground">No plan generated yet.</div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onBack}
          className="rounded-md border border-border bg-card px-3 py-2 text-xs font-data uppercase tracking-wider hover:bg-accent"
        >
          Back
        </button>
        <button
          onClick={onRetry}
          disabled={loading}
          className="rounded-md border border-border bg-card px-3 py-2 text-xs font-data uppercase tracking-wider hover:bg-accent disabled:opacity-50"
        >
          Regenerate
        </button>
        <button
          onClick={onNext}
          disabled={loading || !plan}
          className="flex-1 rounded-md border border-trade-green/40 bg-trade-green/15 px-3 py-2 text-xs font-data uppercase tracking-wider text-trade-green hover:bg-trade-green/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save & Continue
        </button>
      </div>
    </div>
  );
}

function Step4({ setupName, onClose }: { setupName: string; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-trade-green" />
        <h2 className="text-base font-bold text-foreground">Setup paused</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{setupName}</span> is now
        hidden from your trade-entry options. After you log 10+ trades on other
        setups, you'll see a "Retest in probation mode" prompt. If your probation
        win rate exceeds 55%, the setup is reactivated automatically.
      </p>
      <div className="rounded-lg border border-border bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-data uppercase tracking-wider text-foreground">Tip:</span>{" "}
        Use this break to update your setup checklist with the recovery rules.
        Review your last 5 losses against the rules — the pattern usually shows up there.
      </div>
      <button
        onClick={onClose}
        className="w-full rounded-md border border-trade-green/40 bg-trade-green/15 px-3 py-2 text-xs font-data uppercase tracking-wider text-trade-green hover:bg-trade-green/25"
      >
        Done
      </button>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "muted" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-2 text-center",
        tone === "danger"
          ? "border-trade-red/30 bg-trade-red/10"
          : "border-border bg-background",
      )}
    >
      <div className="text-[9px] font-data uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-base font-bold font-data",
          tone === "danger" ? "text-trade-red" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}