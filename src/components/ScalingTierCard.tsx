import { useEffect, useMemo, useState } from "react";
import { Layers, ChevronRight, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import {
  DEFAULT_TIERS,
  detectTier,
  nextTier,
  type ScalingTier,
} from "@/lib/scalingTiers";
import { cn } from "@/lib/utils";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function ScalingTierCard() {
  const { user } = useAuth();
  const { settings, updateSettings } = useUserSettings();
  const balance = Number(settings?.current_balance ?? 100);
  const acknowledged = Number(
    (settings as { acknowledged_tier_number?: number } | null | undefined)?.acknowledged_tier_number ?? 0,
  );

  const [tiers, setTiers] = useState<ScalingTier[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("scaling_tiers")
        .select("*")
        .eq("user_id", user.id)
        .order("tier_number", { ascending: true });
      if (cancelled) return;
      setTiers((data ?? []) as ScalingTier[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Fall back to defaults so the card is useful before the user opens the editor.
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

  const currentTierNum = detectTier(effective, balance);
  const current = effective.find((t) => t.tier_number === currentTierNum) ?? null;
  const next = currentTierNum ? nextTier(effective, currentTierNum) : null;

  const showAlert = !!currentTierNum && currentTierNum > acknowledged && acknowledged > 0;

  const acknowledge = async () => {
    if (!currentTierNum) return;
    await updateSettings({ acknowledged_tier_number: currentTierNum } as Parameters<typeof updateSettings>[0]);
  };

  // First-load: silently set the baseline so the alert only fires on real upgrades.
  useEffect(() => {
    if (!loaded || !currentTierNum) return;
    if (acknowledged === 0) {
      void updateSettings({ acknowledged_tier_number: currentTierNum } as Parameters<typeof updateSettings>[0]);
    }
  }, [loaded, currentTierNum, acknowledged, updateSettings]);

  if (!current) return null;

  const progressPct = (() => {
    if (!next) return 100;
    const min = Number(current.min_balance);
    const max = Number(next.min_balance);
    if (max <= min) return 0;
    return Math.max(0, Math.min(100, ((balance - min) / (max - min)) * 100));
  })();

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      {showAlert && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-trade-green/40 bg-trade-green/10 p-3 text-xs">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-trade-green" />
          <div className="flex-1">
            <div className="font-data uppercase tracking-wider text-[10px] text-trade-green font-semibold">
              Tier Up
            </div>
            <div className="mt-0.5 text-foreground">
              Your rules have changed. Review your Scaling Plan for Tier {currentTierNum} requirements.
            </div>
          </div>
          <button
            type="button"
            onClick={acknowledge}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-trade-blue" />
            <span className="font-data uppercase tracking-wider text-[10px] text-muted-foreground">
              Active Tier
            </span>
          </div>
          <div className="mt-1 font-heading text-lg font-semibold">
            Tier {current.tier_number} — {current.name}
          </div>
          {current.focus && (
            <div className="text-xs text-muted-foreground">{current.focus}</div>
          )}
        </div>
        <Link
          to="/scaling-plan"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
        >
          Edit <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Max risk" value={`${Number(current.max_risk_pct)}%`} />
        <Stat label="Max trades / day" value={String(current.max_trades_per_day)} />
        <Stat label="Target R:R" value={`${Number(current.target_rr)}R`} />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          <span>{fmtMoney(balance)}</span>
          <span>{next ? `Next: Tier ${next.tier_number} @ ${fmtMoney(next.min_balance)}` : "Top tier"}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
          <div
            className={cn("h-full bg-trade-green transition-all")}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2 text-center">
      <div className="font-data text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-data text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}