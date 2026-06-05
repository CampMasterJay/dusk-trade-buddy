import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Sparkles, Tag } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { type Trade } from "@/lib/tradeService";
import { cn } from "@/lib/utils";
import { generateSetupInsight } from "@/lib/api/setupInsight.functions";
import { SETUP_TAGS } from "@/components/NewTradeSheet";

interface Props {
  trades: Trade[];
}

type Bucket = {
  setup: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1
  avgR: number;
  totalPnl: number;
  bestPnl: number;
  worstPnl: number;
};

type SortKey = "setup" | "trades" | "winRate" | "avgR" | "totalPnl";

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function buildBuckets(trades: Trade[]): Bucket[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const raw = (t as { setup_tag?: string | null }).setup_tag;
    const tag = raw && raw.trim().length > 0 ? raw : "Untagged";
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag)!.push(t);
  }
  const buckets: Bucket[] = [];
  for (const [setup, arr] of groups) {
    const decisive = arr.filter((t) => t.result === "Win" || t.result === "Loss");
    const wins = decisive.filter((t) => t.result === "Win").length;
    const losses = decisive.filter((t) => t.result === "Loss").length;
    const rs = arr.map((t) => Number(t.r_multiple)).filter((n) => Number.isFinite(n));
    const avgR = rs.length ? rs.reduce((s, n) => s + n, 0) / rs.length : 0;
    const pnls = arr.map((t) => Number(t.pnl ?? 0)).filter((n) => Number.isFinite(n));
    const totalPnl = pnls.reduce((s, n) => s + n, 0);
    const bestPnl = pnls.length ? Math.max(...pnls) : 0;
    const worstPnl = pnls.length ? Math.min(...pnls) : 0;
    buckets.push({
      setup,
      trades: arr.length,
      wins,
      losses,
      winRate: decisive.length ? wins / decisive.length : 0,
      avgR,
      totalPnl,
      bestPnl,
      worstPnl,
    });
  }
  return buckets;
}

export function SetupPerformanceBreakdown({ trades }: Props) {
  const buckets = useMemo(() => buildBuckets(trades), [trades]);
  const [sortKey, setSortKey] = useState<SortKey>("totalPnl");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const arr = [...buckets];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" || typeof bv === "string") {
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [buckets, sortKey, sortDir]);

  const maxAbsPnl = Math.max(1, ...buckets.map((b) => Math.abs(b.totalPnl)));

  const onSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "setup" ? "asc" : "desc");
    }
  };

  // AI insight
  const runInsight = useServerFn(generateSetupInsight);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  const aiPayload = useMemo(
    () =>
      buckets
        .filter((b) => b.setup !== "Untagged" && b.trades > 0)
        .map((b) => ({
          setup: b.setup,
          trades: b.trades,
          winRate: b.winRate,
          avgR: b.avgR,
          totalPnl: b.totalPnl,
        })),
    [buckets],
  );

  const payloadKey = useMemo(() => JSON.stringify(aiPayload), [aiPayload]);

  useEffect(() => {
    if (aiPayload.length < 2) {
      setInsight(null);
      return;
    }
    let cancelled = false;
    setInsightLoading(true);
    runInsight({ data: { buckets: aiPayload } })
      .then((res) => {
        if (!cancelled) setInsight(res.insight);
      })
      .catch(() => {
        if (!cancelled) setInsight(null);
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  const tagged = buckets.filter((b) => b.setup !== "Untagged");
  const totalTagged = tagged.reduce((s, b) => s + b.trades, 0);

  return (
    <section className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-data">
          <Tag className="h-3 w-3" />
          Setup Performance
        </div>
        <span className="font-data text-[10px] text-muted-foreground">
          {totalTagged}/{trades.length} tagged
        </span>
      </div>

      {buckets.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No trades yet.
        </p>
      ) : tagged.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Tag a trade with a setup type ({SETUP_TAGS.slice(0, 3).join(", ")}…) to see your breakdown.
        </p>
      ) : (
        <>
          {/* Sortable table */}
          <div className="overflow-x-auto -mx-3 px-3">
            <table className="w-full font-data text-[11px]">
              <thead>
                <tr className="text-muted-foreground uppercase tracking-wider text-[9px]">
                  <HeaderCell label="Setup" k="setup" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="left" />
                  <HeaderCell label="#" k="trades" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <HeaderCell label="Win%" k="winRate" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <HeaderCell label="Avg R" k="avgR" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <HeaderCell label="P&L" k="totalPnl" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className="px-1.5 py-1.5 text-right">Best / Worst</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b) => {
                  const wrPct = b.winRate * 100;
                  return (
                    <tr key={b.setup} className="border-t border-border/60">
                      <td className="px-1.5 py-2 font-medium">{b.setup}</td>
                      <td className="px-1.5 py-2 text-right">{b.trades}</td>
                      <td className="px-1.5 py-2 text-right">
                        {b.wins + b.losses > 0 ? `${wrPct.toFixed(0)}%` : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-1.5 py-2 text-right",
                          b.avgR > 0 && "text-trade-green",
                          b.avgR < 0 && "text-trade-red",
                        )}
                      >
                        {b.avgR >= 0 ? "+" : ""}
                        {b.avgR.toFixed(2)}R
                      </td>
                      <td
                        className={cn(
                          "px-1.5 py-2 text-right",
                          b.totalPnl > 0 && "text-trade-green",
                          b.totalPnl < 0 && "text-trade-red",
                        )}
                      >
                        {fmtUSD(b.totalPnl)}
                      </td>
                      <td className="px-1.5 py-2 text-right text-[10px] text-muted-foreground whitespace-nowrap">
                        <span className="text-trade-green">{fmtUSD(b.bestPnl)}</span>
                        {" / "}
                        <span className="text-trade-red">{fmtUSD(b.worstPnl)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Horizontal bar chart */}
          <div className="mt-4 space-y-1.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-data">
              Total P&L by setup
            </div>
            {tagged.map((b) => {
              const pct = (Math.abs(b.totalPnl) / maxAbsPnl) * 100;
              const positive = b.totalPnl >= 0;
              return (
                <div key={b.setup} className="flex items-center gap-2">
                  <div className="w-20 shrink-0 text-[10px] font-data text-muted-foreground truncate">
                    {b.setup}
                  </div>
                  <div className="relative h-4 flex-1 rounded bg-muted/40 overflow-hidden">
                    <div
                      className={cn(
                        "h-full",
                        positive ? "bg-trade-green/70" : "bg-trade-red/70",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div
                    className={cn(
                      "w-16 text-right font-data text-[10px]",
                      positive ? "text-trade-green" : "text-trade-red",
                    )}
                  >
                    {fmtUSD(b.totalPnl)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI Insight */}
          <div
            className={cn(
              "mt-4 flex items-start gap-2 rounded-lg border p-2.5 text-xs leading-snug",
              "border-primary/30 bg-primary/5 text-foreground",
            )}
          >
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              {insightLoading
                ? "Analyzing your setup performance…"
                : insight
                  ? insight
                  : aiPayload.length < 2
                    ? "Tag at least two different setup types to unlock AI coaching."
                    : "Insight unavailable right now."}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function HeaderCell({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "right",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        "px-1.5 py-1.5",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "justify-end w-full",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className="h-2.5 w-2.5" />
      </button>
    </th>
  );
}