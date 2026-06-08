import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis, ReferenceArea } from "recharts";
import { buildVixTiers, classifyVix } from "@/lib/vixTiers";
import { cn } from "@/lib/utils";

function fmtUSD(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function SparklineCard({
  data,
  color,
  startingBalance,
  currentBalance,
  vixThresholds,
}: {
  data: { i: number; balance: number; vix: number | null }[];
  color: string;
  startingBalance: number;
  currentBalance: number;
  vixThresholds?: {
    low?: number | null;
    normal?: number | null;
    elevated?: number | null;
  };
}) {
  const delta = currentBalance - startingBalance;
  const [vixOverlay, setVixOverlay] = useState(false);
  const tiers = useMemo(() => buildVixTiers(vixThresholds), [vixThresholds]);
  const hasVix = data.some((d) => d.vix != null);
  const overlaySegments = useMemo(() => {
    if (!vixOverlay || !hasVix) return [];
    const segs: { x1: number; x2: number; color: string; label: string }[] = [];
    let cur: { start: number; key: string; color: string; label: string } | null = null;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const tier = classifyVix(d.vix, tiers);
      if (!tier) {
        if (cur) {
          segs.push({ x1: cur.start, x2: i - 1, color: cur.color, label: cur.label });
          cur = null;
        }
        continue;
      }
      if (!cur) {
        cur = { start: i, key: tier.key, color: tier.color, label: tier.label };
      } else if (cur.key !== tier.key) {
        segs.push({ x1: cur.start, x2: i - 1, color: cur.color, label: cur.label });
        cur = { start: i, key: tier.key, color: tier.color, label: tier.label };
      }
    }
    if (cur) {
      segs.push({ x1: cur.start, x2: data.length - 1, color: cur.color, label: cur.label });
    }
    return segs;
  }, [data, tiers, vixOverlay, hasVix]);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[2px] text-muted-foreground font-data">
            Balance · Last 20 Trades
          </div>
          <div className="mt-1 font-data text-sm" style={{ color }}>
            {delta >= 0 ? "+" : "−"}
            {fmtUSD(Math.abs(delta))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVixOverlay((v) => !v)}
          disabled={!hasVix}
          className={cn(
            "rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider font-data transition-colors",
            vixOverlay && hasVix
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/40",
            !hasVix && "opacity-50",
          )}
          title={hasVix ? "Toggle VIX overlay" : "No VIX data on these trades"}
        >
          ⚡ VIX Overlay
        </button>
      </div>
      <div className="mt-3 h-32">
        {data.length <= 1 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground font-data">
            Log trades to see your balance curve.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              {overlaySegments.map((seg, idx) => (
                <ReferenceArea
                  key={idx}
                  x1={seg.x1}
                  x2={seg.x2}
                  fill={seg.color}
                  fillOpacity={0.12}
                  stroke="none"
                />
              ))}
              <Line
                type="monotone"
                dataKey="balance"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {vixOverlay && hasVix && (
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-data text-muted-foreground">
          {tiers.map((t) => (
            <div key={t.key} className="flex items-center gap-1">
              <span
                className="inline-block size-2 rounded-sm"
                style={{ background: t.color, opacity: 0.6 }}
              />
              <span>
                {t.label} <span className="opacity-70">({t.range})</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}