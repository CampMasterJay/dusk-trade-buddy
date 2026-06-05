import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Sparkles,
  X,
  Upload,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Image as ImageIcon,
  FolderOpen,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Link2,
  Star,
  ArrowLeft,
  ArrowUp,
  Target as TargetIcon,
  CheckCircle2,
  AlertTriangle,
  Save,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { analyzeChart } from "@/lib/api/chartAnalysis.functions";
import {
  formatBytes,
  processImageFile,
  type ProcessedImage,
} from "@/lib/imageUpload";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { SetupScorer } from "@/components/SetupScorer";
import {
  buildAnalysisInsert,
  deleteChartAnalysis,
  linkAnalysisToTrade,
  listChartAnalyses,
  saveChartAnalysis,
  type ChartAnalysis as SavedAnalysis,
} from "@/lib/chartAnalysisService";
import { getTrades, type Trade } from "@/lib/tradeService";

export const Route = createFileRoute("/chart-analyzer")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Chart Analyzer" },
      { name: "description", content: "AI-powered technical chart analysis: upload a screenshot and get structure, levels, patterns, and a setup idea." },
      { property: "og:title", content: "EdgeTrader — Chart Analyzer" },
      { property: "og:description", content: "AI-powered chart analysis for traders." },
    ],
  }),
  component: ChartAnalyzer,
});

type Analysis = {
  instrument?: string | null;
  timeframe?: string | null;
  trend?: "bullish" | "bearish" | "sideways";
  structure?: string;
  keyLevels?: { support?: string[]; resistance?: string[] };
  patterns?: string[];
  indicators?: string[];
  bias?: string;
  biasDirection?: "Long" | "Short" | "Neutral" | string;
  setupDetected?: string;
  setupQuality?: number;
  confluenceFactors?: string[];
  riskFactors?: string[];
  setupIdea?: { direction?: "long" | "short" | "none"; entry?: string; stop?: string; target?: string; rr?: string };
  risks?: string[];
  summary?: string;
  frames?: Partial<Record<"HTF" | "MTF" | "LTF", {
    timeframe?: string | null;
    trend?: "bullish" | "bearish" | "sideways" | string;
    structure?: string;
    summary?: string;
  } | null>>;
  mtfAlignment?: {
    aligned?: number;
    total?: number;
    verdict?: string;
    htfTrend?: string;
    mtfStructure?: string;
    ltfSignal?: string;
  };
};

type Slot = "HTF" | "MTF" | "LTF";
const SLOT_META: { key: Slot; label: string; tfs: string[] }[] = [
  { key: "HTF", label: "Higher Timeframe", tfs: ["4h", "1h", "Daily"] },
  { key: "MTF", label: "Entry Timeframe", tfs: ["15m", "5m"] },
  { key: "LTF", label: "Trigger Timeframe", tfs: ["2m", "1m"] },
];

