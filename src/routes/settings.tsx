import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  LogOut,
  KeyRound,
  Bell,
  Trash2,
  Target,
  Shield,
  Activity,
  Newspaper,
  User as UserIcon,
  AlertTriangle,
  RotateCcw,
  Plus,
  Minus,
  Loader2,
  Eye,
  EyeOff,
  PlayCircle,
  Layers,
  ChevronRight,
  LineChart,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { AppHeader } from "@/components/AppHeader";
import { WatchlistManager } from "@/components/WatchlistManager";
import { BackupSection } from "@/components/BackupSection";
import { DebugSection } from "@/components/DebugSection";
import { AchievementsSection } from "@/components/AchievementsSection";
import { ChallengeHistorySection } from "@/components/ChallengeHistorySection";
import { WalkthroughsSection } from "@/components/walkthrough/WalkthroughsSection";
import { archiveAndResetChallenge } from "@/lib/challengeArchive";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useLocalPrefs } from "@/lib/localPrefs";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/api/account.functions";
import {
  flushQueuedTrades,
  formatLastSync,
  getLastSync,
  getQueuedTrades,
} from "@/lib/offlineCache";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { triggerHaptic } from "@/hooks/useHaptic";
import {
  DEFAULT_SETTINGS,
  getNotificationPermission,
  getNotificationSettings,
  requestNotificationPermission,
  setNotificationSettings,
  subscribeNotificationSettings,
  type NotificationSettings,
} from "@/lib/notifications";
import {
  DEFAULT_BEHAVIOR_ALERT_SETTINGS,
  getBehaviorAlertSettings,
  setBehaviorAlertSettings,
  subscribeBehaviorAlertSettings,
  type BehaviorAlertSettings,
} from "@/lib/behaviorAlerts";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Settings" },
      { name: "description", content: "Manage your EdgeTrader account, risk, and integrations." },
    ],
  }),
  component: Settings,
});

const INSTRUMENT_TICKS: Record<string, number> = {
  MES: 1.25,
  MNQ: 0.5,
  MBT: 5,
  NQ: 5,
  ES: 12.5,
};
const INSTRUMENTS = ["MES", "MNQ", "MBT", "NQ", "ES", "Other"];
const RR_OPTIONS = [1, 1.5, 2, 2.5, 3];
const REFRESH_OPTIONS = [1, 5, 15, 30, 60];

function Settings() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const balance = Number(settings?.current_balance ?? settings?.starting_balance ?? 100);

  return (
    <ProtectedRoute>
      <AppHeader balance={balance} />
      <div className="p-4 lg:p-6 pb-24 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold font-heading mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {user?.email}
        </p>

        <WalkthroughsSection />
        <ChallengeSection />
        <ChallengeHistorySection />
        <TradingHistorySection />
        <RiskSection />
        <InstrumentsSection />
        <ScalingPlanSection />
        <NotificationsSection />
        <BehaviorAlertsSection />
        <NewsApiSection />
        <OfflineSection />
        <AchievementsSection />
        <BackupSection />
        <AccountSection />
        <DebugSection />

      </div>
    </ProtectedRoute>
  );
}

// ---------- Section shell ----------

function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary">{icon}</span>
        <h2 className="text-lg font-semibold font-heading">{title}</h2>
      </div>
      {desc && <p className="text-xs text-muted-foreground mb-4">{desc}</p>}
      {!desc && <div className="mb-2" />}
      {children}
    </section>
  );
}

// ---------- Scaling Plan ----------

function ScalingPlanSection() {
  return (
    <Section
      icon={<Layers className="h-4 w-4" />}
      title="Scaling Plan"
      desc="Rules that change as your capital grows beyond $1,000."
    >
      <Link
        to="/scaling-plan"
        className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5 text-sm hover:bg-accent/30"
      >
        <span>Edit capital scaling tiers</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </Section>
  );
}

