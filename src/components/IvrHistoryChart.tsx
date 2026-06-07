import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchSpyIvrHistory, type IvrHistoryPoint } from "@/lib/api/spyIvrHistory.functions";
import { useServerFn } from "@tanstack/react-start";

const CACHE_KEY = "spy_ivr_history_v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h

type Cached = { ts: number; points: IvrHistoryPoint[]; note: string | null; as_of: string | null };

function readCache(): Cached | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(c: Cached) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore quota */
  }
}

export function IvrHistoryChart() {
  const fetchHistory = useServerFn(fetchSpyIvrHistory);
  const [data, setData] = useState<Cached | null>(() => readCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (force = false) => {
    if (!force) {
      const cached = readCache();
      if (cached) {
        setData(cached);
        return;
      }
    }
    setLoading(true);
    setError(null);
    const res = await fetchHistory();
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const next: Cached = {
      ts: Date.now(),
      points: res.points,
      note: res.note,
      as_of: res.as_of,
    };
    writeCache(next);
    setData(next);
  };

  useEffect(() => {
    if (!data) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latest = data?.points[data.points.length - 1];
  const regime =
    latest == null
      ? null
      : latest.ivr > 60
        ? { label: "ELEVATED", tone: "text-amber-300" }
        : latest.ivr < 30
          ? { label: "COMPRESSED", tone: "text-sky-300" }
          : { label: "MODERATE", tone: "text-muted-foreground" };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">SPY IV Rank — 30d</h3>
          <p className="text-xs text-muted-foreground">
            Market-wide options premium proxy. Higher = vol is being paid.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {latest && regime && (
        <div className="flex items-baseline gap-2">
          <div className="font-mono text-2xl">{latest.ivr.toFixed(0)}</div>
          <div className={`text-xs uppercase tracking-wide ${regime.tone}`}>{regime.label}</div>
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-400 rounded border border-rose-500/30 bg-rose-500/10 p-2">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="h-40 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Fetching SPY IV…
        </div>
      )}

      {data && data.points.length > 0 && (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                hide
              />
              <YAxis
                domain={[0, 100]}
                width={24}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => String(v)}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
                labelFormatter={(l) => String(l)}
                formatter={(v: number) => [`${v.toFixed(0)}`, "IVR"]}
              />
              <ReferenceLine y={60} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" opacity={0.4} />
              <ReferenceLine y={30} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" opacity={0.4} />
              <Line
                type="monotone"
                dataKey="ivr"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {data?.note && <p className="text-[10px] text-muted-foreground italic">{data.note}</p>}
      {data?.as_of && <p className="text-[10px] text-muted-foreground">As of: {data.as_of}</p>}
    </Card>
  );
}