import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
  setupIdea?: { direction?: "long" | "short" | "none"; entry?: string; stop?: string; target?: string; rr?: string };
  risks?: string[];
  summary?: string;
};

function ChartAnalyzer() {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const analyze = useServerFn(analyzeChart);

  async function handleFile(file: File) {
    setError(null);
    setAnalysis(null);
    setRaw(null);
    setZoom(1);
    setUploadPct(0);
    let processed: ProcessedImage;
    try {
      processed = await processImageFile(file, setUploadPct);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read image.");
      return;
    }
    setImage(processed);
    setLoading(true);
    try {
      const res = await analyze({ data: { imageDataUrl: processed.dataUrl } });
      if (!res.ok) {
        setError(res.error);
      } else {
        setAnalysis((res.analysis as Analysis) ?? null);
        setRaw(res.raw ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setImage(null);
    setAnalysis(null);
    setError(null);
    setRaw(null);
    setZoom(1);
    setUploadPct(0);
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
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

        {/* Upload area */}
        {!image ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? "border-trade-green bg-trade-green/5"
                : "border-border bg-card hover:border-trade-green/50 hover:bg-trade-green/5"
            }`}
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-trade-green/10">
              <Camera className="h-7 w-7 text-trade-green" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Drop chart screenshot here or tap to upload
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PNG, JPG, WEBP · up to 10MB
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cameraRef.current?.click();
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent md:hidden"
              >
                <Camera className="h-3.5 w-3.5" />
                Camera
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  libraryRef.current?.click();
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent md:hidden"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Photos
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <FolderOpen className="h-3.5 w-3.5 hidden md:inline" />
                <Upload className="h-3.5 w-3.5 md:hidden" />
                Files
              </button>
            </div>

            {uploadPct > 0 && uploadPct < 100 && (
              <div className="mt-5 w-full max-w-xs">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-trade-green transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] font-data uppercase tracking-wider text-muted-foreground">
                  Reading… {uploadPct}%
                </p>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <input
              ref={libraryRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-3">
            <div
              className="relative max-h-[55vh] overflow-auto rounded-lg bg-background"
              style={{ touchAction: "pinch-zoom" }}
            >
              <img
                src={image.dataUrl}
                alt={image.name}
                className="block origin-top-left select-none"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  width: zoom === 1 ? "100%" : "auto",
                  maxWidth: zoom === 1 ? "100%" : "none",
                }}
                draggable={false}
              />
            </div>

            {/* Zoom controls */}
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background hover:bg-accent"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[3rem] text-center text-[11px] font-data text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background hover:bg-accent"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background hover:bg-accent"
                  aria-label="Reset zoom"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 rounded-md border border-trade-red/30 bg-trade-red/10 px-3 py-1.5 text-xs font-medium text-trade-red hover:bg-trade-red/20"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>

            {/* File metadata */}
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border bg-background/50 p-2.5 text-[11px] font-data">
              <div className="truncate">
                <div className="text-muted-foreground uppercase tracking-wider text-[9px]">Name</div>
                <div className="truncate text-foreground" title={image.name}>{image.name}</div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase tracking-wider text-[9px]">Size</div>
                <div className="text-foreground">
                  {formatBytes(image.bytes)}
                  {image.compressed && (
                    <span className="ml-1 text-trade-green">
                      ↓ from {formatBytes(image.originalBytes)}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase tracking-wider text-[9px]">Dimensions</div>
                <div className="text-foreground">{image.width}×{image.height}</div>
              </div>
            </div>
          </div>
        )}

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

          {!loading && analysis && <AnalysisView a={analysis} />}

          {!loading && !analysis && raw && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs font-data text-muted-foreground">
              {raw}
            </pre>
          )}
        </div>
      </div>
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

function AnalysisView({ a }: { a: Analysis }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
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
        <TrendBadge trend={a.trend} />
      </div>

      {a.summary && (
        <p className="rounded-lg border border-border bg-background/50 p-3 text-sm text-foreground">
          {a.summary}
        </p>
      )}

      {a.structure && <Section title="Structure">{a.structure}</Section>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section title="Support">
          <Chips items={a.keyLevels?.support} />
        </Section>
        <Section title="Resistance">
          <Chips items={a.keyLevels?.resistance} />
        </Section>
        <Section title="Patterns">
          <Chips items={a.patterns} />
        </Section>
        <Section title="Indicators">
          <Chips items={a.indicators} />
        </Section>
      </div>

      {a.setupIdea && (
        <div className="rounded-lg border border-trade-green/20 bg-trade-green/5 p-3">
          <h3 className="mb-2 text-[10px] font-data uppercase tracking-[2px] text-trade-green">
            Setup Idea {a.setupIdea.direction ? `· ${a.setupIdea.direction.toUpperCase()}` : ""}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs font-data sm:grid-cols-4">
            <div><span className="text-muted-foreground">Entry</span><div>{a.setupIdea.entry ?? "—"}</div></div>
            <div><span className="text-muted-foreground">Stop</span><div>{a.setupIdea.stop ?? "—"}</div></div>
            <div><span className="text-muted-foreground">Target</span><div>{a.setupIdea.target ?? "—"}</div></div>
            <div><span className="text-muted-foreground">R:R</span><div>{a.setupIdea.rr ?? "—"}</div></div>
          </div>
        </div>
      )}

      {a.bias && <Section title="Bias">{a.bias}</Section>}

      {a.risks && a.risks.length > 0 && (
        <Section title="Risks">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {a.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      <p className="pt-2 text-[10px] text-muted-foreground">
        AI analysis is informational — not financial advice. Always confirm with your own process.
      </p>
    </div>
  );
}
