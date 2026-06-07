import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Layers, Save, RotateCcw, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TIERS,
  detectTier,
  type ScalingTier,
} from "@/lib/scalingTiers";

export const Route = createFileRoute("/scaling-plan")({
  head: () => ({
    meta: [
      { title: "Scaling Plan — Capital Scaling Rules" },
      {
        name: "description",
        content:
          "Define how your trading rules — risk, instruments, max trades, R:R — change as your account grows.",
      },
    ],
  }),
  component: ScalingPlanPage,
});

type Draft = Omit<ScalingTier, "id" | "user_id" | "created_at" | "updated_at"> & {
  id?: string;
};

function ScalingPlanPage() {
  return (
    <ProtectedRoute>
      <Inner />
    </ProtectedRoute>
  );
}

function Inner() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const balance = Number(settings?.current_balance ?? 100);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("scaling_tiers")
        .select("*")
        .eq("user_id", user.id)
        .order("tier_number", { ascending: true });
      if (cancelled) return;
      if (!data || data.length === 0) {
        setDrafts(DEFAULT_TIERS.map((t) => ({ ...t } as Draft)));
      } else {
        setDrafts(data as Draft[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const activeTier = useMemo(() => detectTier(drafts as ScalingTier[], balance), [drafts, balance]);

  const update = (idx: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));

  const remove = (idx: number) =>
    setDrafts((prev) => prev.filter((_, i) => i !== idx));

  const addTier = () => {
    const next = (drafts.at(-1)?.tier_number ?? 0) + 1;
    const lastMax = drafts.at(-1)?.max_balance;
    setDrafts((prev) => [
      ...prev,
      {
        tier_number: next,
        name: `Tier ${next}`,
        min_balance: Number(lastMax ?? 0),
        max_balance: null,
        instruments: [],
        max_risk_pct: 3,
        max_trades_per_day: 2,
        target_rr: 2,
        focus: "",
        extra_rules: [],
      },
    ]);
  };

  const resetDefaults = () => {
    setDrafts(DEFAULT_TIERS.map((t) => ({ ...t } as Draft)));
    toast.message("Reset to default scaling tiers (not yet saved)");
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Replace-all: delete then insert. Simpler than diffing.
      const { error: delErr } = await supabase
        .from("scaling_tiers")
        .delete()
        .eq("user_id", user.id);
      if (delErr) throw delErr;
      const rows = drafts.map((d) => ({
        user_id: user.id,
        tier_number: d.tier_number,
        name: d.name,
        min_balance: d.min_balance,
        max_balance: d.max_balance,
        instruments: d.instruments,
        max_risk_pct: d.max_risk_pct,
        max_trades_per_day: d.max_trades_per_day,
        target_rr: d.target_rr,
        focus: d.focus,
        extra_rules: d.extra_rules,
      }));
      const { error: insErr } = await supabase.from("scaling_tiers").insert(rows);
      if (insErr) throw insErr;
      toast.success("Scaling plan saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AppHeader balance={balance} />
      <div className="p-4 lg:p-6 pb-24 max-w-3xl mx-auto">
        <div className="mb-4 flex items-center gap-2">
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Settings
          </Link>
        </div>

        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold font-heading mb-1 flex items-center gap-2">
              <Layers className="h-5 w-5 text-trade-blue" />
              Scaling Plan
            </h1>
            <p className="text-sm text-muted-foreground">
              How your rules change as capital grows. Active tier is auto-detected
              from your current balance.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground font-data">Loading…</div>
        ) : (
          <>
            <div className="space-y-4">
              {drafts.map((d, idx) => (
                <TierCard
                  key={`${d.tier_number}-${idx}`}
                  draft={d}
                  isActive={activeTier === d.tier_number}
                  onChange={(patch) => update(idx, patch)}
                  onRemove={() => remove(idx)}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={addTier}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Tier
              </Button>
              <Button variant="ghost" size="sm" onClick={resetDefaults}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to Defaults
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={saving}
                className="ml-auto bg-trade-green text-background hover:bg-trade-green/90 font-data uppercase tracking-wider"
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save Plan"}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function TierCard({
  draft,
  isActive,
  onChange,
  onRemove,
}: {
  draft: Draft;
  isActive: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const [newRule, setNewRule] = useState("");
  const [newInstr, setNewInstr] = useState("");

  return (
    <section
      className={cn(
        "rounded-xl border bg-card p-4",
        isActive ? "border-trade-green/60 shadow-[0_0_0_1px_var(--color-trade-green)]/20" : "border-border",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-trade-blue/10 px-2 py-0.5 font-data text-[10px] uppercase tracking-wider text-trade-blue">
            Tier {draft.tier_number}
          </span>
          {isActive && (
            <span className="rounded-md bg-trade-green/10 px-2 py-0.5 font-data text-[10px] uppercase tracking-wider text-trade-green">
              Active
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-trade-red"
          onClick={onRemove}
          aria-label="Remove tier"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            Tier name
          </Label>
          <Input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="mt-1"
          />
        </div>
        <NumField
          label="Min balance ($)"
          value={Number(draft.min_balance)}
          onChange={(n) => onChange({ min_balance: n })}
        />
        <NumField
          label="Max balance ($) — blank = ∞"
          value={draft.max_balance == null ? "" : Number(draft.max_balance)}
          allowEmpty
          onChange={(n) => onChange({ max_balance: n === "" ? null : n })}
        />
        <NumField
          label="Max risk per trade (%)"
          value={Number(draft.max_risk_pct)}
          step={0.5}
          onChange={(n) => onChange({ max_risk_pct: typeof n === "number" ? n : 0 })}
        />
        <NumField
          label="Max trades / day"
          value={Number(draft.max_trades_per_day)}
          onChange={(n) => onChange({ max_trades_per_day: typeof n === "number" ? n : 0 })}
        />
        <NumField
          label="Target R:R"
          value={Number(draft.target_rr)}
          step={0.1}
          onChange={(n) => onChange({ target_rr: typeof n === "number" ? n : 0 })}
        />
        <div className="sm:col-span-2">
          <Label className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            Focus
          </Label>
          <Input
            value={draft.focus ?? ""}
            onChange={(e) => onChange({ focus: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          Instruments
        </Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {draft.instruments.map((it, i) => (
            <span
              key={`${it}-${i}`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 font-data text-xs"
            >
              {it}
              <button
                type="button"
                onClick={() =>
                  onChange({ instruments: draft.instruments.filter((_, j) => j !== i) })
                }
                className="text-muted-foreground hover:text-trade-red"
                aria-label={`Remove ${it}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <Input
              value={newInstr}
              onChange={(e) => setNewInstr(e.target.value)}
              placeholder="Add…"
              className="h-7 w-24 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newInstr.trim()) {
                  onChange({ instruments: [...draft.instruments, newInstr.trim()] });
                  setNewInstr("");
                  e.preventDefault();
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
          Extra rules
        </Label>
        <ul className="mt-1 space-y-1">
          {draft.extra_rules.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 p-2 text-xs"
            >
              <span className="mt-0.5 text-trade-blue">•</span>
              <span className="flex-1">{r}</span>
              <button
                type="button"
                onClick={() =>
                  onChange({ extra_rules: draft.extra_rules.filter((_, j) => j !== i) })
                }
                className="text-muted-foreground hover:text-trade-red"
                aria-label="Remove rule"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Textarea
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="Add a rule…"
            className="min-h-[36px] text-xs"
            rows={1}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (!newRule.trim()) return;
              onChange({ extra_rules: [...draft.extra_rules, newRule.trim()] });
              setNewRule("");
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </section>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  allowEmpty,
}: {
  label: string;
  value: number | "";
  onChange: (n: number | "") => void;
  step?: number;
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <Label className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Input
        type="number"
        step={step}
        value={value === "" ? "" : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" && allowEmpty) return onChange("");
          const n = Number(v);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="mt-1 font-data"
      />
    </div>
  );
}