import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload, X, ImageIcon, ListChecks, CheckCircle2, AlertTriangle, XCircle, Newspaper, Search } from "lucide-react";
import { toast } from "sonner";
import { triggerHaptic } from "@/hooks/useHaptic";
import { z } from "zod";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { createTrade, updateTrade, type Trade } from "@/lib/tradeService";
import { supabase } from "@/integrations/supabase/client";
import { ARTICLES, type Article } from "@/lib/newsData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  PreTradeChecklist,
  type ChecklistResult,
  type ChecklistPrefill,
} from "@/components/PreTradeChecklist";

const INSTRUMENTS = ["MES", "MNQ", "MBT", "NQ", "ES", "Other"] as const;

export const SETUP_TAGS = [
  "ORB",
  "VWAP Reclaim",
  "Flag",
  "B&R",
  "Inside Bar",
  "Other",
] as const;
export type SetupTag = (typeof SETUP_TAGS)[number];

const schema = z.object({
  date: z.string().min(1, "Date is required"),
  instrument: z.string().min(1, "Instrument is required").max(20),
  customInstrument: z.string().max(20).optional(),
  direction: z.enum(["Long", "Short"]),
  entry: z.number({ invalid_type_error: "Entry required" }).finite(),
  stop: z.number({ invalid_type_error: "Stop required" }).finite(),
  target: z.number({ invalid_type_error: "Target required" }).finite(),
  result: z.enum(["Win", "Loss", "Scratch"]),
  rMultiple: z.number().finite(),
  notes: z.string().max(2000).optional(),
  rangeSize: z.number().finite().optional(),
});

type Errors = Partial<Record<string, string>>;

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);

interface Props {
  onLogged?: () => void;
  trigger?: React.ReactNode;
  defaultInstrument?: string;
  editTrade?: Trade | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  prefill?: {
    entry?: string | number | null;
    stop?: string | number | null;
    target?: string | number | null;
    direction?: "Long" | "Short" | null;
    instrument?: string | null;
  } | null;
  checklistPrefill?: ChecklistPrefill | null;
}

