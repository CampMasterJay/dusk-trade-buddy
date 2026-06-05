// Shared news article data + helpers used by the news feed and detail screens.

export type AssetKey = "all" | "es" | "nq" | "btc" | "gold" | "oil" | "bonds";
export type Impact = "all" | "high" | "med" | "low";
export type Sentiment = "all" | "bullish" | "bearish" | "neutral";

export type Article = {
  id: string;
  headline: string;
  source: string;
  author?: string;
  publishedAt: number; // ms epoch
  assets: AssetKey[];
  tags: string[];
  impact: Exclude<Impact, "all">;
  sentiment: Exclude<Sentiment, "all">;
  summary?: string;
  url?: string;
};

const NOW = Date.now();
const MIN = 60_000;

export const ARTICLES: Article[] = [
  {
    id: "1",
    headline: "Fed minutes signal hawkish hold as inflation remains sticky",
    source: "Reuters",
    author: "Howard Schneider",
    publishedAt: NOW - 12 * MIN,
    assets: ["es", "nq", "bonds"],
    tags: ["S&P500", "Fed", "Rates"],
    impact: "high",
    sentiment: "bearish",
    summary:
      "Minutes from the latest FOMC meeting showed officials remain concerned that services inflation is proving stickier than expected, reinforcing expectations of a prolonged pause. Several members flagged renewed upside risks from energy and shelter prices. Traders trimmed rate-cut bets across 2026, with the December meeting now seen as a coin flip.",
    url: "https://www.reuters.com/markets/us/",
  },
  {
    id: "2",
    headline: "Bitcoin breaks above $74k as ETF inflows accelerate",
    source: "Bloomberg",
    author: "Sidhartha Shukla",
    publishedAt: NOW - 28 * MIN,
    assets: ["btc"],
    tags: ["BTC", "ETF"],
    impact: "high",
    sentiment: "bullish",
    summary:
      "Spot bitcoin ETFs logged their fifth straight day of net inflows, pushing BTC through the $74,000 level for the first time this month. BlackRock's IBIT alone took in over $600m, while basis trades unwound as funding rates normalised.",
    url: "https://www.bloomberg.com/crypto",
  },
  {
    id: "3",
    headline: "Gold steady ahead of CPI print, traders eye $2,400",
    source: "CNBC",
    author: "Lee Ying Shan",
    publishedAt: NOW - 45 * MIN,
    assets: ["gold"],
    tags: ["Gold", "CPI"],
    impact: "med",
    sentiment: "neutral",
    summary:
      "Gold held in a tight range overnight as traders waited on tomorrow's US CPI release. Options market positioning suggests dealers expect a roughly 1.2% move on the day, with $2,400 acting as the key technical pivot.",
    url: "https://www.cnbc.com/commodities/",
  },
  {
    id: "4",
    headline: "Nasdaq futures jump as Nvidia raises guidance",
    source: "WSJ",
    author: "Asa Fitch",
    publishedAt: NOW - 60 * MIN,
    assets: ["nq"],
    tags: ["NQ", "Nvidia", "Tech"],
    impact: "high",
    sentiment: "bullish",
    summary:
      "Nvidia raised its current-quarter revenue outlook citing accelerating data-center demand, sending Nasdaq 100 futures up more than 1.4% in pre-market trading. Semiconductor peers rallied in sympathy.",
    url: "https://www.wsj.com/tech",
  },
  {
    id: "5",
    headline: "Crude oil slides on surprise inventory build",
    source: "Reuters",
    author: "Arathy Somasekhar",
    publishedAt: NOW - 95 * MIN,
    assets: ["oil"],
    tags: ["Oil", "EIA"],
    impact: "med",
    sentiment: "bearish",
    summary:
      "US crude stockpiles rose by 4.1m barrels last week, well above the 0.9m draw consensus, the EIA reported. WTI fell more than 2% on the print, with gasoline cracks also under pressure.",
    url: "https://www.reuters.com/markets/commodities/",
  },
  {
    id: "6",
    headline: "10-year yield dips below 4.2% as buyers return",
    source: "MarketWatch",
    author: "Vivien Lou Chen",
    publishedAt: NOW - 130 * MIN,
    assets: ["bonds"],
    tags: ["Bonds", "Yields"],
    impact: "low",
    sentiment: "bullish",
    summary:
      "A solid 10-year auction with strong indirect bidder demand pulled yields below 4.2% intraday, easing some of the pressure on rate-sensitive equities.",
    url: "https://www.marketwatch.com/markets/bonds",
  },
  {
    id: "7",
    headline: "S&P 500 closes at record high on soft-landing optimism",
    source: "FT",
    author: "Kate Duguid",
    publishedAt: NOW - 3 * 60 * MIN,
    assets: ["es"],
    tags: ["S&P500", "Macro"],
    impact: "med",
    sentiment: "bullish",
    summary:
      "The S&P 500 notched a fresh closing high, led by cyclicals, as cooler producer-price data fed a soft-landing narrative. Breadth was the strongest in three weeks.",
    url: "https://www.ft.com/markets",
  },
  {
    id: "8",
    headline: "ECB official warns of premature rate cut expectations",
    source: "Reuters",
    author: "Balazs Koranyi",
    publishedAt: NOW - 5 * 60 * MIN,
    assets: ["bonds", "es"],
    tags: ["ECB", "Rates"],
    impact: "low",
    sentiment: "neutral",
    summary:
      "An ECB Governing Council member pushed back against market pricing of aggressive 2026 rate cuts, citing services inflation that remains above target.",
    url: "https://www.reuters.com/world/europe/",
  },
];

export function getArticleById(id: string): Article | undefined {
  return ARTICLES.find((a) => a.id === id);
}

export function getRelatedArticles(article: Article, limit = 4): Article[] {
  const tagSet = new Set(article.tags);
  const assetSet = new Set(article.assets);
  return ARTICLES.filter((a) => a.id !== article.id)
    .map((a) => {
      const tagOverlap = a.tags.filter((t) => tagSet.has(t)).length;
      const assetOverlap = a.assets.filter((x) => assetSet.has(x)).length;
      return { a, score: tagOverlap * 2 + assetOverlap };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.a.publishedAt - a.a.publishedAt)
    .slice(0, limit)
    .map((x) => x.a);
}

export const ASSET_LABELS: Record<Exclude<AssetKey, "all">, string> = {
  es: "ES / SPY",
  nq: "NQ / QQQ",
  btc: "BTC",
  gold: "Gold",
  oil: "Oil",
  bonds: "Bonds",
};

// Lightweight mock price-change snapshot keyed by asset.
export const ASSET_PRICE_SNAPSHOT: Record<
  Exclude<AssetKey, "all">,
  { price: string; changePct: number }
> = {
  es: { price: "5,842.25", changePct: 0.42 },
  nq: { price: "20,915.50", changePct: 1.18 },
  btc: { price: "74,120", changePct: 2.31 },
  gold: { price: "2,388.40", changePct: -0.08 },
  oil: { price: "78.95", changePct: -1.62 },
  bonds: { price: "112'21", changePct: 0.21 },
};

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}