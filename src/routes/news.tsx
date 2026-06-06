import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Clock, ExternalLink, Newspaper, Activity, RefreshCw, Sparkles, Loader2, Zap, CalendarClock, AlertTriangle, Star, Search, Bookmark, BookmarkCheck, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  getMacroSummary,
  getMacroIndicators,
  type MacroIndicators,
} from "@/lib/api/macroContext.functions";
import {
  getEconomicCalendar,
  type CalendarEvent,
  type CalendarImpact,
} from "@/lib/api/economicCalendar.functions";
import {
  getAllArticles,
  timeAgo,
  articleMatchesWatchlist,
  type Article,
  type AssetKey,
  type Impact,
  type Sentiment,
} from "@/lib/newsData";
import { useUserSettings } from "@/hooks/useUserSettings";
import { WatchlistManager } from "@/components/WatchlistManager";
import { toast } from "sonner";
import { useSWR } from "@/lib/swrFetch";
import {
  scoreArticles,
  pendingIdsFor,
  clearImpactCache,
  type ImpactScore,
  type NewsItemInput,
} from "@/lib/newsImpactService";
import { publishHighImpactAlert } from "@/lib/highImpactAlerts";
import {
  toggleSavedArticle,
  subscribeSavedArticles,
  getSavedArticles,
  SAVED_MAX,
  type SavedArticle,
} from "@/lib/savedArticlesDb";
import {
  markHighImpactUnread,
  markAllHighImpactRead,
} from "@/lib/unreadHighImpact";
import { cacheNewsArticles } from "@/lib/offlineCache";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — News" },
      { name: "description", content: "Latest market news and AI-curated sentiment analysis." },
      { property: "og:title", content: "EdgeTrader — News" },
      { property: "og:description", content: "Latest market news and sentiment analysis." },
    ],
  }),
  component: News,
});

const ASSET_FILTERS: { key: AssetKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "es", label: "ES/SPY" },
  { key: "nq", label: "NQ/QQQ" },
  { key: "btc", label: "BTC" },
  { key: "gold", label: "Gold" },
  { key: "oil", label: "Oil" },
  { key: "bonds", label: "Bonds" },
];

const IMPACT_FILTERS: { key: Impact; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High Impact" },
  { key: "med", label: "Medium" },
  { key: "low", label: "Low" },
];

const SENTIMENT_FILTERS: { key: Sentiment; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bullish", label: "Bullish" },
  { key: "bearish", label: "Bearish" },
  { key: "neutral", label: "Neutral" },
];

type DateRangeKey = "all" | "today" | "week" | "month" | "custom";

const DATE_RANGE_FILTERS: { key: DateRangeKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
];

function resolveDateRange(
  key: DateRangeKey,
  customFrom: string,
  customTo: string,
): { from: number | null; to: number | null } {
  const now = new Date();
  if (key === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { from: start, to: null };
  }
  if (key === "week") {
    return { from: now.getTime() - 7 * 24 * 60 * 60 * 1000, to: null };
  }
  if (key === "month") {
    return { from: now.getTime() - 30 * 24 * 60 * 60 * 1000, to: null };
  }
  if (key === "custom") {
    const from = customFrom ? new Date(customFrom + "T00:00:00").getTime() : null;
    const to = customTo ? new Date(customTo + "T23:59:59").getTime() : null;
    return { from, to };
  }
  return { from: null, to: null };
}