export function NewTradeSheet({
  onLogged,
  trigger,
  defaultInstrument,
  editTrade,
  open: openProp,
  onOpenChange,
  prefill,
  checklistPrefill,
}: Props) {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [openUncontrolled, setOpenUncontrolled] = useState(false);
  const open = openProp ?? openUncontrolled;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setOpenUncontrolled(v);
  };
  const isEdit = !!editTrade;
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  // Form state
  const today = () => new Date().toISOString().slice(0, 10);
  const initialInstrument = useMemo(() => {
    const source = editTrade?.instrument ?? defaultInstrument ?? settings?.instrument ?? "MES";
    return INSTRUMENTS.includes(source as (typeof INSTRUMENTS)[number])
      ? (source as string)
      : "Other";
  }, [editTrade, defaultInstrument, settings?.instrument]);

  const [date, setDate] = useState<string>(editTrade?.date ?? today());
  const [instrument, setInstrument] = useState<string>(initialInstrument);
  const [customInstrument, setCustomInstrument] = useState<string>(
    initialInstrument === "Other"
      ? (editTrade?.instrument ?? defaultInstrument ?? "")
      : "",
  );
  const [direction, setDirection] = useState<"Long" | "Short">(
    (editTrade?.direction as "Long" | "Short") ?? "Long",
  );
  const [entry, setEntry] = useState(editTrade ? String(editTrade.entry) : "");
  const [stop, setStop] = useState(editTrade ? String(editTrade.stop) : "");
  const [target, setTarget] = useState(editTrade ? String(editTrade.target) : "");

  const [result, setResult] = useState<"Win" | "Loss" | "Scratch">(
    (editTrade?.result as "Win" | "Loss" | "Scratch") ?? "Win",
  );
  const [rMultiple, setRMultiple] = useState<string>(
    editTrade?.r_multiple != null ? String(editTrade.r_multiple) : "",
  );

  const [notes, setNotes] = useState(editTrade?.notes ?? "");
  const [rangeSize, setRangeSize] = useState(
    editTrade?.range_size != null ? String(editTrade.range_size) : "",
  );
  const [setupTag, setSetupTag] = useState<string>(
    (editTrade as { setup_tag?: string | null } | null | undefined)?.setup_tag ?? "",
  );
  // Track whether user manually edited the R multiple — so we don't auto-overwrite in edit mode.
  const [rTouched, setRTouched] = useState(isEdit);
  const [chartFile, setChartFile] = useState<File | null>(null);
  const [chartPreview, setChartPreview] = useState<string | null>(null);
  const [existingChart, setExistingChart] = useState<string | null>(
    editTrade?.chart_url ?? null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Pre-trade checklist
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistResult | null>(
    editTrade && (editTrade as { checklist_score?: number | null }).checklist_score != null
      ? {
          score: Number((editTrade as { checklist_score?: number }).checklist_score ?? 0),
          verdict:
            ((editTrade as { checklist_verdict?: string }).checklist_verdict as ChecklistResult["verdict"]) ??
            "CAUTION",
          items: {},
        }
      : null,
  );

  // News event tag
  const initialNewsId = (editTrade as { news_id?: string | null } | null | undefined)?.news_id ?? null;
  const [newsId, setNewsId] = useState<string | null>(initialNewsId);

  // Defaults from settings
  const balance = Number(settings?.current_balance ?? 100);
  const riskPct = Number(settings?.risk_pct ?? 15);
  const rrSetting = Number(settings?.rr_ratio ?? 1.5);

  // Re-hydrate form whenever the sheet opens or the edit target changes
  useEffect(() => {
    if (!open) return;
    if (editTrade) {
      setDate(editTrade.date);
      const src = editTrade.instrument;
      const known = INSTRUMENTS.includes(src as (typeof INSTRUMENTS)[number]);
      setInstrument(known ? src : "Other");
      setCustomInstrument(known ? "" : src);
      setDirection(editTrade.direction as "Long" | "Short");
      setEntry(String(editTrade.entry));
      setStop(String(editTrade.stop));
      setTarget(String(editTrade.target));
      setResult(editTrade.result as "Win" | "Loss" | "Scratch");
      setRMultiple(
        editTrade.r_multiple != null ? String(editTrade.r_multiple) : "",
      );
      setNotes(editTrade.notes ?? "");
      setRangeSize(
        editTrade.range_size != null ? String(editTrade.range_size) : "",
      );
      setSetupTag(
        (editTrade as { setup_tag?: string | null }).setup_tag ?? "",
      );
      setExistingChart(editTrade.chart_url ?? null);
      setChartFile(null);
      setRTouched(true);
      setErrors({});
      const cs = (editTrade as { checklist_score?: number | null }).checklist_score;
      const cv = (editTrade as { checklist_verdict?: string | null }).checklist_verdict;
      setChecklist(
        cs != null
          ? {
              score: Number(cs),
              verdict: (cv as ChecklistResult["verdict"]) ?? "CAUTION",
              items: {},
            }
          : null,
      );
      setNewsId((editTrade as { news_id?: string | null }).news_id ?? null);
    } else {
      setRMultiple((prev) => (prev === "" ? String(rrSetting) : prev));
      setChecklist(null);
      setNewsId(null);
      setSetupTag("");
      if (prefill) {
        if (prefill.entry != null && prefill.entry !== "") setEntry(String(prefill.entry));
        if (prefill.stop != null && prefill.stop !== "") setStop(String(prefill.stop));
        if (prefill.target != null && prefill.target !== "") setTarget(String(prefill.target));
        if (prefill.direction) setDirection(prefill.direction);
        if (prefill.instrument) {
          const known = INSTRUMENTS.includes(
            prefill.instrument as (typeof INSTRUMENTS)[number],
          );
          setInstrument(known ? prefill.instrument : "Other");
          setCustomInstrument(known ? "" : prefill.instrument);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTrade?.id]);

  // Auto-flip default R multiple sign based on result (only for new trades / untouched values)
  useEffect(() => {
    if (rTouched) return;
    if (result === "Win") setRMultiple(String(Math.abs(rrSetting)));
    else if (result === "Loss") setRMultiple(String(-1));
    else setRMultiple("0");
  }, [result, rrSetting, rTouched]);

  // Live calculations
  const entryNum = parseFloat(entry);
  const stopNum = parseFloat(stop);
  const targetNum = parseFloat(target);
  const rNum = parseFloat(rMultiple);

  const stopDistance =
    Number.isFinite(entryNum) && Number.isFinite(stopNum)
      ? Math.abs(entryNum - stopNum)
      : null;

  const riskDollar = (balance * riskPct) / 100;

  const rrRatio =
    stopDistance != null &&
    stopDistance > 0 &&
    Number.isFinite(entryNum) &&
    Number.isFinite(targetNum)
      ? Math.abs(targetNum - entryNum) / stopDistance
      : null;

  const targetDollar = rrRatio != null ? riskDollar * rrRatio : null;

  const actualPnl = Number.isFinite(rNum) ? rNum * riskDollar : 0;

  // Image preview
  useEffect(() => {
    if (!chartFile) {
      setChartPreview(null);
      return;
    }
    const url = URL.createObjectURL(chartFile);
    setChartPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [chartFile]);

  const handleFile = (file: File | null) => {
    if (!file) {
      setChartFile(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Chart must be an image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setChartFile(file);
  };

  const resolvedInstrument =
    instrument === "Other" ? customInstrument.trim() : instrument;

  const requiredOk =
    !!date &&
    !!resolvedInstrument &&
    Number.isFinite(entryNum) &&
    Number.isFinite(stopNum) &&
    Number.isFinite(targetNum) &&
    stopDistance != null &&
    stopDistance > 0;

  const reset = () => {
    setDate(today());
    setInstrument(initialInstrument);
    setCustomInstrument(initialInstrument === "Other" ? "" : "");
    setDirection("Long");
    setEntry("");
    setStop("");
    setTarget("");
    setResult("Win");
    setRMultiple(String(rrSetting));
    setRTouched(false);
    setNotes("");
    setRangeSize("");
    setSetupTag("");
    setChartFile(null);
    setExistingChart(null);
    setErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadChart = async (): Promise<string | null> => {
    if (!chartFile || !user) return null;
    const ext = chartFile.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("trade-charts")
      .upload(path, chartFile, { contentType: chartFile.type });
    if (error) throw error;
    return path;
  };

  const submit = async () => {
    if (!user) return;
    const parsed = schema.safeParse({
      date,
      instrument: resolvedInstrument,
      customInstrument,
      direction,
      entry: entryNum,
      stop: stopNum,
      target: targetNum,
      result,
      rMultiple: rNum,
      notes,
      rangeSize: rangeSize === "" ? undefined : parseFloat(rangeSize),
    });

    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? "_";
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (stopDistance == null || stopDistance <= 0) {
      setErrors({ stop: "Stop must differ from entry" });
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      let chartUrl: string | null = existingChart;
      try {
        const uploaded = await uploadChart();
        if (uploaded) chartUrl = uploaded;
      } catch (err) {
        toast.error(
          `Chart upload failed: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }

      const payload = {
        date,
        instrument: resolvedInstrument,
        direction,
        entry: entryNum,
        stop: stopNum,
        target: targetNum,
        result,
        pnl: actualPnl,
        r_multiple: rNum,
        range_size: rangeSize === "" ? null : parseFloat(rangeSize),
        notes: notes.trim() || null,
        chart_url: chartUrl,
        checklist_score: checklist?.score ?? null,
        checklist_verdict: checklist?.verdict ?? null,
        news_id: newsId,
        setup_tag: setupTag === "" ? null : setupTag,
      };

      const { error } = isEdit && editTrade
        ? await updateTrade(editTrade.id, payload)
        : await createTrade({ user_id: user.id, ...payload });

      if (error) {
        toast.error(error.message);
        triggerHaptic("error");
        return;
      }
      toast.success(isEdit ? "Trade updated" : "Trade logged");
      // Screen-reader announcement
      try {
        const { announce } = await import("@/hooks/useAnnouncer");
        announce(
          isEdit
            ? "Trade updated. Balance refreshed."
            : `Trade logged${result ? ` as ${result}` : ""}. Balance updated.`,
        );
      } catch {
        // ignore
      }
      if (!isEdit) {
        // Result pattern takes precedence (avoids two back-to-back vibrate
        // calls overwriting each other).
        if (result === "Win") triggerHaptic("win");
        else if (result === "Loss") triggerHaptic("loss");
        else triggerHaptic("tradeLogged");
      }
      if (!isEdit) reset();
      setOpen(false);
      onLogged?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <SheetTrigger asChild>
          {trigger ?? (
            <Button
              size="sm"
              className="bg-trade-green text-background hover:bg-trade-green/90 font-data uppercase tracking-wider"
            >
              <Plus className="mr-1 h-4 w-4" />
              New Trade
            </Button>
          )}
        </SheetTrigger>
      )}
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto pb-8"
      >
        <SheetHeader>
          <SheetTitle className="font-heading">
            {isEdit ? "Edit Trade" : "Log Trade"}
          </SheetTitle>
          <SheetDescription>
            Enter setup, result, and notes. Risk and P&L update live.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Setup */}
          <Section title="Setup">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date" error={errors.date}>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  max={today()}
                />
              </Field>
              <Field label="Instrument" error={errors.instrument}>
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
              </Field>
              {instrument === "Other" && (
                <Field
                  label="Custom Instrument"
                  error={errors.instrument}
                  className="sm:col-span-2"
                >
                  <Input
                    value={customInstrument}
                    placeholder="e.g. CL, GC"
                    onChange={(e) => setCustomInstrument(e.target.value)}
                    maxLength={20}
                  />
                </Field>
              )}

              <Field label="Direction" className="sm:col-span-2">
                <ToggleGroup
                  value={direction}
                  onChange={(v) => setDirection(v as "Long" | "Short")}
                  options={[
                    { value: "Long", label: "Long", color: "blue" },
                    { value: "Short", label: "Short", color: "amber" },
                  ]}
                />
              </Field>

              <Field label="Setup Type" className="sm:col-span-2">
                <Select
                  value={setupTag === "" ? "__none" : setupTag}
                  onValueChange={(v) => setSetupTag(v === "__none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tag the setup (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Untagged</SelectItem>
                    {SETUP_TAGS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Entry" error={errors.entry}>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                />
              </Field>
              <Field label="Stop" error={errors.stop}>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={stop}
                  onChange={(e) => setStop(e.target.value)}
                />
              </Field>
              <Field
                label="Target"
                error={errors.target}
                className="sm:col-span-2"
              >
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* Live calc */}
          <div className="rounded-xl border border-trade-green/30 bg-trade-green/5 p-3">
            <div className="text-[10px] uppercase tracking-wider font-data text-trade-green mb-2">
              Live Calc
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                label="Stop dist"
                value={
                  stopDistance != null ? `${stopDistance.toFixed(2)} pts` : "—"
                }
              />
              <Stat label="Risk" value={fmtMoney(riskDollar)} />
              <Stat
                label="Target $"
                value={targetDollar != null ? fmtMoney(targetDollar) : "—"}
              />
              <Stat
                label="R:R"
                value={rrRatio != null ? `${rrRatio.toFixed(2)}R` : "—"}
              />
            </div>
          </div>

          {/* Result */}
          <Section title="Result">
            <Field label="Outcome">
              <ToggleGroup
                value={result}
                onChange={(v) => setResult(v as "Win" | "Loss" | "Scratch")}
                options={[
                  { value: "Win", label: "Win", color: "green" },
                  { value: "Loss", label: "Loss", color: "red" },
                  { value: "Scratch", label: "Scratch", color: "gray" },
                ]}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2 mt-3">
              <Field label="Actual R multiple" error={errors.rMultiple}>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={rMultiple}
                  onChange={(e) => {
                    setRMultiple(e.target.value);
                    setRTouched(true);
                  }}
                />
              </Field>
              <Field label="Actual P&L (auto)">
                <div
                  className={cn(
                    "h-10 px-3 flex items-center rounded-md border border-input bg-muted/30 font-data text-sm",
                    actualPnl > 0 && "text-trade-green",
                    actualPnl < 0 && "text-trade-red",
                  )}
                >
                  {actualPnl >= 0 ? "+" : ""}
                  {fmtMoney(actualPnl)}
                </div>
              </Field>
            </div>
          </Section>

          {/* Optional */}
          <Section title="Optional">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Range size (pts)" error={errors.rangeSize}>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={rangeSize}
                  onChange={(e) => setRangeSize(e.target.value)}
                />
              </Field>
              <Field label="Chart screenshot">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
                {chartPreview ? (
                  <div className="relative">
                    <img
                      src={chartPreview}
                      alt="Chart preview"
                      className="h-20 w-full rounded-md object-cover border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => handleFile(null)}
                      className="absolute top-1 right-1 rounded-full bg-background/80 p-1 hover:bg-background"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : existingChart ? (
                  <div className="flex items-center justify-between gap-2 h-10 px-3 rounded-md border border-input bg-muted/30 text-xs font-data">
                    <span className="text-muted-foreground truncate">
                      Chart attached
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-trade-green hover:underline"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => setExistingChart(null)}
                        className="text-trade-red hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-10 w-full justify-start gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload image
                  </Button>
                )}
              </Field>
              <Field label="Notes" className="sm:col-span-2" error={errors.notes}>
                <Textarea
                  rows={3}
                  value={notes}
                  maxLength={2000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did you see? Why this trade?"
                />
              </Field>
            </div>
          </Section>

          {/* Pre-Trade Checklist */}
          <Section title="Pre-Trade Checklist">
            <ChecklistSummary
              result={checklist}
              onOpen={() => setChecklistOpen(true)}
            />
          </Section>

          {/* News Event */}
          <Section title="News Event (optional)">
            <NewsPicker value={newsId} onChange={setNewsId} />
          </Section>
        </div>

        <SheetFooter className="mt-5">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !requiredOk}
            className="bg-trade-green text-background hover:bg-trade-green/90 font-data uppercase tracking-wider disabled:opacity-40"
          >
            {submitting ? "Saving..." : "Save Trade"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    <PreTradeChecklist
      open={checklistOpen}
      onOpenChange={setChecklistOpen}
      rrSetting={rrSetting}
      prefill={{
        rrMet:
          rrRatio != null && Number.isFinite(rrRatio)
            ? rrRatio >= rrSetting
            : undefined,
        ...(checklistPrefill ?? {}),
      }}
      initial={checklist}
      onConfirm={(r) => setChecklist(r)}
    />
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wider font-data text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-trade-red">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {label}
      </div>
      <div className="font-data text-sm text-foreground">{value}</div>
    </div>
  );
}

function ChecklistSummary({
  result,
  onOpen,
}: {
  result: ChecklistResult | null;
  onOpen: () => void;
}) {
  if (!result) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpen}
        className="h-10 w-full justify-start gap-2"
      >
        <ListChecks className="h-4 w-4" />
        Run Pre-Trade Checklist
      </Button>
    );
  }
  const v = result.verdict;
  const cls =
    v === "GO"
      ? "border-trade-green/40 bg-trade-green/10 text-trade-green"
      : v === "CAUTION"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
        : "border-trade-red/40 bg-trade-red/10 text-trade-red";
  const Icon = v === "GO" ? CheckCircle2 : v === "CAUTION" ? AlertTriangle : XCircle;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors hover:opacity-90",
        cls,
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="font-data text-sm font-bold uppercase tracking-wider">{v}</span>
      </span>
      <span className="font-data text-sm">
        {result.score}<span className="text-muted-foreground">/10</span>
        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Edit
        </span>
      </span>
    </button>
  );
}

type ToggleOpt = {
  value: string;
  label: string;
  color: "blue" | "amber" | "green" | "red" | "gray";
};

function ToggleGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ToggleOpt[];
}) {
  const colorMap: Record<ToggleOpt["color"], string> = {
    blue: "bg-blue-500/15 border-blue-500/50 text-blue-400",
    amber: "bg-amber-500/15 border-amber-500/50 text-amber-400",
    green: "bg-trade-green/15 border-trade-green/50 text-trade-green",
    red: "bg-trade-red/15 border-trade-red/50 text-trade-red",
    gray: "bg-muted border-border text-foreground",
  };
  return (
    <div className="flex gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 h-10 rounded-md border text-sm font-data uppercase tracking-wider transition-colors",
              active
                ? colorMap[opt.color]
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function NewTradeIconButton(props: Props) {
  return (
    <NewTradeSheet
      {...props}
      trigger={
        <Button
          className="fixed bottom-6 right-6 z-40 h-14 rounded-full px-5 bg-trade-green text-background hover:bg-trade-green/90 font-data uppercase tracking-wider"
          style={{ boxShadow: "0 0 24px rgba(0,255,170,0.45)" }}
        >
          <ImageIcon className="hidden" />
          <Plus className="mr-1 h-5 w-5" />
          Quick Log
        </Button>
      }
    />
  );
}

function NewsPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected: Article | null = useMemo(
    () => (value ? ARTICLES.find((a) => a.id === value) ?? null : null),
    [value],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...ARTICLES].sort((a, b) => b.publishedAt - a.publishedAt);
    if (!q) return base.slice(0, 8);
    return base
      .filter((a) =>
        [a.headline, a.source, ...a.tags].some((s) =>
          s.toLowerCase().includes(q),
        ),
      )
      .slice(0, 12);
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
        <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug">{selected.headline}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {selected.source}
            {selected.impact === "high" ? " · HIGH impact" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Remove news link"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search news that influenced this trade…"
          className="pl-8"
          maxLength={120}
        />
      </div>
      {open ? (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-card">
          {results.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No matching articles.</div>
          ) : (
            results.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange(a.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
              >
                <div className="text-xs font-medium leading-snug line-clamp-2">
                  {a.headline}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {a.source} · {a.impact} impact
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}