import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Clock, ExternalLink } from "lucide-react";

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

type AssetKey = "all" | "es" | "nq" | "btc" | "gold" | "oil" | "bonds";
type Impact = "all" | "high" | "med" | "low";
type Sentiment = "all" | "bullish" | "bearish" | "neutral";

type Article = {
  id: string;
  headline: string;
  source: string;
  publishedAt: number; // ms epoch
  assets: AssetKey[];
  tags: string[];
  impact: Exclude<Impact, "all">;
  sentiment: Exclude<Sentiment, "all">;
  url?: string;
};

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

const NOW = Date.now();
const MIN = 60_000;

const ARTICLES: Article[] = [
  {
    id: "1",
    headline: "Fed minutes signal hawkish hold as inflation remains sticky",
    source: "Reuters",
    publishedAt: NOW - 12 * MIN,
    assets: ["es", "nq", "bonds"],
    tags: ["S&P500", "Fed", "Rates"],
    impact: "high",
    sentiment: "bearish",
  },
  {
    id: "2",
    headline: "Bitcoin breaks above $74k as ETF inflows accelerate",
    source: "Bloomberg",
    publishedAt: NOW - 28 * MIN,
    assets: ["btc"],
    tags: ["BTC", "ETF"],
    impact: "high",
    sentiment: "bullish",
  },
  {
    id: "3",
    headline: "Gold steady ahead of CPI print, traders eye $2,400",
    source: "CNBC",
    publishedAt: NOW - 45 * MIN,
    assets: ["gold"],
    tags: ["Gold", "CPI"],
    impact: "med",
    sentiment: "neutral",
  },
  {
    id: "4",
    headline: "Nasdaq futures jump as Nvidia raises guidance",
    source: "WSJ",
    publishedAt: NOW - 60 * MIN,
    assets: ["nq"],
    tags: ["NQ", "Nvidia", "Tech"],
    impact: "high",
    sentiment: "bullish",
  },
  {
    id: "5",
    headline: "Crude oil slides on surprise inventory build",
    source: "Reuters",
    publishedAt: NOW - 95 * MIN,
    assets: ["oil"],
    tags: ["Oil", "EIA"],
    impact: "med",
    sentiment: "bearish",
  },
  {
    id: "6",
    headline: "10-year yield dips below 4.2% as buyers return",
    source: "MarketWatch",
    publishedAt: NOW - 130 * MIN,
    assets: ["bonds"],
    tags: ["Bonds", "Yields"],
    impact: "low",
    sentiment: "bullish",
  },
  {
    id: "7",
    headline: "S&P 500 closes at record high on soft-landing optimism",
    source: "FT",
    publishedAt: NOW - 3 * 60 * MIN,
    assets: ["es"],
    tags: ["S&P500", "Macro"],
    impact: "med",
    sentiment: "bullish",
  },
  {
    id: "8",
    headline: "ECB official warns of premature rate cut expectations",
    source: "Reuters",
    publishedAt: NOW - 5 * 60 * MIN,
    assets: ["bonds", "es"],
    tags: ["ECB", "Rates"],
    impact: "low",
    sentiment: "neutral",
  },
];

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function News() {
  const [asset, setAsset] = useState<AssetKey>("all");
  const [impact, setImpact] = useState<Impact>("all");
  const [sentiment, setSentiment] = useState<Sentiment>("all");

  const filtered = useMemo(() => {
    return ARTICLES.filter((a) => {
      if (asset !== "all" && !a.assets.includes(asset)) return false;
      if (impact !== "all" && a.impact !== impact) return false;
      if (sentiment !== "all" && a.sentiment !== sentiment) return false;
      return true;
    }).sort((a, b) => b.publishedAt - a.publishedAt);
  }, [asset, impact, sentiment]);

  return (
    <ProtectedRoute>
      <AppHeader balance={12450.0} />
      <div className="pb-24">
        <div className="p-4 lg:p-6">
          <h1 className="text-2xl font-bold font-heading mb-4">Market News</h1>

          {/* Filter bar */}
          <div className="space-y-3 mb-4">
            <FilterRow label="Asset" options={ASSET_FILTERS} value={asset} onChange={setAsset} />
            <FilterRow label="Impact" options={IMPACT_FILTERS} value={impact} onChange={setImpact} />
            <FilterRow label="Sentiment" options={SENTIMENT_FILTERS} value={sentiment} onChange={setSentiment} />
          </div>

          {/* Feed */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
                No articles match the current filters.
              </div>
            ) : (
              filtered.map((a) => <NewsCard key={a.id} article={a} />)
            )}
          </div>
        </div>
      </div>
      <MarketStatusBar />
    </ProtectedRoute>
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

function NewsCard({ article }: { article: Article }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 hover:border-muted-foreground/40 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="font-bold leading-snug text-foreground">{article.headline}</h2>
        {article.url ? (
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
            <ExternalLink className="size-4" />
          </a>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        {article.source} · {timeAgo(article.publishedAt)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {article.tags.map((t) => (
          <span key={t} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            {t}
          </span>
        ))}
        <ImpactBadge impact={article.impact} />
        <SentimentBadge sentiment={article.sentiment} />
      </div>
    </article>
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