function Row({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/40 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  prefix,
  suffix,
  step,
  min,
  className,
}: {
  value: number | string;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-sm font-data", className)}>
      {prefix && <span className="text-muted-foreground">{prefix}</span>}
      <input
        type="number"
        value={value}
        step={step ?? 1}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-20 bg-transparent text-right focus:outline-none"
      />
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// ---------- Challenge ----------

function ChallengeSection() {
  const { settings, updateSettings, recalcBalance } = useUserSettings();
  const [prefs, setPrefs] = useLocalPrefs();
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [working, setWorking] = useState(false);

  if (!settings) return null;

  const save = async (patch: Partial<typeof settings>) => {
    setSaving(true);
    try {
      await updateSettings(patch);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setWorking(true);
    try {
      const { archived, error } = await archiveAndResetChallenge({ explicitReset: true });
      if (error) throw error;
      await recalcBalance();
      window.dispatchEvent(new CustomEvent("edge:challenges-changed"));
      toast.success(archived ? "Challenge reset and archived." : "Challenge reset.");
      setConfirmReset(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const handleStartNew = async () => {
    setWorking(true);
    try {
      const { archived, error } = await archiveAndResetChallenge({ explicitReset: false });
      if (error) throw error;
      await recalcBalance();
      window.dispatchEvent(new CustomEvent("edge:challenges-changed"));
      toast.success(
        archived
          ? `New challenge started. Previous archived as ${archived.outcome}.`
          : "New challenge started.",
      );
      setConfirmStart(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Section icon={<Target className="size-5" />} title="Challenge" desc="Goals and account boundaries for this run.">
      <Row label="Starting balance">
        <NumInput
          prefix="$"
          value={settings.starting_balance}
          onChange={(n) => save({ starting_balance: n })}
        />
      </Row>
      <Row label="Target balance" sub="Used by milestone alerts and progress bar.">
        <NumInput
          prefix="$"
          value={settings.challenge_target}
          onChange={(n) => save({ challenge_target: n })}
        />
      </Row>
      <Row label="Challenge end date" sub="Deadline to hit your target.">
        <input
          type="date"
          value={prefs.challengeEndDate ?? ""}
          onChange={(e) => setPrefs({ challengeEndDate: e.target.value || null })}
          className="rounded-md border border-border bg-background/60 px-2 py-1 text-sm font-data"
        />
      </Row>
      <Row label="Current balance" sub="Auto-calculated from trade P&L.">
        <span className="text-sm font-data text-trade-green">
          ${Number(settings.current_balance).toFixed(2)}
        </span>
      </Row>

      <div className="mt-4 rounded-lg border border-trade-red/30 bg-trade-red/5 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 text-trade-red shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-trade-red">Reset challenge</div>
            <p className="text-xs text-muted-foreground">
              Archives the current challenge as <b>Reset</b>, clears all trades, and restores balance to starting.
            </p>
          </div>
          {confirmReset ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmReset(false)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium"
                disabled={working}
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="rounded-md bg-trade-red px-2 py-1 text-xs font-semibold text-white"
                disabled={working}
              >
                {working ? "Working…" : "Confirm reset"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1 rounded-md border border-trade-red/40 px-2 py-1 text-xs font-medium text-trade-red"
            >
              <RotateCcw className="size-3" />
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-start gap-2">
          <PlayCircle className="size-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-primary">Start new challenge</div>
            <p className="text-xs text-muted-foreground">
              Archives the current challenge (Won / Lost / Reset is decided from your final balance) and starts fresh. History is preserved.
            </p>
          </div>
          {confirmStart ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmStart(false)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium"
                disabled={working}
              >
                Cancel
              </button>
              <button
                onClick={handleStartNew}
                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground"
                disabled={working}
              >
                {working ? "Working…" : "Start new"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmStart(true)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-xs font-medium text-primary"
            >
              <PlayCircle className="size-3" />
              Start new
            </button>
          )}
        </div>
      </div>

      {saving && (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Saving
        </div>
      )}
    </Section>
  );
}

// ---------- Risk ----------

function RiskSection() {
  const { settings, updateSettings } = useUserSettings();
  const [prefs, setPrefs] = useLocalPrefs();

  const autoLossLimit = useMemo(() => {
    if (!settings) return 0;
    const bal = Number(settings.current_balance) || Number(settings.starting_balance) || 0;
    return Math.round((bal * (Number(settings.risk_pct) / 100)) * 100) / 100;
  }, [settings?.current_balance, settings?.starting_balance, settings?.risk_pct]);

  if (!settings) return null;

  const effectiveLossLimit = prefs.dailyLossLimitOverride
    ? prefs.dailyLossLimit ?? autoLossLimit
    : autoLossLimit;

  return (
    <Section icon={<Shield className="size-5" />} title="Risk" desc="Per-trade and per-day guardrails.">
      <div className="py-3 border-b border-border/40">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Risk per trade</div>
          <NumInput
            value={Number(settings.risk_pct).toFixed(1)}
            suffix="%"
            step={0.5}
            min={0.1}
            onChange={(n) => updateSettings({ risk_pct: n })}
          />
        </div>
        <Slider
          value={[Number(settings.risk_pct)]}
          min={0.5}
          max={25}
          step={0.5}
          onValueChange={([n]) => updateSettings({ risk_pct: n })}
        />
        <div className="mt-1 text-[11px] text-muted-foreground">
          ≈ ${autoLossLimit.toFixed(2)} risked per trade
        </div>
      </div>

      <Row label="Default R:R ratio" sub="Pre-filled when logging a new trade.">
        <div className="flex gap-1">
          {RR_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => updateSettings({ rr_ratio: r })}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-data font-semibold",
                Number(settings.rr_ratio) === r
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {r}R
            </button>
          ))}
        </div>
      </Row>

      <Row
        label="Baseline VIX"
        sub="The 'normal' VIX level used to volatility-adjust your risk %."
      >
        <NumInput
          value={Number(settings.baseline_vix ?? 18).toFixed(1)}
          step={0.5}
          min={5}
          onChange={(n) => updateSettings({ baseline_vix: n })}
        />
      </Row>
      <Row
        label="Auto VIX adjustment"
        sub="Scale per-trade risk by Baseline VIX ÷ Today's VIX (capped 0.4×–1.25×)."
      >
        <button
          onClick={() =>
            updateSettings({
              vix_adjustment_enabled: !(settings.vix_adjustment_enabled ?? true),
            })
          }
          className={cn(
            "rounded-md border px-2 py-1 text-[11px] font-medium",
            settings.vix_adjustment_enabled !== false
              ? "border-primary text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          {settings.vix_adjustment_enabled !== false ? "On" : "Off"}
        </button>
      </Row>

      <Row
        label="VIX Thresholds"
        sub="Customise your VIX risk tiers. Used in Volatility Performance & sparkline overlay."
      >
        <div className="flex flex-col items-end gap-1 text-[11px] font-data text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>Low &lt;</span>
            <NumInput
              value={Number(settings.vix_tier_low_max ?? 15).toFixed(1)}
              step={0.5}
              min={1}
              onChange={(n) => updateSettings({ vix_tier_low_max: n })}
            />
          </div>
          <div className="flex items-center gap-1">
            <span>Normal &lt;</span>
            <NumInput
              value={Number(settings.vix_tier_normal_max ?? 20).toFixed(1)}
              step={0.5}
              min={1}
              onChange={(n) => updateSettings({ vix_tier_normal_max: n })}
            />
          </div>
          <div className="flex items-center gap-1">
            <span>Elevated &lt;</span>
            <NumInput
              value={Number(settings.vix_tier_elevated_max ?? 30).toFixed(1)}
              step={0.5}
              min={1}
              onChange={(n) => updateSettings({ vix_tier_elevated_max: n })}
            />
          </div>
        </div>
      </Row>

      <Row label="Max trades per day" sub="Enforced by the trading lock.">
        <div className="inline-flex items-center gap-1">
          <button
            onClick={() => setPrefs({ maxTradesPerDay: Math.max(1, prefs.maxTradesPerDay - 1) })}
            className="rounded-md border border-border p-1 hover:bg-muted/40"
            aria-label="Decrease"
          >
            <Minus className="size-3" />
          </button>
          <span className="w-8 text-center text-sm font-data font-semibold">
            {prefs.maxTradesPerDay}
          </span>
          <button
            onClick={() => setPrefs({ maxTradesPerDay: Math.min(20, prefs.maxTradesPerDay + 1) })}
            className="rounded-md border border-border p-1 hover:bg-muted/40"
            aria-label="Increase"
          >
            <Plus className="size-3" />
          </button>
        </div>
      </Row>

      <Row
        label="Daily loss limit"
        sub={
          prefs.dailyLossLimitOverride
            ? "Manual override active."
            : `Auto: balance × risk % = $${autoLossLimit.toFixed(2)}`
        }
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setPrefs({
                dailyLossLimitOverride: !prefs.dailyLossLimitOverride,
                dailyLossLimit: prefs.dailyLossLimitOverride ? null : autoLossLimit,
              })
            }
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium",
              prefs.dailyLossLimitOverride
                ? "border-primary text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {prefs.dailyLossLimitOverride ? "Manual" : "Auto"}
          </button>
          <NumInput
            prefix="$"
            value={effectiveLossLimit}
            onChange={(n) =>
              setPrefs({ dailyLossLimit: n, dailyLossLimitOverride: true })
            }
          />
        </div>
      </Row>
    </Section>
  );
}

// ---------- Instruments ----------

function InstrumentsSection() {
  const { settings, updateSettings } = useUserSettings();
  const [prefs, setPrefs] = useLocalPrefs();
  const [newSym, setNewSym] = useState("");
  const [newTick, setNewTick] = useState("");

  if (!settings) return null;

  const currentInstrument = settings.instrument ?? "MES";
  const tickValue =
    INSTRUMENT_TICKS[currentInstrument] ??
    prefs.customTickValues[currentInstrument] ??
    Number(settings.tick_value) ??
    1;

  const addCustom = () => {
    const sym = newSym.trim().toUpperCase();
    const tv = Number(newTick);
    if (!sym || !Number.isFinite(tv) || tv <= 0) return;
    setPrefs({ customTickValues: { ...prefs.customTickValues, [sym]: tv } });
    setNewSym("");
    setNewTick("");
  };

  const removeCustom = (sym: string) => {
    const next = { ...prefs.customTickValues };
    delete next[sym];
    setPrefs({ customTickValues: next });
  };

  return (
    <Section icon={<Activity className="size-5" />} title="Instruments" desc="Default symbol and tick values.">
      <Row label="Default instrument">
        <select
          value={currentInstrument}
          onChange={(e) => {
            const sym = e.target.value;
            const tv =
              INSTRUMENT_TICKS[sym] ?? prefs.customTickValues[sym] ?? Number(settings.tick_value);
            updateSettings({ instrument: sym, tick_value: tv });
          }}
          className="rounded-md border border-border bg-background/60 px-2 py-1 text-sm font-data"
        >
          {[...INSTRUMENTS, ...Object.keys(prefs.customTickValues)].map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Tick value" sub="Dollar value per tick for the default instrument.">
        <NumInput
          prefix="$"
          step={0.25}
          value={tickValue}
          onChange={(n) => updateSettings({ tick_value: n })}
        />
      </Row>

      <div className="py-3 border-b border-border/40">
        <div className="text-sm font-medium mb-2">Custom instruments</div>
        {Object.entries(prefs.customTickValues).length === 0 ? (
          <p className="text-xs text-muted-foreground">No custom instruments yet.</p>
        ) : (
          <div className="space-y-1.5 mb-2">
            {Object.entries(prefs.customTickValues).map(([sym, tv]) => (
              <div
                key={sym}
                className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5"
              >
                <span className="text-sm font-data font-semibold">{sym}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-data text-muted-foreground">${tv}/tick</span>
                  <button
                    onClick={() => removeCustom(sym)}
                    className="text-muted-foreground hover:text-trade-red"
                    aria-label={`Remove ${sym}`}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newSym}
            onChange={(e) => setNewSym(e.target.value.toUpperCase().slice(0, 8))}
            placeholder="SYM"
            className="w-20 rounded-md border border-border bg-background/60 px-2 py-1 text-sm font-data uppercase focus:outline-none focus:border-primary"
          />
          <input
            value={newTick}
            onChange={(e) => setNewTick(e.target.value)}
            placeholder="$ tick"
            type="number"
            step="0.01"
            className="w-24 rounded-md border border-border bg-background/60 px-2 py-1 text-sm font-data focus:outline-none focus:border-primary"
          />
          <button
            onClick={addCustom}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
          >
            <Plus className="size-3" />
            Add
          </button>
        </div>
      </div>

      <div className="pt-4">
        <WatchlistManager
          tickers={settings.watchlist ?? []}
          onChange={async (next) => {
            await updateSettings({ watchlist: next });
          }}
        />
      </div>
    </Section>
  );
}

// ---------- Notifications ----------

function NotificationsSection() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [prefs, setPrefs] = useLocalPrefs();
  const supported =
    typeof window !== "undefined" && typeof Notification !== "undefined";

  useEffect(() => {
    if (!supported) return;
    setPermission(getNotificationPermission());
    setSettings(getNotificationSettings());
    return subscribeNotificationSettings(setSettings);
  }, [supported]);

  const handleEnable = async () => {
    if (!supported) return toast.error("Notifications aren't supported on this device.");
    if (permission === "denied") return toast.error("Notifications are blocked in your browser.");
    if (permission === "default") {
      const r = await requestNotificationPermission();
      setPermission(r);
      if (r !== "granted") return toast.error("Permission denied.");
    }
    setNotificationSettings({ enabled: !settings.enabled });
  };

  const toggle = (k: keyof NotificationSettings) =>
    setNotificationSettings({ [k]: !settings[k] });

  const masterOn = permission === "granted" && settings.enabled;

  return (
    <Section icon={<Bell className="size-5" />} title="Notifications">
      <Toggle label="Enable notifications" checked={masterOn} onChange={handleEnable} disabled={!supported || permission === "denied"} />
      <div className={cn("mt-1", !masterOn && "opacity-50 pointer-events-none")}>
        <Toggle label="Market open reminder" sub={`Daily at ${prefs.marketOpenTime} CT, weekdays.`} checked={settings.marketOpen} onChange={() => toggle("marketOpen")} />
        {settings.marketOpen && (
          <Row label="Reminder time" sub="When to fire the market-open alert.">
            <input
              type="time"
              value={prefs.marketOpenTime}
              onChange={(e) => setPrefs({ marketOpenTime: e.target.value })}
              className="rounded-md border border-border bg-background/60 px-2 py-1 text-sm font-data"
            />
          </Row>
        )}
        <Toggle label="HIGH impact news" sub="Fire as soon as a high-impact headline drops." checked={settings.news} onChange={() => toggle("news")} />
        <Toggle label="Daily loss limit" sub="Warn at 80%, stop at 100%." checked={settings.lossLimit} onChange={() => toggle("lossLimit")} />
        <Toggle label="Challenge milestones" sub="25 / 50 / 75 / 100% of target." checked={settings.milestones} onChange={() => toggle("milestones")} />
      </div>
    </Section>
  );
}

function Toggle({
  label,
  sub,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        aria-pressed={checked}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-trade-green" : "bg-muted",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-background transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

// ---------- Behavioral Alerts ----------

function BehaviorAlertsSection() {
  const [s, setS] = useState<BehaviorAlertSettings>(
    DEFAULT_BEHAVIOR_ALERT_SETTINGS,
  );
  useEffect(() => {
    setS(getBehaviorAlertSettings());
    return subscribeBehaviorAlertSettings(setS);
  }, []);
  const toggle = (k: keyof BehaviorAlertSettings) =>
    setBehaviorAlertSettings({ [k]: !s[k] });
  return (
    <Section
      icon={<Bell className="size-5" />}
      title="Behavioral Alerts"
      desc="Real-time banners shown on the chart analyzer and new-trade form."
    >
      <Toggle
        label="Tilt alert"
        sub="After 2+ consecutive losses today."
        checked={s.tilt}
        onChange={() => toggle("tilt")}
      />
      <Toggle
        label="Overtrading alert"
        sub="On your 3rd+ trade of the day."
        checked={s.overtrading}
        onChange={() => toggle("overtrading")}
      />
      <Toggle
        label="Win-streak alert"
        sub="After 3+ consecutive wins."
        checked={s.streak}
        onChange={() => toggle("streak")}
      />
      <Toggle
        label="Weak-hour alert"
        sub="When the current hour is your historical worst."
        checked={s.time}
        onChange={() => toggle("time")}
      />
    </Section>
  );
}

// ---------- News & API ----------

function NewsApiSection() {
  const [prefs, setPrefs] = useLocalPrefs();
  const [showSecret, setShowSecret] = useState(false);

  return (
    <Section
      icon={<Newspaper className="size-5" />}
      title="News & API"
      desc="Stored in this browser only. Never sent to our servers."
    >
      <Row label="Refresh interval" sub="How often news data refreshes.">
        <select
          value={prefs.newsRefreshMinutes}
          onChange={(e) => setPrefs({ newsRefreshMinutes: Number(e.target.value) })}
          className="rounded-md border border-border bg-background/60 px-2 py-1 text-sm font-data"
        >
          {REFRESH_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </Row>

      <div className="py-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-muted-foreground" />
          Alpaca Markets
        </div>
        <input
          type="text"
          value={prefs.alpacaKeyId}
          onChange={(e) => setPrefs({ alpacaKeyId: e.target.value })}
          placeholder="API Key ID"
          className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm font-data focus:outline-none focus:border-primary"
        />
        <div className="relative">
          <input
            type={showSecret ? "text" : "password"}
            value={prefs.alpacaSecret}
            onChange={(e) => setPrefs({ alpacaSecret: e.target.value })}
            placeholder="Secret Key"
            className="w-full rounded-md border border-border bg-background/60 px-3 py-2 pr-9 text-sm font-data focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setShowSecret((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showSecret ? "Hide secret" : "Show secret"}
          >
            {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Saved to localStorage. Clear your browser data to remove.
        </p>
      </div>
    </Section>
  );
}

// ---------- Account ----------

function AccountSection() {
  // (defined below)
  return <AccountSectionImpl />;
}

// ---------- Offline / Sync ----------

function OfflineSection() {
  const { user } = useAuth();
  const online = useOnlineStatus();
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => {
    setLastSync(await getLastSync());
    if (user) {
      const q = await getQueuedTrades(user.id);
      setQueueCount(q.length);
    }
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, online]);

  const syncNow = async () => {
    if (!user || !online) return;
    setSyncing(true);
    try {
      const { synced, failed } = await flushQueuedTrades(user.id);
      if (synced > 0) toast.success(`Synced ${synced} trade${synced === 1 ? "" : "s"}.`);
      if (failed > 0) toast.error(`Failed to sync ${failed}.`);
      if (synced === 0 && failed === 0) toast.message("Nothing to sync.");
      await refresh();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Section icon={<RotateCcw className="size-5" />} title="Offline & Sync">
      <Row label="Connection" sub={online ? "You're online." : "Working in offline mode. Changes will sync when you reconnect."}>
        <span
          className={cn(
            "text-xs font-semibold px-2 py-1 rounded-md border",
            online
              ? "border-trade-green/40 bg-trade-green/10 text-trade-green"
              : "border-amber-500/40 bg-amber-500/10 text-amber-400",
          )}
        >
          {online ? "Online" : "Offline"}
        </span>
      </Row>
      <Row label="Last sync" sub={formatLastSync(lastSync)}>
        <button
          onClick={syncNow}
          disabled={!online || syncing}
          className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-40"
        >
          {syncing && <Loader2 className="size-3 animate-spin" />}
          Sync now
        </button>
      </Row>
      <Row label="Pending trades" sub="Trades created while offline, waiting to upload.">
        <span className="text-sm font-data">{queueCount}</span>
      </Row>
      <HapticsRow />
    </Section>
  );
}

function HapticsRow() {
  const [prefs, setPrefs] = useLocalPrefs();
  const supported =
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  const enabled = prefs.hapticsEnabled && supported;

  const onToggle = () => {
    const next = !prefs.hapticsEnabled;
    setPrefs({ hapticsEnabled: next });
    if (next) triggerHaptic("tap");
  };

  return (
    <Row
      label="Haptic feedback"
      sub={
        supported
          ? "Vibrate on trade results, alerts, and key actions."
          : "Your device doesn't support vibration."
      }
    >
      <button
        onClick={onToggle}
        disabled={!supported}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40",
          enabled ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
            enabled ? "translate-x-5" : "translate-x-1",
          )}
        />
      </button>
    </Row>
  );
}

function AccountSectionImpl() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useLocalPrefs();
  const [name, setName] = useState(prefs.displayName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const callDelete = useServerFn(deleteMyAccount);

  useEffect(() => setName(prefs.displayName), [prefs.displayName]);

  const saveName = () => {
    setPrefs({ displayName: name.trim() });
    toast.success("Display name updated.");
  };

  const changePassword = async () => {
    if (!user?.email) return;
    setResetting(true);
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo });
      if (error) throw error;
      toast.success("Password reset email sent.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await callDelete();
      toast.success("Account deleted.");
      await signOut();
      navigate({ to: "/login" });
    } catch (e) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  };

  return (
    <Section icon={<UserIcon className="size-5" />} title="Account">
      <div className="py-3 border-b border-border/40">
        <div className="text-sm font-medium mb-2">Display name</div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="What should we call you?"
            className="flex-1 rounded-md border border-border bg-background/60 px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={saveName}
            disabled={name === prefs.displayName}
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      <Row label="Email" sub="Managed by your account provider.">
        <span className="text-sm font-data text-muted-foreground">{user?.email}</span>
      </Row>

      <Row label="Password" sub="We'll email you a reset link.">
        <button
          onClick={changePassword}
          disabled={resetting}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:text-foreground"
        >
          {resetting ? <Loader2 className="size-3 animate-spin" /> : <KeyRound className="size-3" />}
          Change password
        </button>
      </Row>

      <button
        onClick={() => signOut()}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 text-sm font-medium hover:bg-muted/30 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>

      <div className="mt-3 rounded-lg border border-trade-red/30 bg-trade-red/5 p-3">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="size-4 text-trade-red" />
          <span className="text-sm font-semibold text-trade-red">Delete account</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Permanently delete your account and all trades, journals, plans, and analyses. This cannot be undone.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1 rounded-md border border-trade-red/40 bg-trade-red/10 px-3 py-1.5 text-xs font-semibold text-trade-red"
          >
            <Trash2 className="size-3" />
            Delete my account
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-foreground">
              Type <span className="font-data font-bold">DELETE</span> to confirm:
            </p>
            <input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="DELETE"
              className="w-full rounded-md border border-trade-red/40 bg-background px-2 py-1.5 text-sm font-data focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  setDeleteText("");
                }}
                className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteText !== "DELETE" || deleting}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-trade-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {deleting && <Loader2 className="size-3 animate-spin" />}
                Permanently delete
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}