function News() {
  const [tab, setTab] = useState<"news" | "watchlist" | "calendar" | "macro">("news");
  const [asset, setAsset] = useState<AssetKey>("all");
  const [impact, setImpact] = useState<Impact>("all");
  const [sentiment, setSentiment] = useState<Sentiment>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [scores, setScores] = useState<Record<string, ImpactScore>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [scoringError, setScoringError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Debounce search input → query.
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Mark HIGH-impact badge as cleared when the feed tab is viewed.
  useEffect(() => {
    if (tab === "news") markAllHighImpactRead();
  }, [tab]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const { from, to } = resolveDateRange(dateRange, customFrom, customTo);
    return getAllArticles().filter((a) => {
      if (asset !== "all" && !a.assets.includes(asset)) return false;
      if (impact !== "all" && a.impact !== impact) return false;
      if (sentiment !== "all" && a.sentiment !== sentiment) return false;
      if (q && !a.headline.toLowerCase().includes(q)) return false;
      if (from != null && a.publishedAt < from) return false;
      if (to != null && a.publishedAt > to) return false;
      return true;
    }).sort((a, b) => b.publishedAt - a.publishedAt);
  }, [asset, impact, sentiment, searchQuery, dateRange, customFrom, customTo]);

  const runScoring = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setScoringError(null);

    // Pull from the most recent article list (newest first).
    const sortedAll = [...getAllArticles()].sort((a, b) => b.publishedAt - a.publishedAt);
    // Cache top 20 articles for offline reading.
    void cacheNewsArticles(sortedAll.slice(0, 20));
    const items: NewsItemInput[] = sortedAll.map((a) => ({
      id: a.id,
      headline: a.headline,
      symbols: a.tags,
    }));

    setPending(pendingIdsFor(items));

    const result = await scoreArticles(items, (s) => {
      setScores((prev) => ({ ...prev, [s.id]: s }));
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
      if (s.impactLevel === "HIGH") {
        const art = sortedAll.find((a) => a.id === s.id);
        if (art) {
          publishHighImpactAlert({ id: art.id, headline: art.headline, url: art.url });
          markHighImpactUnread(art.id);
        }
      }
    });

    if (result.errors.length > 0) {
      setScoringError(result.errors[0]);
    }
    setPending(new Set());
    inFlight.current = false;
  }, []);

  useEffect(() => {
    void runScoring();
  }, [runScoring]);

  const refresh = () => {
    clearImpactCache();
    setScores({});
    void runScoring();
  };

  return (
    <ProtectedRoute>
      <AppHeader balance={Number(settings?.current_balance ?? settings?.starting_balance ?? 100)} />
      <div className="pb-24">
        <div className="p-4 lg:p-6">
          <h1 className="text-2xl font-bold font-heading mb-4">Market News</h1>

          {/* Tabs */}
          <div className="inline-flex rounded-lg border border-border bg-card p-1 mb-4">
            <TabBtn active={tab === "news"} onClick={() => setTab("news")} icon={Newspaper} label="Feed" />
            <TabBtn active={tab === "watchlist"} onClick={() => setTab("watchlist")} icon={Star} label="Watchlist" />
            <TabBtn active={tab === "calendar"} onClick={() => setTab("calendar")} icon={CalendarClock} label="Calendar" />
            <TabBtn active={tab === "macro"} onClick={() => setTab("macro")} icon={Activity} label="Macro" />
          </div>

          {tab === "news" ? (
            <>
              <SearchBar value={searchInput} onChange={setSearchInput} />
              <div className="space-y-3 mb-4">
                <FilterRow label="Asset" options={ASSET_FILTERS} value={asset} onChange={setAsset} />
                <FilterRow label="Impact" options={IMPACT_FILTERS} value={impact} onChange={setImpact} />
                <FilterRow label="Sentiment" options={SENTIMENT_FILTERS} value={sentiment} onChange={setSentiment} />
                <FilterRow label="Date" options={DATE_RANGE_FILTERS} value={dateRange} onChange={setDateRange} />
                {dateRange === "custom" ? (
                  <div className="flex flex-wrap items-center gap-2 pl-1">
                    <label className="text-xs text-muted-foreground">From</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                    />
                    <label className="text-xs text-muted-foreground">To</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="size-3 text-primary" />
                  AI-scored impact
                  {pending.size > 0 ? (
                    <span className="ml-1 inline-flex items-center gap-1 text-primary normal-case tracking-normal">
                      <Loader2 className="size-3 animate-spin" />
                      Scoring {pending.size}…
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={pending.size > 0}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-3", pending.size > 0 && "animate-spin")} />
                  Re-score
                </button>
              </div>
              {scoringError ? (
                <div className="mb-3 rounded-lg border border-trade-red/30 bg-trade-red/10 px-3 py-2 text-xs text-trade-red">
                  {scoringError}
                </div>
              ) : null}
              <div className="space-y-3">
                {filtered.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
                    No articles match the current filters.
                  </div>
                ) : (
                  filtered.map((a) => (
                    <NewsCard
                      key={a.id}
                      article={a}
                      score={scores[a.id]}
                      scoring={pending.has(a.id)}
                      highlight={searchQuery}
                    />
                  ))
                )}
              </div>
            </>
          ) : tab === "calendar" ? (
            <CalendarView />
          ) : tab === "watchlist" ? (
            <WatchlistView scores={scores} pending={pending} />
          ) : (
            <MacroView />
          )}
        </div>
      </div>
      <MarketStatusBar />
    </ProtectedRoute>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Newspaper; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative mb-4">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        type="search"
        placeholder="Search headlines…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-card pl-9 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.trim();
  if (!q) return <>{text}</>;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safe})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="rounded bg-primary/30 text-foreground px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function BookmarkButton({ article }: { article: Article }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const all = await getSavedArticles();
      if (active) setSaved(all.some((a) => a.id === article.id));
    };
    refresh();
    return subscribeSavedArticles(refresh);
  }, [article.id]);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const result = await toggleSavedArticle(article);
    if (result === "limit_reached") {
      toast.error(`Saved articles limit reached (${SAVED_MAX}). Remove one first.`);
    } else if (result === "saved") {
      toast.success("Article saved for offline.");
    } else {
      toast.success("Removed from saved.");
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved ? "Remove from saved" : "Save article"}
      className={cn(
        "shrink-0 rounded-md p-1 transition-colors",
        saved
          ? "text-trade-green hover:text-trade-green/80"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
    </button>
  );
}

