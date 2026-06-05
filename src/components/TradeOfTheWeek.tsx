import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, TrendingUp, TrendingDown, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  generateTradeOfWeek,
  type TradeOfWeek,
} from "@/lib/api/tradeOfWeek.functions";

const STORAGE_PREFIX = "edgetrader.tradeOfWeek.v1.";

function currentWeekId(): string {
  // ISO-ish year-week (Sun-start ok for caching purposes).
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

type Cached = { trade: TradeOfWeek; source: "ai" | "fallback"; note?: string };

export function TradeOfTheWeek() {
  const weekId = currentWeekId();
  const storageKey = STORAGE_PREFIX + weekId;

  const [data, setData] = useState<Cached | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const callFn = useServerFn(generateTradeOfWeek);

  const load = async () => {
    setLoading(true);
    try {
      const result = await callFn({ data: { weekId } });
      setData(result);
      try {
        localStorage.setItem(storageKey, JSON.stringify(result));
      } catch {
        /* noop */
      }
    } catch (err) {
      console.error("[TradeOfTheWeek] generate failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!data) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trade = data?.trade;
  const DirIcon = trade?.direction === "Short" ? TrendingDown : TrendingUp;
  const dirColor = trade?.direction === "Short" ? "text-trade-red" : "text-trade-green";

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
          <GraduationCap className="h-3 w-3" />
          Trade of the Week
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-data uppercase tracking-wider text-amber-400">
        <Info className="h-3 w-3" />
        Educational example only · not trading advice
      </div>

      {trade ? (
        <>
          <div className="flex items-center gap-2">
            <DirIcon className={cn("h-5 w-5", dirColor)} />
            <span className="font-data text-base font-semibold text-foreground">
              {trade.instrument}
            </span>
            <span className={cn("font-data text-sm uppercase tracking-wider", dirColor)}>
              {trade.direction}
            </span>
            <span className="ml-auto rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              {trade.pattern}
            </span>
          </div>

          <p className="mt-2 text-sm leading-relaxed text-foreground">{trade.thesis}</p>

          <dl className="mt-3 space-y-2">
            <Row label="Trigger" value={trade.trigger} />
            <Row label="Invalidation" value={trade.invalidation} />
            <Row label="R:R" value={trade.rr} />
          </dl>

          {data?.source === "fallback" && data.note ? (
            <p className="mt-3 text-[11px] text-muted-foreground">{data.note}</p>
          ) : null}
        </>
      ) : (
        <div className="py-6 text-center text-sm text-muted-foreground">
          {loading ? "Pulling this week's context…" : "Tap refresh to generate this week's setup."}
          {!loading && !data ? (
            <div className="mt-3">
              <Button size="sm" onClick={() => void load()}>
                Generate
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <dt className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-xs leading-relaxed text-foreground">{value}</dd>
    </div>
  );
}