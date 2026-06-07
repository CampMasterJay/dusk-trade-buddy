import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  AlertTriangle,
  BookOpen,
  Layers,
  Building2,
  ShieldAlert,
  Flame,
  Zap,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { usePropFirmConstraints } from "@/hooks/usePropFirmConstraints";
import { EdgeHealthScore } from "@/components/RollingPerformance";
import {
  DEFAULT_TIERS,
  detectTier,
  nextTier,
  type ScalingTier,
} from "@/lib/scalingTiers";
import {
  computeBehaviorAlerts,
  getBehaviorAlertSettings,
  type BehaviorAlert,
} from "@/lib/behaviorAlerts";
import type { Trade } from "@/lib/tradeService";
import { cn } from "@/lib/utils";

function fmtUSD(n: number, decimals = 0) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const ALERT_ICONS = {
  tilt: ShieldAlert,
  overtrading: Flame,
  streak: Zap,
  time: Clock,
} as const;

interface PlaybookRow {
  id: string;
  name: string;
  win_rate: number | null;
  trade_count: number;
  status: string;
}

interface Props {
  trades: Trade[];
}

export function EdgeHealthSection({ trades }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
          Edge Health
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">
          <EdgeHealthScore trades={trades} />
          <ActiveAlertsRow trades={trades} />
          <ActivePlaybookRow />
          <CurrentTierRow />
          <PropFirmRow />
        </div>
      )}
    </section>
  );
}

// ---------------- Row 2: Active Alerts ----------------