// ---------- Macro tab ----------

function daysUntil(iso: string): number {
  const target = new Date(iso + "T14:00:00Z").getTime();
  return Math.max(0, Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000)));
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function vixTone(vix: number): { label: string; accent: "green" | "amber" | "red" } {
  if (vix < 15) return { label: "Low vol", accent: "green" };
  if (vix <= 25) return { label: "Elevated", accent: "amber" };
  return { label: "High vol", accent: "red" };
}

function MacroView() {
  const fetchIndicators = useServerFn(getMacroIndicators);
  // Stale-while-revalidate: serve cached macro snapshot instantly on revisits,
  // refresh in the background.
  const {
    data: m,
    error: indicatorsError,
    refreshing,
    revalidate: loadIndicators,
  } = useSWR<MacroIndicators>(
    "news.macroIndicators",
    async () => {
      const res = await fetchIndicators();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    { staleMs: 5 * 60_000, refreshIntervalMs: 5 * 60_000 },
  );

  const summarize = useServerFn(getMacroSummary);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!m) {
    return (
      <div className="space-y-4">
        {indicatorsError ? (
          <div className="rounded-xl border border-trade-red/30 bg-trade-red/10 p-3 text-xs text-trade-red">
            {indicatorsError}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
            Loading macro indicators…
          </div>
        )}
      </div>
    );
  }

  const fomcIn = daysUntil(m.nextFomcDate);
  const vix = vixTone(m.vix);
  const breadthRatio = m.advancing / Math.max(1, m.declining);
  const breadthPos = m.advancing > m.declining;

  const indicatorsText = [
    `Fed Funds Rate: ${m.fedFundsRate}% (last changed ${fmtDate(m.fedFundsLastChange)})`,
    `Next FOMC meeting: ${fmtDate(m.nextFomcDate)} (${fomcIn} days)`,
    `VIX: ${m.vix} (${vix.label}, ${m.vixChangePct >= 0 ? "+" : ""}${m.vixChangePct}% today)`,
    `US 10Y yield: ${m.us10y}% (${m.us10yChangePct >= 0 ? "+" : ""}${m.us10yChangePct}% today)`,
    `DXY: ${m.dxy} (${m.dxyChangePct >= 0 ? "+" : ""}${m.dxyChangePct}% today)`,
    `Market breadth: ${m.advancing} advancing vs ${m.declining} declining (${breadthRatio.toFixed(2)}:1)`,
  ].join("\n");

  const loadSummary = async () => {
    setLoading(true);
    setError(null);
    const res = await summarize({ data: { indicators: indicatorsText } });
    if (res.ok) setSummary(res.summary);
    else setError(res.error);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* AI Market Context */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3.5" />
            Market Context
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadIndicators()}
              disabled={refreshing}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
              Data
            </button>
            <button
              type="button"
              onClick={loadSummary}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Sparkles className={cn("size-3", loading && "animate-pulse")} />
              {summary ? "Re-summarise" : "Summarise"}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-5/6 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-4/6 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : error ? (
          <p className="text-sm text-trade-red">{error}</p>
        ) : summary ? (
          <p className="text-sm leading-relaxed text-foreground">{summary}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Tap "Summarise" for a plain-English read on current conditions.
          </p>
        )}
      </div>

      {/* Indicator grid */}
      <div className="grid grid-cols-2 gap-3">
        <IndicatorCard label="Fed Funds Rate" value={`${m.fedFundsRate}%`} sub={`Last changed ${fmtDate(m.fedFundsLastChange)}`} />
        <IndicatorCard
          label="Next FOMC"
          value={`${fomcIn}d`}
          sub={fmtDate(m.nextFomcDate)}
          accent={fomcIn <= 7 ? "amber" : undefined}
        />
        <IndicatorCard
          label="VIX"
          value={m.vix.toFixed(1)}
          sub={`${vix.label} · ${m.vixChangePct >= 0 ? "+" : ""}${m.vixChangePct}%`}
          accent={vix.accent}
        />
        <IndicatorCard
          label="US 10Y"
          value={`${m.us10y}%`}
          sub={`${m.us10yChangePct >= 0 ? "+" : ""}${m.us10yChangePct}% today`}
          accent={m.us10yChangePct >= 0 ? "red" : "green"}
        />
        <IndicatorCard
          label="DXY"
          value={m.dxy.toFixed(1)}
          sub={`${m.dxyChangePct >= 0 ? "+" : ""}${m.dxyChangePct}% today`}
          accent={m.dxyChangePct >= 0 ? "green" : "red"}
        />
        <IndicatorCard
          label="Breadth"
          value={`${breadthRatio.toFixed(2)}:1`}
          sub={`${m.advancing} adv / ${m.declining} dec`}
          accent={breadthPos ? "green" : "red"}
        />
      </div>

      <p className="text-[11px] text-muted-foreground px-1">
        Quotes: {m.sources.quotes === "live" ? "live (Yahoo Finance)" : "fallback snapshot"} · Breadth:{" "}
        {m.sources.breadth === "live" ? "live" : "fallback"} · Updated{" "}
        {new Date(m.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </p>
    </div>
  );
}

function IndicatorCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "amber";
}) {
  const valueColor =
    accent === "green"
      ? "text-trade-green"
      : accent === "red"
        ? "text-trade-red"
        : accent === "amber"
          ? "text-amber-500"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-xl font-bold font-heading tabular-nums", valueColor)}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground mt-1">{sub}</div> : null}
    </div>
  );
}

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-none">
        {options.map((o) => {
          const active = o.key === value;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewsCard({
  article,
  score,
  scoring,
  highlight,
}: {
  article: Article;
  score?: ImpactScore;
  scoring?: boolean;
  highlight?: string;
}) {
  // Prefer AI scores when available; fall back to static metadata.
  const impact: Exclude<Impact, "all"> = score
    ? score.impactLevel === "HIGH"
      ? "high"
      : score.impactLevel === "MEDIUM"
        ? "med"
        : "low"
    : article.impact;
  const sentiment: Exclude<Sentiment, "all"> = score
    ? score.sentiment === "BULLISH"
      ? "bullish"
      : score.sentiment === "BEARISH"
        ? "bearish"
        : "neutral"
    : article.sentiment;

  return (
    <Link
      to="/news/$id"
      params={{ id: article.id }}
      className="block rounded-xl border border-border bg-card p-4 hover:border-muted-foreground/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="font-bold leading-snug text-foreground">
          <HighlightedText text={article.headline} query={highlight ?? ""} />
        </h2>
        <div className="flex items-center gap-1 shrink-0">
          <BookmarkButton article={article} />
          {article.url ? (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      </div>
      <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
        <span>
          {article.source} · {timeAgo(article.publishedAt)}
        </span>
        {scoring ? (
          <span className="inline-flex items-center gap-1 text-primary">
            <Loader2 className="size-3 animate-spin" />
            Scoring
          </span>
        ) : null}
      </div>

      {score ? (
        <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-primary mb-0.5 flex items-center gap-1">
            <Sparkles className="size-3" />
            Trader Take
          </div>
          <p className="text-xs leading-snug text-foreground">{score.traderImplication}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {article.tags.map((t) => (
          <span key={t} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            {t}
          </span>
        ))}
        <ImpactBadge impact={impact} />
        <SentimentBadge sentiment={sentiment} />
        {score ? <ActionBadge action={score.tradingAction} /> : null}
      </div>
    </Link>
  );
}

function ActionBadge({ action }: { action: ImpactScore["tradingAction"] }) {
  const tone =
    action === "Consider Long"
      ? "border-trade-green/40 bg-trade-green/10 text-trade-green"
      : action === "Consider Short"
        ? "border-trade-red/40 bg-trade-red/10 text-trade-red"
        : action === "Wait for Reaction"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
          : "border-border bg-muted/40 text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", tone)}>
      <Zap className="size-3" />
      {action}
    </span>
  );
}

function ImpactBadge({ impact }: { impact: Exclude<Impact, "all"> }) {
  if (impact === "high") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-trade-red/30 bg-trade-red/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-trade-red">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-trade-red opacity-75 animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-trade-red" />
        </span>
        High
      </span>
    );
  }
  if (impact === "med") {
    return (
      <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-500">
        Med
      </span>
    );
  }
  return (
    <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      Low
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: Exclude<Sentiment, "all"> }) {
  if (sentiment === "bullish") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-trade-green/30 bg-trade-green/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-trade-green">
        <TrendingUp className="size-3" />
        Bullish
      </span>
    );
  }
  if (sentiment === "bearish") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-trade-red/30 bg-trade-red/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-trade-red">
        <TrendingDown className="size-3" />
        Bearish
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Minus className="size-3" />
      Neutral
    </span>
  );
}

