import { type Trade, type TradeStats } from "@/lib/tradeService";
import { cn } from "@/lib/utils";
import { Newspaper, Sparkles } from "lucide-react";

interface TradeStatsProps {
  stats: TradeStats | null;
  trades: Trade[];
}

function fmtUSD(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function calcStreak(trades: Trade[]): { type: "W" | "L" | null; count: number } {
  const ordered = [...trades]
    .filter((t) => t.result === "Win" || t.result === "Loss")
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return db - da;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  if (ordered.length === 0) return { type: null, count: 0 };
  const first = ordered[0].result === "Win" ? "W" : "L";
  let count = 0;
  for (const t of ordered) {
    const r = t.result === "Win" ? "W" : "L";
    if (r === first) count += 1;
    else break;
  }
  return { type: first, count };
}

type NewsBucketStats = {
  count: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1
  avgR: number;
};

function bucketStats(trades: Trade[]): NewsBucketStats {
  const decisive = trades.filter((t) => t.result === "Win" || t.result === "Loss");
  const wins = decisive.filter((t) => t.result === "Win").length;
  const losses = decisive.filter((t) => t.result === "Loss").length;
  const rs = trades
    .map((t) => Number(t.r_multiple))
    .filter((n) => Number.isFinite(n));
  const avgR = rs.length > 0 ? rs.reduce((s, n) => s + n, 0) / rs.length : 0;
  return {
    count: trades.length,
    wins,
    losses,
    winRate: decisive.length > 0 ? wins / decisive.length : 0,
    avgR,
  };
}

function newsRecommendation(
  news: NewsBucketStats,
  clean: NewsBucketStats,
): { tone: "good" | "bad" | "neutral"; text: string } | null {
  if (news.count < 3 || clean.count < 3) return null;
  const nWr = news.winRate * 100;
  const cWr = clean.winRate * 100;
  const diff = nWr - cWr;
  if (diff <= -10) {
    return {
      tone: "bad",
      text: `Your win rate on news-driven trades is ${nWr.toFixed(0)}% vs ${cWr.toFixed(0)}% on clean setups — consider avoiding news trades.`,
    };
  }
  if (diff >= 10) {
    return {
      tone: "good",
      text: `News-driven trades win ${nWr.toFixed(0)}% vs ${cWr.toFixed(0)}% on clean setups — you have an edge trading the news.`,
    };
  }
  return {
    tone: "neutral",
    text: `News-driven (${nWr.toFixed(0)}%) and clean setups (${cWr.toFixed(0)}%) perform similarly — no clear edge either way.`,
  };
}

export function TradeStats({ stats, trades }: TradeStatsProps) {
  const streak = calcStreak(trades);
  const s = stats;

  const winRatePct = (s?.winRate ?? 0) * 100;
  const lossRatePct = 100 - winRatePct;
  const avgWin = s?.avgWin ?? 0;
  const avgLoss = Math.abs(s?.avgLoss ?? 0);
  const ev = s?.ev ?? 0;

  const rows = [
    [
      { label: "Win Rate", value: `${winRatePct.toFixed(0)}%` },
      { label: "Total Trades", value: String(s?.totalTrades ?? 0) },
      {
        label: "Streak",
        value: streak.type ? `${streak.count}${streak.type}` : "—",
        accent: streak.type === "W" ? "green" : streak.type === "L" ? "red" : undefined,
      },
    ],
    [
      { label: "Avg Win", value: fmtUSD(avgWin), accent: "green" as const },
      { label: "Avg Loss", value: fmtUSD(s?.avgLoss ?? 0), accent: "red" as const },
      {
        label: "EV / Trade",
        value: fmtUSD(ev),
        accent: ev >= 0 ? ("green" as const) : ("red" as const),
      },
    ],
    [
      {
        label: "Total R",
        value: `${(s?.totalR ?? 0).toFixed(2)}R`,
        accent: (s?.totalR ?? 0) >= 0 ? ("green" as const) : ("red" as const),
      },
      { label: "Best Trade", value: fmtUSD(s?.largestWin ?? 0), accent: "green" as const },
      { label: "Worst Trade", value: fmtUSD(s?.largestLoss ?? 0), accent: "red" as const },
    ],
  ];

  const newsTrades = trades.filter(
    (t) => (t as { news_id?: string | null }).news_id != null,
  );
  const cleanTrades = trades.filter(
    (t) => (t as { news_id?: string | null }).news_id == null,
  );
  const newsBucket = bucketStats(newsTrades);
  const cleanBucket = bucketStats(cleanTrades);
  const rec = newsRecommendation(newsBucket, cleanBucket);

  return (
    <section className="space-y-3">
      <div className="grid gap-2">
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-2">
            {row.map((cell) => {
              const color =
                cell.accent === "green"
                  ? "text-trade-green"
                  : cell.accent === "red"
                    ? "text-trade-red"
                    : "text-foreground";
              return (
                <div
                  key={cell.label}
                  className="rounded-xl border border-border bg-card p-3 text-center"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
                    {cell.label}
                  </div>
                  <div className={cn("mt-1 font-data text-base font-semibold", color)}>
                    {cell.value}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* EV Formula */}
      <div
        className={cn(
          "rounded-xl border p-3 text-center font-data text-xs leading-relaxed",
          ev >= 0
            ? "border-trade-green/30 bg-trade-green/5 text-trade-green"
            : "border-trade-red/30 bg-trade-red/5 text-trade-red",
        )}
      >
        <div className="opacity-80">
          EV = (WinRate% × AvgWin) − (LossRate% × |AvgLoss|)
        </div>
        <div className="mt-0.5 font-semibold text-sm">
          EV = ({winRatePct.toFixed(0)}% × {fmtUSD(avgWin)}) − ({lossRatePct.toFixed(0)}% ×{" "}
          {fmtUSD(avgLoss)}) = {fmtUSD(ev)} per trade
        </div>
      </div>

      {/* News Impact Tracker */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-data">
          <Newspaper className="h-3 w-3" />
          News Impact Tracker
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NewsBucketCard label="News-Driven" bucket={newsBucket} tone="amber" />
          <NewsBucketCard label="Clean Setup" bucket={cleanBucket} tone="green" />
        </div>
        {rec ? (
          <div
            className={cn(
              "mt-2 flex items-start gap-2 rounded-lg border p-2.5 text-xs leading-snug",
              rec.tone === "bad" && "border-trade-red/30 bg-trade-red/5 text-trade-red",
              rec.tone === "good" && "border-trade-green/30 bg-trade-green/5 text-trade-green",
              rec.tone === "neutral" && "border-border bg-muted/30 text-muted-foreground",
            )}
          >
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{rec.text}</span>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tag trades with a news event to see news-driven vs clean-setup performance (need at least 3 of each).
          </p>
        )}
      </div>
    </section>
  );
}

function NewsBucketCard({
  label,
  bucket,
  tone,
}: {
  label: string;
  bucket: NewsBucketStats;
  tone: "amber" | "green";
}) {
  const accent =
    tone === "amber"
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-trade-green/30 bg-trade-green/5";
  const wrPct = bucket.winRate * 100;
  return (
    <div className={cn("rounded-lg border p-2.5", accent)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
        {label}
      </div>
      <div className="mt-1 font-data text-base font-semibold">
        {bucket.count > 0 ? `${wrPct.toFixed(0)}%` : "—"}
        <span className="ml-1 text-[10px] font-normal text-muted-foreground">win</span>
      </div>
      <div className="mt-0.5 font-data text-[11px] text-muted-foreground">
        {bucket.count} trades · avg{" "}
        <span
          className={cn(
            bucket.avgR > 0 && "text-trade-green",
            bucket.avgR < 0 && "text-trade-red",
          )}
        >
          {bucket.avgR >= 0 ? "+" : ""}
          {bucket.avgR.toFixed(2)}R
        </span>
      </div>
    </div>
  );
}
