import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  Upload,
  X,
  Sparkles,
  Star,
  ArrowRight,
  Trash2,
  AlertCircle,
  Trophy,
  EyeOff,
} from "lucide-react";
import { analyzeChart } from "@/lib/api/chartAnalysis.functions";
import { processImageFile, type ProcessedImage } from "@/lib/imageUpload";

const MAX_IMAGES = 5;

type ScanAnalysis = {
  instrument?: string | null;
  timeframe?: string | null;
  trend?: string;
  biasDirection?: string;
  setupDetected?: string;
  setupQuality?: number;
  summary?: string;
  setupIdea?: {
    direction?: string;
    entry?: string;
    stop?: string;
    target?: string;
    rr?: string;
  };
};

type ScanItem = {
  id: string;
  image: ProcessedImage;
  status: "pending" | "loading" | "done" | "error" | "dismissed";
  analysis: ScanAnalysis | null;
  error?: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function ScanMode() {
  const analyze = useServerFn(analyzeChart);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const room = MAX_IMAGES - items.length;
    if (room <= 0) {
      setError(`Limit is ${MAX_IMAGES} images per scan.`);
      return;
    }
    const picked = Array.from(files).slice(0, room);
    const next: ScanItem[] = [];
    for (const f of picked) {
      try {
        const image = await processImageFile(f);
        next.push({
          id: uid(),
          image,
          status: "pending",
          analysis: null,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read image.");
      }
    }
    setItems((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function analyzeAll() {
    const queue = items.filter(
      (i) => i.status === "pending" || i.status === "error",
    );
    if (queue.length === 0 || running) return;
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: queue.length });
    setItems((prev) =>
      prev.map((i) =>
        queue.find((q) => q.id === i.id) ? { ...i, status: "loading" } : i,
      ),
    );

    let done = 0;
    await Promise.all(
      queue.map(async (it) => {
        try {
          const __aiStart = performance.now();
          const res = await analyze({
            data: { imageDataUrl: it.image.dataUrl },
          });
          {
            const { logPerf } = await import("@/lib/perfLog");
            void logPerf(
              "ai_chart_analysis",
              (res as { durationMs?: number }).durationMs ?? performance.now() - __aiStart,
              {
                tokensUsed: (res as { tokensUsed?: number | null }).tokensUsed ?? null,
                meta: { ok: res.ok, scan: true },
              },
            );
          }
          if (!res.ok) {
            setItems((prev) =>
              prev.map((p) =>
                p.id === it.id
                  ? { ...p, status: "error", error: res.error }
                  : p,
              ),
            );
          } else {
            const a = (res.analysis as ScanAnalysis) ?? null;
            setItems((prev) =>
              prev.map((p) =>
                p.id === it.id
                  ? { ...p, status: "done", analysis: a }
                  : p,
              ),
            );
          }
        } catch (e) {
          setItems((prev) =>
            prev.map((p) =>
              p.id === it.id
                ? {
                    ...p,
                    status: "error",
                    error:
                      e instanceof Error ? e.message : "Analysis failed.",
                  }
                : p,
            ),
          );
        } finally {
          done += 1;
          setProgress({ done, total: queue.length });
        }
      }),
    );
    setRunning(false);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function dismissItem(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "dismissed" } : i)),
    );
  }

  function clearAll() {
    setItems([]);
    setError(null);
    setProgress({ done: 0, total: 0 });
  }

  function tradeThis(item: ScanItem) {
    if (!item.analysis) return;
    const a = item.analysis;
    const dir = (a.biasDirection ?? a.setupIdea?.direction ?? "")
      .toString()
      .toLowerCase();
    const direction =
      dir === "long" ? "Long" : dir === "short" ? "Short" : undefined;
    sessionStorage.setItem(
      "pendingTradePrefill",
      JSON.stringify({
        entry: a.setupIdea?.entry ?? "",
        stop: a.setupIdea?.stop ?? "",
        target: a.setupIdea?.target ?? "",
        direction,
        instrument: a.instrument ?? undefined,
      }),
    );
    void navigate({ to: "/trade-log" });
  }

  const visibleItems = items.filter((i) => i.status !== "dismissed");
  const rankedDone = [...visibleItems]
    .filter((i) => i.status === "done" && i.analysis)
    .sort(
      (a, b) =>
        Number(b.analysis?.setupQuality ?? 0) -
        Number(a.analysis?.setupQuality ?? 0),
    );
  const topId = rankedDone[0]?.id;
  const pendingCount = visibleItems.filter(
    (i) => i.status === "pending" || i.status === "error",
  ).length;

  return (
    <div className="space-y-4">
      {/* Upload card */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold font-data uppercase tracking-[3px] text-muted-foreground">
            Scan Mode
          </h2>
          <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
            {visibleItems.length}/{MAX_IMAGES} charts
          </span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        {visibleItems.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background py-10 hover:border-trade-green/50 hover:bg-trade-green/5"
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">Upload up to {MAX_IMAGES} charts</span>
            <span className="text-[11px] text-muted-foreground">
              Analyze them in parallel and pick the best setup
            </span>
          </button>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {visibleItems.map((it) => (
                <div
                  key={it.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-background"
                >
                  <img
                    src={it.image.dataUrl}
                    alt="chart"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground opacity-0 hover:bg-trade-red hover:text-background group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {it.status === "loading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <span className="text-[10px] font-data uppercase tracking-wider text-trade-green animate-pulse">
                        Analyzing…
                      </span>
                    </div>
                  )}
                  {it.status === "done" && it.analysis && (
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/85 px-1.5 py-1">
                      <QualityStars q={it.analysis.setupQuality} />
                    </div>
                  )}
                  {it.status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-trade-red/20">
                      <AlertCircle className="h-5 w-5 text-trade-red" />
                    </div>
                  )}
                </div>
              ))}
              {visibleItems.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-border bg-background text-muted-foreground hover:border-trade-green/50 hover:text-trade-green"
                  aria-label="Add more"
                >
                  <Upload className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Max {MAX_IMAGES} images per scan session.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={running}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
                <button
                  type="button"
                  onClick={() => void analyzeAll()}
                  disabled={running || pendingCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-trade-green px-4 py-1.5 text-xs font-bold font-data uppercase tracking-wider text-background hover:bg-trade-green/90 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {running ? "Analyzing…" : `Analyze All (${pendingCount})`}
                </button>
              </div>
            </div>

            {running && progress.total > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] font-data uppercase tracking-wider text-muted-foreground">
                  <span>
                    Analyzing {progress.done}/{progress.total} charts…
                  </span>
                  <span className="text-trade-green">
                    {Math.round((progress.done / progress.total) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-trade-green transition-all"
                    style={{
                      width: `${(progress.done / progress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-trade-red/40 bg-trade-red/5 p-3 text-sm text-trade-red">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Ranked results */}
      {rankedDone.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold font-data uppercase tracking-[3px] text-muted-foreground">
              Ranked Setups
            </h2>
            <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              {rankedDone.length} analyzed
            </span>
          </div>
          {rankedDone.map((it, idx) => (
            <ResultCard
              key={it.id}
              item={it}
              rank={idx + 1}
              isTop={it.id === topId}
              onTrade={() => tradeThis(it)}
              onDismiss={() => dismissItem(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  item,
  rank,
  isTop,
  onTrade,
  onDismiss,
}: {
  item: ScanItem;
  rank: number;
  isTop: boolean;
  onTrade: () => void;
  onDismiss: () => void;
}) {
  const a = item.analysis!;
  const quality = Math.max(
    0,
    Math.min(5, Math.round(Number(a.setupQuality ?? 0))),
  );
  const bias = (a.biasDirection ?? a.setupIdea?.direction ?? "neutral")
    .toString()
    .toLowerCase();
  const biasColor =
    bias === "long"
      ? "text-blue-400 border-blue-500/40 bg-blue-500/10"
      : bias === "short"
        ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
        : "text-muted-foreground border-border bg-muted";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-card p-4 ${
        isTop
          ? "border-trade-green/60 ring-1 ring-trade-green/30 shadow-[0_0_24px_-12px_rgba(34,197,94,0.5)]"
          : "border-border"
      }`}
    >
      {isTop && (
        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-trade-green/40 bg-trade-green/15 px-2 py-0.5 text-[10px] font-data font-bold uppercase tracking-wider text-trade-green">
          <Trophy className="h-3 w-3" />
          Best Setup
        </div>
      )}
      <div className="flex gap-3">
        <img
          src={item.image.dataUrl}
          alt="chart"
          className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              #{rank}
            </span>
            <h3 className="truncate text-sm font-bold font-data uppercase tracking-[2px]">
              {a.setupDetected ?? "Setup"}
            </h3>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <QualityStars q={quality} />
            <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              {quality}/5
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-data font-bold uppercase tracking-wider ${biasColor}`}
            >
              {bias === "long" || bias === "short" ? bias : "neutral"}
            </span>
            {a.instrument && (
              <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-data">
                {a.instrument}
              </span>
            )}
          </div>
          {a.summary && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {a.summary}
            </p>
          )}
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] font-data">
            <div className="rounded border border-border bg-background px-1.5 py-1">
              <div className="text-muted-foreground uppercase tracking-wider">
                Entry
              </div>
              <div className="font-bold text-trade-green truncate">
                {a.setupIdea?.entry ?? "—"}
              </div>
            </div>
            <div className="rounded border border-border bg-background px-1.5 py-1">
              <div className="text-muted-foreground uppercase tracking-wider">
                Stop
              </div>
              <div className="font-bold text-trade-red truncate">
                {a.setupIdea?.stop ?? "—"}
              </div>
            </div>
            <div className="rounded border border-border bg-background px-1.5 py-1">
              <div className="text-muted-foreground uppercase tracking-wider">
                Target
              </div>
              <div className="font-bold text-trade-green truncate">
                {a.setupIdea?.target ?? "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          <EyeOff className="h-3.5 w-3.5" /> Skip
        </button>
        <button
          type="button"
          onClick={onTrade}
          className="inline-flex items-center gap-1.5 rounded-md bg-trade-green px-3 py-1.5 text-xs font-bold font-data uppercase tracking-wider text-background hover:bg-trade-green/90"
        >
          Trade This <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function QualityStars({ q }: { q: number | null | undefined }) {
  const v = Math.max(0, Math.min(5, Math.round(Number(q ?? 0))));
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i < v
              ? "fill-trade-green text-trade-green"
              : "text-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}