// ---------- Market status ----------

type MarketStatus = {
  isOpen: boolean;
  label: string; // "Opens in 2h 13m" / "Closes in 1h 04m"
};

// NYSE: 9:30 - 16:00 ET, Mon-Fri
function getNyseStatus(now: Date): MarketStatus {
  // Convert to America/New_York wall-clock parts
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const minutesNow = hour * 60 + minute;
  const openMin = 9 * 60 + 30;
  const closeMin = 16 * 60;
  const isWeekday = !["Sat", "Sun"].includes(weekday);

  if (isWeekday && minutesNow >= openMin && minutesNow < closeMin) {
    const left = closeMin - minutesNow;
    return { isOpen: true, label: `Closes in ${fmtDur(left)}` };
  }

  // Closed — compute minutes until next open
  let daysAhead = 0;
  let minsToOpen: number;
  if (isWeekday && minutesNow < openMin) {
    minsToOpen = openMin - minutesNow;
  } else {
    // after close or weekend → find next weekday
    minsToOpen = 24 * 60 - minutesNow + openMin;
    daysAhead = 1;
    const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let idx = order.indexOf(weekday);
    while (true) {
      idx = (idx + 1) % 7;
      const next = order[idx];
      if (next !== "Sat" && next !== "Sun") break;
      minsToOpen += 24 * 60;
      daysAhead += 1;
    }
  }
  return { isOpen: false, label: `Opens in ${fmtDur(minsToOpen)}` };
}

function fmtDur(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m.toString().padStart(2, "0")}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh === 0 ? `${d}d` : `${d}d ${rh}h`;
}