function ChartAnalyzer() {
  const [frames, setFrames] = useState<
    Record<Slot, { image: ProcessedImage; timeframe: string } | null>
  >({ HTF: null, MTF: null, LTF: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const analyze = useServerFn(analyzeChart);
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const navigate = useNavigate();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"analyzer" | "history">("analyzer");
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SavedAnalysis | null>(null);
  const [filterSetup, setFilterSetup] = useState<string>("all");
  const [filterInstrument, setFilterInstrument] = useState<string>("all");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [linkSheetFor, setLinkSheetFor] = useState<SavedAnalysis | null>(null);

  async function refreshHistory() {
    if (!user) return;
    setHistoryLoading(true);
    setHistoryError(null);
    const { data, error } = await listChartAnalyses(user.id);
    if (error) setHistoryError(error.message);
    else setHistory(data ?? []);
    setHistoryLoading(false);
  }

  useEffect(() => {
    if (tab === "history" && user) {
      void refreshHistory();
      void getTrades(user.id, 100).then(({ data }) => setTrades(data ?? []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id]);

  const setupOptions = useMemo(() => {
    const s = new Set<string>();
    history.forEach((h) => h.setup_detected && s.add(h.setup_detected));
    return Array.from(s);
  }, [history]);
  const instrumentOptions = useMemo(() => {
    const s = new Set<string>();
    history.forEach((h) => h.instrument && s.add(h.instrument));
    return Array.from(s);
  }, [history]);
  const filtered = useMemo(
    () =>
      history.filter(
        (h) =>
          (filterSetup === "all" || h.setup_detected === filterSetup) &&
          (filterInstrument === "all" || h.instrument === filterInstrument),
      ),
    [history, filterSetup, filterInstrument],
  );

  const firstFrame = frames.HTF ?? frames.MTF ?? frames.LTF;
  const filledSlots = (["HTF", "MTF", "LTF"] as const).filter((s) => frames[s]);
  const canAnalyze = filledSlots.length > 0 && !loading;

  async function handleSlotFile(slot: Slot, file: File, timeframe: string) {
    setError(null);
    setSavedId(null);
    let processed: ProcessedImage;
    try {
      processed = await processImageFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read image.");
      return;
    }
    setFrames((f) => ({ ...f, [slot]: { image: processed, timeframe } }));
  }

  function setSlotTimeframe(slot: Slot, tf: string) {
    setFrames((f) => {
      const cur = f[slot];
      if (!cur) return f;
      return { ...f, [slot]: { ...cur, timeframe: tf } };
    });
  }

  function clearSlot(slot: Slot) {
    setFrames((f) => ({ ...f, [slot]: null }));
  }

  async function runAnalysis() {
    if (!canAnalyze) return;
    setError(null);
    setAnalysis(null);
    setRaw(null);
    setSavedId(null);
    setLoading(true);
    try {
      const payloadFrames = filledSlots.map((slot) => ({
        slot,
        timeframe: frames[slot]!.timeframe || undefined,
        imageDataUrl: frames[slot]!.image.dataUrl,
      }));
      const res = await analyze({ data: { frames: payloadFrames } });
      if (!res.ok) {
        setError(res.error);
      } else {
        const a = (res.analysis as Analysis) ?? null;
        setAnalysis(a);
        setRaw(res.raw ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setFrames({ HTF: null, MTF: null, LTF: null });
    setAnalysis(null);
    setError(null);
    setRaw(null);
    setSavedId(null);
  }

  return (
    <ProtectedRoute>
      <AppHeader balance={12450.0} />
      <div className="mx-auto max-w-3xl p-4 lg:p-6 space-y-5 pb-24">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-bold font-data uppercase tracking-[4px]">
            CHART ANALYZER
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-trade-green/30 bg-trade-green/10 px-2.5 py-1 text-[10px] font-data uppercase tracking-wider text-trade-green">
            <Sparkles className="h-3 w-3" />
            AI
          </span>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
          {(["analyzer", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-2 text-xs font-data uppercase tracking-wider transition-colors ${
                tab === t
                  ? "bg-trade-green/15 text-trade-green"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {t === "analyzer" ? "Analyze" : "Previous"}
            </button>
          ))}
        </div>

        {tab === "history" && (
          <HistoryView
            items={filtered}
            loading={historyLoading}
            error={historyError}
            setupOptions={setupOptions}
            instrumentOptions={instrumentOptions}
            filterSetup={filterSetup}
            filterInstrument={filterInstrument}
            onFilterSetup={setFilterSetup}
            onFilterInstrument={setFilterInstrument}
            onOpen={setSelected}
            onDelete={async (id) => {
              await deleteChartAnalysis(id);
              await refreshHistory();
            }}
            onLink={setLinkSheetFor}
            trades={trades}
          />
        )}

        {tab === "analyzer" && (<>
        {/* Multi-Timeframe upload */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold font-data uppercase tracking-[3px] text-muted-foreground">
              Multi-Timeframe Input
            </h2>
            <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              {filledSlots.length}/3 frames
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SLOT_META.map((m) => (
              <FrameSlot
                key={m.key}
                slot={m.key}
                label={m.label}
                timeframeOptions={m.tfs}
                frame={frames[m.key]}
                onFile={(file, tf) => void handleSlotFile(m.key, file, tf)}
                onTimeframeChange={(tf) => setSlotTimeframe(m.key, tf)}
                onClear={() => clearSlot(m.key)}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Add 1–3 charts of the same instrument at different timeframes for a top-down read.
            </p>
            <div className="flex items-center gap-2">
              {filledSlots.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={!canAnalyze}
                className="inline-flex items-center gap-1.5 rounded-md bg-trade-green px-4 py-1.5 text-xs font-bold font-data uppercase tracking-wider text-background hover:bg-trade-green/90 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {loading ? "Analyzing…" : "Analyze"}
              </button>
            </div>
          </div>
        </div>

        {/* Results panel */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold font-data uppercase tracking-[3px] text-muted-foreground">
              Analysis
            </h2>
            {loading && (
              <span className="text-[10px] font-data uppercase tracking-wider text-trade-green animate-pulse">
                Analyzing…
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-trade-red/40 bg-trade-red/5 p-3 text-sm text-trade-red">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !analysis && !raw && !error && (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Upload a chart to get analysis
              </p>
            </div>
          )}

          {loading && <AnalysisSkeleton />}

          {!loading && analysis && (
            <AnalysisView
              a={analysis}
              balance={Number(settings?.current_balance ?? 0)}
              riskPct={Number(settings?.risk_pct ?? 0)}
              minRr={Number(settings?.rr_ratio ?? 1.5)}
              session={settings?.session ?? null}
                chartImageUrl={firstFrame?.image.dataUrl ?? null}
              onUseLevels={() => {
                const dir = (analysis.biasDirection ?? analysis.setupIdea?.direction ?? "")
                  .toString()
                  .toLowerCase();
                const direction =
                  dir === "long" ? "Long" : dir === "short" ? "Short" : undefined;
                sessionStorage.setItem(
                  "pendingTradePrefill",
                  JSON.stringify({
                    entry: analysis.setupIdea?.entry ?? "",
                    stop: analysis.setupIdea?.stop ?? "",
                    target: analysis.setupIdea?.target ?? "",
                    direction,
                    instrument: analysis.instrument ?? undefined,
                  }),
                );
                void navigate({ to: "/trade-log" });
              }}
              onSave={async () => {
                if (!user || !firstFrame || savedId) return;
                setSaving(true);
                const { data } = await saveChartAnalysis(
                  buildAnalysisInsert({
                    userId: user.id,
                    chartUrl: firstFrame.image.dataUrl,
                    analysis: analysis as unknown as Record<string, unknown>,
                  }),
                );
                if (data) setSavedId(data.id);
                setSaving(false);
              }}
              saved={!!savedId}
              saving={saving}
            />
          )}

          {!loading && !analysis && raw && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs font-data text-muted-foreground">
              {raw}
            </pre>
          )}
        </div>
        </>)}
      </div>

      {selected && (
        <DetailModal item={selected} onClose={() => setSelected(null)} />
      )}

      {linkSheetFor && (
        <LinkTradeModal
          item={linkSheetFor}
          trades={trades}
          onClose={() => setLinkSheetFor(null)}
          onLinked={async (tradeId) => {
            await linkAnalysisToTrade(linkSheetFor.id, tradeId);
            setLinkSheetFor(null);
            await refreshHistory();
          }}
        />
      )}
    </ProtectedRoute>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-muted"
          style={{ width: `${90 - i * 10}%` }}
        />
      ))}
      <div className="grid grid-cols-2 gap-2 pt-3">
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend?: string }) {
  const t = trend ?? "sideways";
  const map: Record<string, { cls: string; Icon: typeof TrendingUp; label: string }> = {
    bullish: { cls: "text-trade-green bg-trade-green/10 border-trade-green/30", Icon: TrendingUp, label: "Bullish" },
    bearish: { cls: "text-trade-red bg-trade-red/10 border-trade-red/30", Icon: TrendingDown, label: "Bearish" },
    sideways: { cls: "text-muted-foreground bg-muted border-border", Icon: Minus, label: "Sideways" },
  };
  const c = map[t] ?? map.sideways;
  const Icon = c.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-data uppercase tracking-wider ${c.cls}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
        {title}
      </h3>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function Chips({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={i} className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-data">
          {it}
        </span>
      ))}
    </div>
  );
}

function BiasBadge({ b }: { b?: string }) {
  const norm = (b ?? "").toLowerCase();
  const variant =
    norm === "long"
      ? { cls: "bg-blue-500/15 text-blue-400 border-blue-500/40", label: "LONG" }
      : norm === "short"
        ? { cls: "bg-amber-500/15 text-amber-400 border-amber-500/40", label: "SHORT" }
        : { cls: "bg-muted text-muted-foreground border-border", label: "NEUTRAL" };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-data font-bold uppercase tracking-[2px] ${variant.cls}`}
    >
      {variant.label}
    </span>
  );
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fmtUsd(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
}

function AnalysisView({
  a,
  balance,
  riskPct,
  minRr,
  session,
  chartImageUrl,
  onUseLevels,
  onSave,
  saved,
  saving,
}: {
  a: Analysis;
  balance?: number;
  riskPct?: number;
  minRr?: number;
  session?: string | null;
  chartImageUrl?: string | null;
  onUseLevels?: () => void;
  onSave?: () => void | Promise<void>;
  saved?: boolean;
  saving?: boolean;
}) {
  const _balance = balance ?? 0;
  const _riskPct = riskPct ?? 0;
  const setupName = (a.setupDetected ?? a.patterns?.[0] ?? "Setup")
    .toString()
    .toUpperCase();
  const quality = Math.max(
    0,
    Math.min(5, Math.round(Number(a.setupQuality ?? 0))),
  );
  const bias = a.biasDirection ?? a.setupIdea?.direction ?? "neutral";

  const entry = toNum(a.setupIdea?.entry);
  const stop = toNum(a.setupIdea?.stop);
  const target = toNum(a.setupIdea?.target);
  const rr =
    entry != null && stop != null && target != null && entry !== stop
      ? Math.abs(target - entry) / Math.abs(entry - stop)
      : toNum(a.setupIdea?.rr);
  const riskDollar = _balance > 0 && _riskPct > 0 ? (_balance * _riskPct) / 100 : 0;
  const targetDollar = rr != null && rr > 0 ? riskDollar * rr : 0;

  const confluence = a.confluenceFactors ?? [];
  const risks = a.riskFactors ?? a.risks ?? [];

  return (
    <div className="space-y-5">
      {/* Annotated chart preview */}
      {chartImageUrl && (
        <AnnotatedChartPreview
          src={chartImageUrl}
          entry={entry}
          stop={stop}
          target={target}
          bias={bias}
        />
      )}

      {/* MTF Alignment (top) */}
      {(a.mtfAlignment || a.frames) && <MtfAlignmentCard a={a} />}

      {/* Section 1 — Setup Overview */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold font-data uppercase tracking-[2px] leading-tight text-foreground">
            {setupName}
          </h2>
          <BiasBadge b={bias} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${
                  i < quality
                    ? "fill-trade-green text-trade-green"
                    : "text-muted-foreground/40"
                }`}
              />
            ))}
            <span className="ml-1.5 text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              Quality {quality}/5
            </span>
          </div>
          <TrendBadge trend={a.trend} />
          {a.instrument && (
            <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-data">
              {a.instrument}
            </span>
          )}
          {a.timeframe && (
            <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-data">
              {a.timeframe}
            </span>
          )}
        </div>
      </div>

      {/* Section 2 — Trade Levels */}
      <div className="rounded-xl border border-trade-green/30 bg-gradient-to-br from-trade-green/5 to-transparent p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[10px] font-data uppercase tracking-[3px] text-trade-green">
            Trade Levels
          </h3>
          {rr != null && (
            <span className="inline-flex items-center rounded-full border border-trade-green/40 bg-trade-green/10 px-2 py-0.5 text-[11px] font-data font-bold text-trade-green">
              R:R {rr.toFixed(2)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-background p-2.5">
            <div className="flex items-center gap-1 text-[9px] font-data uppercase tracking-wider text-muted-foreground">
              <ArrowUp className="h-3 w-3 text-trade-green" /> Entry
            </div>
            <div className="mt-1 text-sm font-bold font-data text-trade-green">
              {entry ?? a.setupIdea?.entry ?? "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-2.5">
            <div className="flex items-center gap-1 text-[9px] font-data uppercase tracking-wider text-muted-foreground">
              <X className="h-3 w-3 text-trade-red" /> Stop
            </div>
            <div className="mt-1 text-sm font-bold font-data text-trade-red">
              {stop ?? a.setupIdea?.stop ?? "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-2.5">
            <div className="flex items-center gap-1 text-[9px] font-data uppercase tracking-wider text-muted-foreground">
              <TargetIcon className="h-3 w-3 text-trade-green" /> Target
            </div>
            <div className="mt-1 text-sm font-bold font-data text-trade-green">
              {target ?? a.setupIdea?.target ?? "—"}
            </div>
          </div>
        </div>
        {riskDollar > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <div className="text-xs font-data">
              <span className="text-muted-foreground uppercase tracking-wider text-[9px]">
                Risk
              </span>
              <div className="text-trade-red font-bold">{fmtUsd(riskDollar)}</div>
            </div>
            <div className="text-xs font-data">
              <span className="text-muted-foreground uppercase tracking-wider text-[9px]">
                Target
              </span>
              <div className="text-trade-green font-bold">
                {targetDollar > 0 ? fmtUsd(targetDollar) : "—"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Setup Scorer */}
      <SetupScorer
        inputs={{
          trend: a.trend,
          biasDirection: a.biasDirection ?? a.setupIdea?.direction,
          confluenceFactors: confluence,
          riskFactors: risks,
          rr,
          minRr,
          session,
        }}
      />

      {/* Section 3 — Key Levels */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="mb-2 text-[10px] font-data uppercase tracking-[2px] text-trade-green">
            Support
          </h3>
          {a.keyLevels?.support && a.keyLevels.support.length > 0 ? (
            <ul className="space-y-1">
              {a.keyLevels.support.map((s, i) => (
                <li
                  key={i}
                  className="font-data text-sm font-medium text-trade-green"
                >
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="mb-2 text-[10px] font-data uppercase tracking-[2px] text-trade-red">
            Resistance
          </h3>
          {a.keyLevels?.resistance && a.keyLevels.resistance.length > 0 ? (
            <ul className="space-y-1">
              {a.keyLevels.resistance.map((s, i) => (
                <li
                  key={i}
                  className="font-data text-sm font-medium text-trade-red"
                >
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {/* Section 4 — Confluence */}
      {confluence.length > 0 && (
        <div>
          <h3 className="mb-2 text-[10px] font-data uppercase tracking-[2px] text-trade-green">
            Confluence Factors
          </h3>
          <ul className="space-y-1.5">
            {confluence.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-trade-green" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section 5 — Risk Factors */}
      {risks.length > 0 && (
        <div>
          <h3 className="mb-2 text-[10px] font-data uppercase tracking-[2px] text-trade-red">
            Risk Factors
          </h3>
          <ul className="space-y-1.5">
            {risks.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-trade-red" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section 6 — AI Summary */}
      {a.summary && (
        <div className="rounded-xl border border-trade-green/20 bg-gradient-to-br from-trade-green/8 via-card to-card p-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[2px] text-trade-green">
            <Sparkles className="h-3 w-3" />
            AI Summary
          </div>
          <p className="text-sm leading-relaxed text-foreground">{a.summary}</p>
        </div>
      )}

      {/* Section 7 — Action Buttons */}
      {(onUseLevels || onSave) && (
      <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onUseLevels}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-trade-green px-4 py-3 text-sm font-bold font-data uppercase tracking-wider text-background hover:bg-trade-green/90 transition-colors"
        >
          Use These Levels
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => void onSave?.()}
          disabled={saved || saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-bold font-data uppercase tracking-wider hover:bg-accent disabled:opacity-60"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4 text-trade-green" /> Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Analysis"}
            </>
          )}
        </button>
      </div>
      )}

      <p className="pt-1 text-[10px] text-muted-foreground">
        AI analysis is informational — not financial advice. Always confirm with your own process.
      </p>
    </div>
  );
}

function QualityStars({ q }: { q: number | null | undefined }) {
  const v = q ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i < v ? "fill-trade-green text-trade-green" : "text-muted-foreground"
          }`}
        />
      ))}
    </div>
  );
}

function HistoryView(props: {
  items: SavedAnalysis[];
  loading: boolean;
  error: string | null;
  setupOptions: string[];
  instrumentOptions: string[];
  filterSetup: string;
  filterInstrument: string;
  onFilterSetup: (v: string) => void;
  onFilterInstrument: (v: string) => void;
  onOpen: (item: SavedAnalysis) => void;
  onDelete: (id: string) => void | Promise<void>;
  onLink: (item: SavedAnalysis) => void;
  trades: Trade[];
}) {
  const {
    items, loading, error, setupOptions, instrumentOptions,
    filterSetup, filterInstrument, onFilterSetup, onFilterInstrument,
    onOpen, onDelete, onLink, trades,
  } = props;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={filterInstrument}
          onChange={(e) => onFilterInstrument(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs font-data"
        >
          <option value="all">All instruments</option>
          {instrumentOptions.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <select
          value={filterSetup}
          onChange={(e) => onFilterSetup(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs font-data"
        >
          <option value="all">All setups</option>
          {setupOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-trade-red/40 bg-trade-red/5 p-3 text-sm text-trade-red">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">No analyses yet</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const linkedTrade = trades.find((t) => t.id === it.linked_trade_id);
            return (
              <li
                key={it.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <button
                  type="button"
                  onClick={() => onOpen(it)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  {it.chart_url ? (
                    <img
                      src={it.chart_url}
                      alt="chart"
                      className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {it.setup_detected ?? "—"}
                      </span>
                      {it.instrument && (
                        <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-data">
                          {it.instrument}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <QualityStars q={it.setup_quality} />
                      <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
                        {new Date(it.created_at).toLocaleDateString()}
                      </span>
                      {linkedTrade && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-data uppercase tracking-wider text-trade-green">
                          <Link2 className="h-3 w-3" />
                          linked
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onLink(it)}
                    aria-label="Link to trade"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-accent"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Delete this analysis?")) void onDelete(it.id);
                    }}
                    aria-label="Delete"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-trade-red/30 bg-trade-red/10 text-trade-red hover:bg-trade-red/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DetailModal({
  item,
  onClose,
}: {
  item: SavedAnalysis;
  onClose: () => void;
}) {
  const a = (item.raw_analysis as unknown as Analysis | null) ?? null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-data uppercase tracking-wider text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            {new Date(item.created_at).toLocaleString()}
          </span>
        </div>
        <div className="space-y-4 p-4">
          {a ? (
            <AnalysisView a={a} chartImageUrl={item.chart_url ?? null} />
          ) : (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Setup:</span> {item.setup_detected ?? "—"}</p>
              <p><span className="text-muted-foreground">Bias:</span> {item.bias_direction ?? "—"}</p>
              <p className="text-foreground">{item.summary ?? "—"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LinkTradeModal({
  item,
  trades,
  onClose,
  onLinked,
}: {
  item: SavedAnalysis;
  trades: Trade[];
  onClose: () => void;
  onLinked: (tradeId: string | null) => void | Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <h3 className="text-xs font-data uppercase tracking-[2px] text-muted-foreground">
            Link to trade
          </h3>
        </div>
        <div className="divide-y divide-border">
          {item.linked_trade_id && (
            <button
              type="button"
              onClick={() => onLinked(null)}
              className="block w-full px-4 py-3 text-left text-sm text-trade-red hover:bg-accent"
            >
              Unlink current trade
            </button>
          )}
          {trades.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No trades to link
            </div>
          ) : (
            trades.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onLinked(t.id)}
                className="block w-full px-4 py-3 text-left hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {t.instrument} · {t.direction}
                  </span>
                  <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
                    {t.date}
                  </span>
                </div>
                <div className="text-[11px] font-data text-muted-foreground">
                  {t.result} · R {t.r_multiple ?? "—"}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-data uppercase tracking-wider hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function FrameSlot({
  slot,
  label,
  timeframeOptions,
  frame,
  onFile,
  onTimeframeChange,
  onClear,
}: {
  slot: Slot;
  label: string;
  timeframeOptions: string[];
  frame: { image: ProcessedImage; timeframe: string } | null;
  onFile: (file: File, timeframe: string) => void;
  onTimeframeChange: (tf: string) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tf, setTf] = useState<string>(
    frame?.timeframe ?? timeframeOptions[0],
  );
  useEffect(() => {
    if (frame?.timeframe) setTf(frame.timeframe);
  }, [frame?.timeframe]);

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] font-data uppercase tracking-[2px] text-trade-green">
            {slot}
          </div>
          <div className="truncate text-xs font-medium text-foreground">
            {label}
          </div>
        </div>
        <select
          value={tf}
          onChange={(e) => {
            setTf(e.target.value);
            if (frame) onTimeframeChange(e.target.value);
          }}
          className="rounded border border-border bg-card px-1.5 py-1 text-[11px] font-data"
        >
          {timeframeOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {frame ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <img
              src={frame.image.dataUrl}
              alt={`${slot} chart`}
              className="block h-28 w-full object-cover"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-data text-muted-foreground">
              {formatBytes(frame.image.bytes)} · {frame.image.width}×{frame.image.height}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[10px] font-medium hover:bg-accent"
              >
                <Upload className="h-3 w-3" />
                Replace
              </button>
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded border border-trade-red/30 bg-trade-red/10 px-2 py-1 text-[10px] font-medium text-trade-red hover:bg-trade-red/20"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-trade-green/50 hover:bg-trade-green/5 hover:text-trade-green"
        >
          <Camera className="h-5 w-5" />
          <span className="text-[10px] font-data uppercase tracking-wider">
            Upload
          </span>
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f, tf);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function MtfAlignmentCard({ a }: { a: Analysis }) {
  const m = a.mtfAlignment;
  const fr = a.frames;
  if (!m && !fr) return null;
  const total = m?.total ?? Object.values(fr ?? {}).filter(Boolean).length ?? 0;
  const aligned = m?.aligned ?? 0;
  const fullAligned = total > 0 && aligned === total;
  const color = fullAligned
    ? "#00ffaa"
    : aligned >= 2
      ? "#4ade80"
      : aligned === 1
        ? "#f59e0b"
        : "#f87171";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
          Multi-Timeframe Alignment
        </h3>
        <div className="text-right">
          <div
            className="font-data font-bold leading-none"
            style={{ color, fontSize: "1.75rem" }}
          >
            {aligned}
            <span className="text-sm text-muted-foreground font-normal">
              /{total || 3}
            </span>
          </div>
          <div
            className="mt-0.5 text-[9px] font-data uppercase tracking-[2px]"
            style={{ color }}
          >
            timeframes aligned
          </div>
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        {m?.htfTrend && (
          <div className="flex items-baseline gap-2">
            <span className="w-12 font-data uppercase tracking-wider text-[10px] text-muted-foreground">
              HTF
            </span>
            <span className="text-foreground">
              <span className="text-muted-foreground">Trend:</span>{" "}
              <span className="font-medium">{m.htfTrend}</span>
            </span>
          </div>
        )}
        {m?.mtfStructure && (
          <div className="flex items-baseline gap-2">
            <span className="w-12 font-data uppercase tracking-wider text-[10px] text-muted-foreground">
              MTF
            </span>
            <span className="text-foreground">
              <span className="text-muted-foreground">Structure:</span>{" "}
              <span className="font-medium">{m.mtfStructure}</span>
            </span>
          </div>
        )}
        {m?.ltfSignal && (
          <div className="flex items-baseline gap-2">
            <span className="w-12 font-data uppercase tracking-wider text-[10px] text-muted-foreground">
              LTF
            </span>
            <span className="text-foreground">
              <span className="text-muted-foreground">Signal:</span>{" "}
              <span className="font-medium">{m.ltfSignal}</span>
            </span>
          </div>
        )}
      </div>

      {m?.verdict && (
        <div
          className="mt-3 rounded-lg border px-3 py-2 text-center text-[11px] font-data font-bold uppercase tracking-[2px]"
          style={{
            color,
            borderColor: `${color}66`,
            backgroundColor: `${color}1A`,
          }}
        >
          {m.verdict}
        </div>
      )}
    </div>
  );
}

function AnnotatedChartPreview({
  src,
  entry,
  stop,
  target,
  bias,
}: {
  src: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  bias?: string | null;
}) {
  const [show, setShow] = useState(true);
  const dir = (bias ?? "").toString().toLowerCase();
  const isShort = dir === "short";
  const accent = isShort ? "#f87171" : "#22c55e";
  const accentSoft = isShort ? "rgba(248,113,113,0.15)" : "rgba(34,197,94,0.15)";
  const hasLevels = entry != null || stop != null || target != null;

  const fmt = (n: number | null) =>
    n == null ? "—" : Number.isInteger(n) ? n.toString() : n.toFixed(2);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
          Chart Preview
        </span>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[10px] font-data uppercase tracking-wider hover:bg-accent"
        >
          {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {show ? "Hide" : "Show"} overlay
        </button>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-border bg-card">
        <img src={src} alt="chart" className="block w-full" />
        {show && hasLevels && (
          <div
            className="absolute bottom-2 right-2 min-w-[140px] rounded-md border p-2 backdrop-blur-md"
            style={{
              borderColor: `${accent}80`,
              backgroundColor: "rgba(0,0,0,0.55)",
              boxShadow: `0 0 0 1px ${accentSoft}`,
            }}
          >
            <div
              className="mb-1 text-[9px] font-data font-bold uppercase tracking-[2px]"
              style={{ color: accent }}
            >
              {isShort ? "Short Setup" : dir === "long" ? "Long Setup" : "Setup"}
            </div>
            <div className="space-y-0.5 font-data text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] uppercase tracking-wider text-white/60">Entry</span>
                <span className="font-semibold" style={{ color: "#4ade80" }}>{fmt(entry)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] uppercase tracking-wider text-white/60">Stop</span>
                <span className="font-semibold" style={{ color: "#f87171" }}>{fmt(stop)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] uppercase tracking-wider text-white/60">Target</span>
                <span className="font-semibold" style={{ color: "#4ade80" }}>{fmt(target)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