function ActiveAlertsRow({ trades }: { trades: Trade[] }) {
  const [open, setOpen] = useState(false);
  const alerts: BehaviorAlert[] = useMemo(
    () => computeBehaviorAlerts(trades, getBehaviorAlertSettings()),
    [trades],
  );
  const count = alerts.length;
  const tone =
    count === 0
      ? "border-border bg-muted/30 text-muted-foreground"
      : alerts.some((a) => a.severity === "red")
        ? "border-trade-red/40 bg-trade-red/10 text-trade-red"
        : "border-amber-500/40 bg-amber-500/10 text-amber-400";

  return (
    <div className={cn("rounded-xl border p-3", tone)}>
      <button
        type="button"
        onClick={() => count > 0 && setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
        disabled={count === 0}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <div className="text-[10px] font-data uppercase tracking-[2px] opacity-80">
              Active Alerts
            </div>
            <div className="font-data text-base font-bold">
              {count === 0 ? "All Clear" : `${count} Active`}
            </div>
          </div>
        </div>
        {count > 0 && (
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        )}
      </button>
      {open && count > 0 && (
        <ul className="mt-3 space-y-2">
          {alerts.map((a) => {
            const Icon = ALERT_ICONS[a.type] ?? AlertTriangle;
            return (
              <li
                key={a.id}
                className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 p-2 text-xs text-foreground"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
                <div>
                  <div className="font-data text-[11px] font-semibold uppercase tracking-wider">
                    {a.title}
                  </div>
                  <div className="mt-0.5 leading-snug text-muted-foreground">
                    {a.message}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------- Row 3: Active Playbook ----------------

function ActivePlaybookRow() {
  const { user } = useAuth();
  const [entry, setEntry] = useState<PlaybookRow | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("playbook_entries")
        .select("id,name,win_rate,trade_count,status")
        .eq("user_id", user.id)
        .eq("status", "Active")
        .order("win_rate", { ascending: false, nullsFirst: false })
        .limit(10);
      if (cancelled) return;
      const rows = (data ?? []) as PlaybookRow[];
      setCount(rows.length);
      setEntry(rows[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <Link
      to="/playbook"
      className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-3 transition hover:border-trade-green/40"
    >
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-trade-green" />
        <div>
          <div className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            Active Playbook
          </div>
          {entry ? (
            <div className="font-data text-sm text-foreground">
              Trading:{" "}
              <span className="font-semibold text-trade-green">{entry.name}</span>
              {entry.win_rate != null && (
                <span className="ml-1 text-muted-foreground">
                  ({Math.round(Number(entry.win_rate) * 100)}% win rate)
                </span>
              )}
            </div>
          ) : (
            <div className="font-data text-sm text-muted-foreground">
              No active playbook entries yet
            </div>
          )}
        </div>
      </div>
      {count > 1 && (
        <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          +{count - 1} more
        </span>
      )}
    </Link>
  );
}

// ---------------- Row 4: Current Tier + Next Milestone ----------------

function CurrentTierRow() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const balance = Number(settings?.current_balance ?? 100);
  const [tiers, setTiers] = useState<ScalingTier[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("scaling_tiers")
        .select("*")
        .eq("user_id", user.id)
        .order("tier_number", { ascending: true });
      if (!cancelled) setTiers((data ?? []) as ScalingTier[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const effective = useMemo<ScalingTier[]>(() => {
    if (tiers.length > 0) return tiers;
    return DEFAULT_TIERS.map((t, i) => ({
      id: `default-${i}`,
      user_id: user?.id ?? "",
      created_at: "",
      updated_at: "",
      ...t,
      focus: t.focus ?? null,
    } as ScalingTier));
  }, [tiers, user?.id]);

  const currentNum = detectTier(effective, balance);
  const current = effective.find((t) => t.tier_number === currentNum) ?? null;
  const next = currentNum ? nextTier(effective, currentNum) : null;

  if (!current) return null;

  const progressPct = next
    ? Math.max(
        0,
        Math.min(
          100,
          ((balance - Number(current.min_balance)) /
            (Number(next.min_balance) - Number(current.min_balance))) *
            100,
        ),
      )
    : 100;

  return (
    <Link
      to="/scaling-plan"
      className="block rounded-xl border border-border bg-background/40 p-3 transition hover:border-trade-green/40"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-trade-green" />
          <div>
            <div className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
              Current Tier
            </div>
            <div className="font-data text-sm font-semibold text-foreground">
              TIER {current.tier_number}: {current.name}
            </div>
          </div>
        </div>
        {next && (
          <div className="text-right font-data">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Next
            </div>
            <div className="text-xs text-foreground">
              {fmtUSD(balance)} / {fmtUSD(Number(next.min_balance))}
            </div>
          </div>
        )}
      </div>
      {next && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-trade-green"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </Link>
  );
}

// ---------------- Row 5: Prop Firm Status ----------------

function PropFirmRow() {
  const p = usePropFirmConstraints();
  if (p.loading || !p.hasActiveChallenge) return null;

  const profitPct =
    p.profitTarget > 0
      ? Math.max(0, Math.min(100, (p.pnl / p.profitTarget) * 100))
      : 0;

  const dailyPct =
    p.maxDailyLoss && p.maxDailyLoss > 0 && p.dailyLossRemaining != null
      ? Math.max(
          0,
          Math.min(100, (p.dailyLossRemaining / p.maxDailyLoss) * 100),
        )
      : null;

  return (
    <Link
      to="/prop-firms"
      className="block rounded-xl border border-border bg-background/40 p-3 transition hover:border-trade-green/40"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-trade-green" />
          <div>
            <div className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
              Prop Firm Challenge
            </div>
            <div className="font-data text-sm font-semibold text-foreground">
              {p.firmName ?? "Active"}{" "}
              {p.accountSize != null && (
                <span className="text-muted-foreground">
                  • {fmtUSD(p.accountSize)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <MiniBar
          label="To Target"
          valueLabel={`${fmtUSD(p.pnl)} / ${fmtUSD(p.profitTarget)}`}
          pct={profitPct}
          tone="green"
        />
        {dailyPct != null && (
          <MiniBar
            label="Daily Loss Remaining"
            valueLabel={`${fmtUSD(p.dailyLossRemaining ?? 0)} / ${fmtUSD(p.maxDailyLoss ?? 0)}`}
            pct={dailyPct}
            tone={dailyPct < 25 ? "red" : dailyPct < 50 ? "amber" : "green"}
          />
        )}
      </div>
    </Link>
  );
}

function MiniBar({
  label,
  valueLabel,
  pct,
  tone,
}: {
  label: string;
  valueLabel: string;
  pct: number;
  tone: "green" | "amber" | "red";
}) {
  const barColor =
    tone === "red"
      ? "bg-trade-red"
      : tone === "amber"
        ? "bg-amber-400"
        : "bg-trade-green";
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-data uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="normal-case tracking-normal text-foreground">
          {valueLabel}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}