function MarketStatusBar() {
  const [status, setStatus] = useState<MarketStatus>(() => getNyseStatus(new Date()));
  useEffect(() => {
    const id = setInterval(() => setStatus(getNyseStatus(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "relative flex size-2",
              status.isOpen ? "" : "opacity-80",
            )}
          >
            {status.isOpen ? (
              <>
                <span className="absolute inline-flex h-full w-full rounded-full bg-trade-green opacity-75 animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-trade-green" />
              </>
            ) : (
              <span className="relative inline-flex size-2 rounded-full bg-muted-foreground" />
            )}
          </span>
          <span className="text-sm font-semibold">
            NYSE {status.isOpen ? "Open" : "Closed"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          {status.label}
        </div>
      </div>
    </div>
  );
}

// ---------- Economic Calendar tab ----------

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatEventTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayHeading(ms: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(ms);
  const diffDays = Math.round((day - today) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return new Date(ms).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatCountdown(targetMs: number, nowMs: number): string {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function impactStyles(impact: CalendarImpact): { dot: string; chip: string; label: string } {
  switch (impact) {
    case "HIGH":
      return {
        dot: "bg-trade-red",
        chip: "bg-trade-red/15 text-trade-red border-trade-red/30",
        label: "High",
      };
    case "MEDIUM":
      return {
        dot: "bg-amber-500",
        chip: "bg-amber-500/15 text-amber-500 border-amber-500/30",
        label: "Med",
      };
    case "LOW":
      return {
        dot: "bg-muted-foreground",
        chip: "bg-muted text-muted-foreground border-border",
        label: "Low",
      };
    case "HOLIDAY":
      return {
        dot: "bg-muted-foreground/50",
        chip: "bg-muted text-muted-foreground border-border",
        label: "Holiday",
      };
  }
}

function CalendarView() {
  const fetchCal = useServerFn(getEconomicCalendar);
  const {
    data: events,
    error,
    refreshing: loading,
    revalidate: load,
  } = useSWR<CalendarEvent[]>(
    "news.calendar",
    async () => {
      const __t = performance.now();
      const res = await fetchCal();
      {
        const { logPerf } = await import("@/lib/perfLog");
        void logPerf("news_fetch", performance.now() - __t, {
          meta: { ok: res.ok, count: res.ok ? res.events.length : 0 },
        });
      }
      if (!res.ok) throw new Error(res.error);
      return res.events;
    },
    { staleMs: 10 * 60_000, refreshIntervalMs: 10 * 60_000 },
  );
  const [usOnly, setUsOnly] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (!events) return [];
    return usOnly ? events.filter((e) => e.country === "USD") : events;
  }, [events, usOnly]);

  const nextHigh = useMemo(
    () => filtered.find((e) => e.impact === "HIGH" && e.dateMs > now) ?? null,
    [filtered, now],
  );

  const minutesToNextHigh = nextHigh
    ? Math.floor((nextHigh.dateMs - now) / 60000)
    : null;
  const showTradeWarning =
    nextHigh !== null &&
    minutesToNextHigh !== null &&
    minutesToNextHigh >= 0 &&
    minutesToNextHigh <= 15;

  // Group events by day.
  const grouped = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const e of filtered) {
      const k = startOfDay(e.dateMs);
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Filter + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setUsOnly(true)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              usOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            US only
          </button>
          <button
            type="button"
            onClick={() => setUsOnly(false)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              !usOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            All currencies
          </button>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Trade Around News warning */}
      {showTradeWarning && nextHigh ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-500">
              HIGH IMPACT in {minutesToNextHigh} min — Consider waiting
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {nextHigh.country} · {nextHigh.title} at {formatEventTime(nextHigh.dateMs)}
            </div>
          </div>
        </div>
      ) : null}

      {/* Countdown to next HIGH */}
      {nextHigh ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Next high-impact event
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="font-data text-2xl font-semibold text-foreground">
              {formatCountdown(nextHigh.dateMs, now)}
            </div>
            <div className="text-sm text-muted-foreground">
              {nextHigh.country} · {nextHigh.title}
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatDayHeading(nextHigh.dateMs)} at {formatEventTime(nextHigh.dateMs)}
          </div>
        </div>
      ) : null}

      {/* Loading / error / empty */}
      {loading && !events ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
          Loading economic calendar…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-trade-red/30 bg-trade-red/10 p-3 text-xs text-trade-red">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
          No events found for this filter.
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, dayEvents]) => (
            <div key={day}>
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <span className="font-semibold text-foreground">{formatDayHeading(day)}</span>
                <span className="h-px flex-1 bg-border" />
                <span>{dayEvents.length} events</span>
              </div>
              <ol className="relative space-y-2 border-l border-border pl-4">
                {dayEvents.map((e) => (
                  <EventRow key={e.id} event={e} now={now} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event, now }: { event: CalendarEvent; now: number }) {
  const styles = impactStyles(event.impact);
  const past = event.dateMs <= now;
  const beat =
    past && event.actual && event.forecast
      ? compareNumeric(event.actual, event.forecast)
      : null;

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[21px] top-1.5 size-2.5 rounded-full ring-2 ring-background",
          styles.dot,
        )}
      />
      <div
        className={cn(
          "rounded-lg border border-border bg-card p-3",
          past && "opacity-70",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-data text-xs text-muted-foreground">
              {formatEventTime(event.dateMs)}
            </span>
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-data text-[10px] font-semibold uppercase tracking-wider">
              {event.country || "—"}
            </span>
            <span className="truncate text-sm font-medium">{event.title}</span>
          </div>
          <span
            className={cn(
              "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              styles.chip,
            )}
          >
            {styles.label}
          </span>
        </div>
        {past ? (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <Stat label="Actual" value={event.actual} tone={beat} />
            <Stat label="Forecast" value={event.forecast} />
            <Stat label="Previous" value={event.previous} />
          </div>
        ) : (event.forecast || event.previous) ? (
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <Stat label="Forecast" value={event.forecast} />
            <Stat label="Previous" value={event.previous} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: "beat" | "miss" | "match" | null;
}) {
  const toneClass =
    tone === "beat"
      ? "text-trade-green"
      : tone === "miss"
        ? "text-trade-red"
        : "text-foreground";
  return (
    <div className="rounded border border-border/60 bg-background/40 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("font-data text-xs font-semibold", toneClass)}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function compareNumeric(actual: string, forecast: string): "beat" | "miss" | "match" {
  const a = parseFloat(actual.replace(/[^0-9.\-]/g, ""));
  const f = parseFloat(forecast.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(a) || !Number.isFinite(f)) return "match";
  if (a > f) return "beat";
  if (a < f) return "miss";
  return "match";
}

// ---------- Watchlist tab ----------

function WatchlistView({
  scores,
  pending,
}: {
  scores: Record<string, ImpactScore>;
  pending: Set<string>;
}) {
  const { settings, updateSettings, loading } = useUserSettings();
  const watchlist = settings?.watchlist ?? [];
  const [saving, setSaving] = useState(false);

  const handleChange = async (next: string[]) => {
    setSaving(true);
    try {
      await updateSettings({ watchlist: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update watchlist");
    } finally {
      setSaving(false);
    }
  };

  const matched = useMemo(
    () =>
      [...getAllArticles()]
        .filter((a) => articleMatchesWatchlist(a, watchlist))
        .sort((a, b) => b.publishedAt - a.publishedAt),
    [watchlist],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <WatchlistManager
          tickers={watchlist}
          onChange={handleChange}
          saving={saving || loading}
        />
      </div>

      {watchlist.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Star className="mx-auto mb-2 size-6 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Build your watchlist</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add up to 10 tickers you actively trade to see only the news that matters to you.
          </p>
        </div>
      ) : matched.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Newspaper className="mx-auto mb-2 size-6 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No news for your watchlist</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing has hit your tickers yet. Try adding more instruments above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {matched.map((a) => (
            <NewsCard
              key={a.id}
              article={a}
              score={scores[a.id]}
              scoring={pending.has(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
