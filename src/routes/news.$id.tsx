import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  Share2,
  StickyNote,
  Sparkles,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { useUserSettings } from "@/hooks/useUserSettings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ASSET_LABELS,
  ASSET_PRICE_SNAPSHOT,
  getArticleById,
  getRelatedArticles,
  timeAgo,
  type Article,
  type AssetKey,
} from "@/lib/newsData";
import {
  getCachedImpact,
  scoreArticles,
} from "@/lib/newsImpactService";
import type { ImpactScore } from "@/lib/api/newsImpact.functions";

export const Route = createFileRoute("/news/$id")({
  head: ({ params }) => {
    const a = getArticleById(params.id);
    const title = a ? `${a.headline} — EdgeTrader` : "Article — EdgeTrader";
    const desc = a?.summary?.slice(0, 160) ?? "Market news detail.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: NewsDetail,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">
      Article not found.
    </div>
  ),
});

function NewsDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const article = getArticleById(id);
  const { settings } = useUserSettings();
  const balance = Number(settings?.current_balance ?? settings?.starting_balance ?? 100);

  const [score, setScore] = useState<ImpactScore | undefined>(() =>
    article ? getCachedImpact(article.id) : undefined,
  );
  const [scoring, setScoring] = useState(false);

  // If no cached score yet, request one for this single article.
  useEffect(() => {
    if (!article || score) return;
    let cancelled = false;
    setScoring(true);
    void scoreArticles(
      [{ id: article.id, headline: article.headline, summary: article.summary, symbols: article.tags }],
      (s) => {
        if (!cancelled) setScore(s);
      },
      { limit: 1 },
    ).finally(() => {
      if (!cancelled) setScoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [article, score]);

  if (!article) {
    return (
      <ProtectedRoute>
        <AppHeader balance={balance} />
        <div className="p-6 text-center text-muted-foreground">
          <p>Article not found.</p>
          <Link to="/news" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ArrowLeft className="size-4" /> Back to News
          </Link>
        </div>
      </ProtectedRoute>
    );
  }

  const related = getRelatedArticles(article);

  const handleShare = async () => {
    const shareData = {
      title: article.headline,
      text: article.summary ?? article.headline,
      url: article.url ?? (typeof window !== "undefined" ? window.location.href : ""),
    };
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(shareData);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareData.title} — ${shareData.url}`);
        toast.success("Link copied to clipboard");
      } else {
        toast.info("Sharing isn't supported on this device");
      }
    } catch (err) {
      // User cancelled or share failed — no-op.
      if ((err as Error)?.name !== "AbortError") {
        toast.error("Could not share article");
      }
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background text-foreground pb-32">
        <AppHeader balance={balance} />
        <div className="mx-auto max-w-3xl p-4 lg:p-6">
          <button
            type="button"
            onClick={() => navigate({ to: "/news" })}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to News
          </button>

          {/* Headline + meta */}
          <header className="mb-5">
            <h1 className="text-2xl md:text-3xl font-bold font-heading leading-tight">
              {article.headline}
            </h1>
            <div className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{article.source}</span>
              {article.author ? <> · {article.author}</> : null}
              {" · "}
              {timeAgo(article.publishedAt)}
            </div>
          </header>

          {/* Action row */}
          <div className="mb-5 flex flex-wrap gap-2">
            {article.url ? (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <ExternalLink className="size-4" />
                Read Full Article
              </a>
            ) : null}
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:border-muted-foreground/40"
            >
              <Share2 className="size-4" />
              Share
            </button>
          </div>

          {/* AI Impact summary */}
          <ImpactSummaryCard score={score} scoring={scoring} />

          {/* Summary */}
          {article.summary ? (
            <section className="mb-5 rounded-xl border border-border bg-card p-4">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Summary</h2>
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                {article.summary}
              </p>
            </section>
          ) : null}

          {/* Affected assets */}
          {article.assets.length > 0 ? (
            <section className="mb-5">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Affected Assets
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {article.assets
                  .filter((a): a is Exclude<AssetKey, "all"> => a !== "all")
                  .map((a) => (
                    <AssetPriceBadge key={a} asset={a} />
                  ))}
              </div>
            </section>
          ) : null}

          {/* Trading note */}
          <TradingNoteCard articleId={article.id} />

          {/* Related */}
          {related.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Related Articles
              </h2>
              <div className="space-y-2">
                {related.map((r) => (
                  <RelatedRow key={r.id} article={r} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </ProtectedRoute>
  );
}

// ---------- AI impact summary ----------

function ImpactSummaryCard({
  score,
  scoring,
}: {
  score: ImpactScore | undefined;
  scoring: boolean;
}) {
  if (!score && !scoring) return null;

  if (scoring && !score) {
    return (
      <section className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Scoring article impact…
        </div>
      </section>
    );
  }
  if (!score) return null;

  return (
    <section className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary mb-3">
        <Sparkles className="size-3" />
        AI Impact Summary
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Pill label="Impact" value={score.impactLevel} tone={impactTone(score.impactLevel)} />
        <Pill label="Sentiment" value={score.sentiment} tone={sentimentTone(score.sentiment)} />
      </div>
      <div className="rounded-lg border border-border bg-card/60 p-3 mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Trader Implication
        </div>
        <p className="text-sm text-foreground leading-snug">{score.traderImplication}</p>
      </div>
      <ActionChip action={score.tradingAction} />
    </section>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold font-data", tone)}>{value}</div>
    </div>
  );
}

function impactTone(level: ImpactScore["impactLevel"]): string {
  if (level === "HIGH") return "text-trade-red";
  if (level === "MEDIUM") return "text-amber-500";
  return "text-muted-foreground";
}

function sentimentTone(s: ImpactScore["sentiment"]): string {
  if (s === "BULLISH") return "text-trade-green";
  if (s === "BEARISH") return "text-trade-red";
  return "text-muted-foreground";
}

function ActionChip({ action }: { action: ImpactScore["tradingAction"] }) {
  const tone =
    action === "Consider Long"
      ? "border-trade-green/40 bg-trade-green/10 text-trade-green"
      : action === "Consider Short"
        ? "border-trade-red/40 bg-trade-red/10 text-trade-red"
        : action === "Wait for Reaction"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
          : "border-border bg-muted/40 text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-wide",
        tone,
      )}
    >
      <Zap className="size-3" />
      {action}
    </span>
  );
}

// ---------- Affected assets ----------

function AssetPriceBadge({ asset }: { asset: Exclude<AssetKey, "all"> }) {
  const snap = ASSET_PRICE_SNAPSHOT[asset];
  const up = snap.changePct >= 0;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {ASSET_LABELS[asset]}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="font-data text-sm font-semibold">{snap.price}</span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold font-data",
            up ? "bg-trade-green/10 text-trade-green" : "bg-trade-red/10 text-trade-red",
          )}
        >
          {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {up ? "+" : ""}
          {snap.changePct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// ---------- Trading note ----------

function noteKey(articleId: string): string {
  return `edgetrader.newsNote.v1.${articleId}`;
}

function TradingNoteCard({ articleId }: { articleId: string }) {
  const [note, setNote] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(noteKey(articleId));
      if (raw) {
        const parsed = JSON.parse(raw) as { text: string; savedAt: number };
        setNote(parsed.text);
        setSavedAt(parsed.savedAt);
        if (parsed.text.length > 0) setExpanded(true);
      }
    } catch {
      // ignore
    }
  }, [articleId]);

  const save = useCallback(() => {
    if (typeof window === "undefined") return;
    const trimmed = note.trim();
    if (!trimmed) {
      toast.info("Note is empty");
      return;
    }
    const payload = { text: trimmed, savedAt: Date.now() };
    try {
      localStorage.setItem(noteKey(articleId), JSON.stringify(payload));
      setSavedAt(payload.savedAt);
      toast.success("Note saved");
    } catch {
      toast.error("Could not save note");
    }
  }, [articleId, note]);

  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(noteKey(articleId));
    setNote("");
    setSavedAt(null);
    toast.success("Note cleared");
  }, [articleId]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mb-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
      >
        <StickyNote className="size-4" />
        Add Trading Note
      </button>
    );
  }

  return (
    <section className="mb-2 rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
          <StickyNote className="size-3.5" />
          Trading Note
        </h2>
        {savedAt ? (
          <span className="text-[10px] text-muted-foreground">
            Saved {timeAgo(savedAt)}
          </span>
        ) : null}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What's your plan around this event? Levels, bias, risk?"
        rows={4}
        className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Save className="size-3.5" />
          Save Note
        </button>
        {savedAt ? (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="size-3.5" />
            Clear
          </button>
        ) : null}
      </div>
    </section>
  );
}

// ---------- Related row ----------

function RelatedRow({ article }: { article: Article }) {
  const tone =
    article.sentiment === "bullish"
      ? "text-trade-green"
      : article.sentiment === "bearish"
        ? "text-trade-red"
        : "text-muted-foreground";
  const Icon =
    article.sentiment === "bullish"
      ? TrendingUp
      : article.sentiment === "bearish"
        ? TrendingDown
        : Minus;
  return (
    <Link
      to="/news/$id"
      params={{ id: article.id }}
      className="block rounded-lg border border-border bg-card p-3 hover:border-muted-foreground/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("size-4 mt-0.5 shrink-0", tone)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{article.headline}</p>
          <div className="mt-1 text-xs text-muted-foreground">
            {article.source} · {timeAgo(article.publishedAt)}
          </div>
        </div>
      </div>
    </Link>
  );
}
