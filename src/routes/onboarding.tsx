import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Target, Calculator, Activity, Check } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome — EdgeTrader" },
      { name: "description", content: "Set up your trading challenge." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  return (
    <ProtectedRoute>
      <OnboardingFlow />
    </ProtectedRoute>
  );
}

const INSTRUMENT_TICKS: Record<string, number> = {
  MES: 1.25,
  MNQ: 0.5,
  MBT: 5,
  NQ: 5,
  ES: 12.5,
};
const INSTRUMENTS = ["MES", "MNQ", "MBT", "NQ", "ES", "Other"];
const SESSIONS = ["NY Open", "London", "Asian", "Other"];
const RR_OPTIONS = [1, 1.5, 2, 2.5, 3];

function OnboardingFlow() {
  const navigate = useNavigate();
  const { settings, updateSettings, loading } = useUserSettings();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [startingBalance, setStartingBalance] = useState(100);
  const [targetBalance, setTargetBalance] = useState(1000);
  const [timeframeDays, setTimeframeDays] = useState(30);

  // Step 2
  const [riskPct, setRiskPct] = useState(15);
  const [rrRatio, setRrRatio] = useState(1.5);

  // Step 3
  const [instrument, setInstrument] = useState("MES");
  const [tickValue, setTickValue] = useState(INSTRUMENT_TICKS.MES);
  const [session, setSession] = useState("NY Open");

  // If already onboarded, skip away.
  useEffect(() => {
    if (!loading && settings?.onboarding_completed) {
      navigate({ to: "/", replace: true });
    }
  }, [loading, settings, navigate]);

  // Auto-fill tick when known instrument is chosen.
  useEffect(() => {
    if (INSTRUMENT_TICKS[instrument] !== undefined) {
      setTickValue(INSTRUMENT_TICKS[instrument]);
    }
  }, [instrument]);

  const riskDollar = useMemo(
    () => (startingBalance * riskPct) / 100,
    [startingBalance, riskPct],
  );
  const targetDollar = useMemo(() => riskDollar * rrRatio, [riskDollar, rrRatio]);

  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const finish = async () => {
    setSaving(true);
    try {
      await updateSettings({
        starting_balance: startingBalance,
        current_balance: startingBalance,
        challenge_target: targetBalance,
        timeframe_days: timeframeDays,
        risk_pct: riskPct,
        rr_ratio: rrRatio,
        instrument,
        tick_value: tickValue,
        session,
        onboarding_completed: true,
      });
      toast.success("You're all set. Let's trade.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <ProgressBar step={step} total={3} />

        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          {step === 1 && (
            <StepOne
              startingBalance={startingBalance}
              setStartingBalance={setStartingBalance}
              targetBalance={targetBalance}
              setTargetBalance={setTargetBalance}
              timeframeDays={timeframeDays}
              setTimeframeDays={setTimeframeDays}
            />
          )}
          {step === 2 && (
            <StepTwo
              riskPct={riskPct}
              setRiskPct={setRiskPct}
              rrRatio={rrRatio}
              setRrRatio={setRrRatio}
              riskDollar={riskDollar}
              targetDollar={targetDollar}
            />
          )}
          {step === 3 && (
            <StepThree
              instrument={instrument}
              setInstrument={setInstrument}
              tickValue={tickValue}
              setTickValue={setTickValue}
              session={session}
              setSession={setSession}
            />
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={back}
              disabled={step === 1 || saving}
            >
              Back
            </Button>
            {step < 3 ? (
              <Button type="button" onClick={next}>
                Continue
              </Button>
            ) : (
              <Button type="button" onClick={finish} disabled={saving}>
                {saving ? "Saving..." : "Finish"}
                <Check className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const titles = [
    { label: "Set Your Challenge", icon: Target },
    { label: "Your Risk Formula", icon: Calculator },
    { label: "Primary Instrument", icon: Activity },
  ];
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        {titles.map((t, idx) => {
          const i = idx + 1;
          const active = i === step;
          const done = i < step;
          const Icon = t.icon;
          return (
            <div key={t.label} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-data ${
                  done
                    ? "bg-trade-green/20 border-trade-green text-trade-green"
                    : active
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-border text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              {idx < titles.length - 1 && (
                <div
                  className={`h-px flex-1 ${i < step ? "bg-trade-green" : "bg-border"}`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-muted-foreground font-data">
        Step {step} of {total} — {titles[step - 1].label}
      </div>
    </div>
  );
}

function StepOne({
  startingBalance,
  setStartingBalance,
  targetBalance,
  setTargetBalance,
  timeframeDays,
  setTimeframeDays,
}: {
  startingBalance: number;
  setStartingBalance: (n: number) => void;
  targetBalance: number;
  setTargetBalance: (n: number) => void;
  timeframeDays: number;
  setTimeframeDays: (n: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold font-heading">Set Your Challenge</h2>
        <p className="text-sm text-muted-foreground">
          Define your starting capital and goal.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="start">Starting balance ($)</Label>
        <Input
          id="start"
          type="number"
          min={1}
          value={startingBalance}
          onChange={(e) => setStartingBalance(Number(e.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="target">Target balance ($)</Label>
        <Input
          id="target"
          type="number"
          min={1}
          value={targetBalance}
          onChange={(e) => setTargetBalance(Number(e.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="days">Timeframe (days)</Label>
        <Input
          id="days"
          type="number"
          min={1}
          value={timeframeDays}
          onChange={(e) => setTimeframeDays(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

function StepTwo({
  riskPct,
  setRiskPct,
  rrRatio,
  setRrRatio,
  riskDollar,
  targetDollar,
}: {
  riskPct: number;
  setRiskPct: (n: number) => void;
  rrRatio: number;
  setRrRatio: (n: number) => void;
  riskDollar: number;
  targetDollar: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold font-heading">Your Risk Formula</h2>
        <p className="text-sm text-muted-foreground">
          Define how much you risk and how much you target per trade.
        </p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Risk per trade</Label>
          <span className="font-data text-sm text-primary">{riskPct}%</span>
        </div>
        <Slider
          min={1}
          max={50}
          step={1}
          value={[riskPct]}
          onValueChange={(v) => setRiskPct(v[0])}
        />
      </div>
      <div className="space-y-2">
        <Label>Reward : Risk ratio</Label>
        <div className="grid grid-cols-5 gap-2">
          {RR_OPTIONS.map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRrRatio(r)}
              className={`rounded-md border px-3 py-2 text-sm font-data transition-colors ${
                rrRatio === r
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {r}R
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-trade-green/30 bg-trade-green/5 p-4 font-data text-sm">
        Risk{" "}
        <span className="text-trade-red font-semibold">
          ${riskDollar.toFixed(2)}
        </span>{" "}
        → Target{" "}
        <span className="text-trade-green font-semibold">
          ${targetDollar.toFixed(2)}
        </span>{" "}
        per trade
      </div>
    </div>
  );
}

function StepThree({
  instrument,
  setInstrument,
  tickValue,
  setTickValue,
  session,
  setSession,
}: {
  instrument: string;
  setInstrument: (s: string) => void;
  tickValue: number;
  setTickValue: (n: number) => void;
  session: string;
  setSession: (s: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold font-heading">Primary Instrument</h2>
        <p className="text-sm text-muted-foreground">
          The market and session you'll focus on.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Instrument</Label>
        <Select value={instrument} onValueChange={setInstrument}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INSTRUMENTS.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tick">Tick value ($)</Label>
        <Input
          id="tick"
          type="number"
          step="0.01"
          min={0}
          value={tickValue}
          onChange={(e) => setTickValue(Number(e.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label>Session</Label>
        <Select value={session} onValueChange={setSession}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SESSIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}