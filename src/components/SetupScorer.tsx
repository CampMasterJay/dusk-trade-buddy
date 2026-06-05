import { useEffect, useMemo, useState } from "react";
import { Check, X, Sparkles } from "lucide-react";

export type ScoreFactorKey =
  | "trend"
  | "level"
  | "volume"
  | "rr"
  | "timing";

const FACTORS: { key: ScoreFactorKey; label: string; hint: string }[] = [
  { key: "trend", label: "Trend alignment", hint: "Trade goes with prevailing trend" },
  { key: "level", label: "Key level confluence", hint: "Near major support / resistance" },
  { key: "volume", label: "Volume context", hint: "Volume confirms the move" },
  { key: "rr", label: "Risk : Reward", hint: "R:R meets your minimum" },
  { key: "timing", label: "Timing", hint: "Inside a valid session window" },
];

export type ScorerInputs = {
  trend?: "bullish" | "bearish" | "sideways" | string | null;
  biasDirection?: string | null; // Long | Short | Neutral | long | short
  confluenceFactors?: string[];
  riskFactors?: string[];
  rr?: number | null;
  minRr?: number; // from user settings
  session?: string | null; // from user settings, e.g. "NY AM"
};

function tier(score: number) {
  if (score >= 5)
    return {
      label: "Elite",
      color: "#00ffaa",
      verdict: "HIGH CONVICTION — Take it",
      verdictBg: "bg-[#00ffaa]/10 border-[#00ffaa]/40 text-[#00ffaa]",
    };
  if (score === 4)
    return {
      label: "Strong",
      color: "#4ade80",
      verdict: "GOOD SETUP — Acceptable",
      verdictBg: "bg-[#4ade80]/10 border-[#4ade80]/40 text-[#4ade80]",
    };
  if (score === 3)
    return {
      label: "Decent",
      color: "#f59e0b",
      verdict: "MARGINAL — Consider skipping",
      verdictBg: "bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]",
    };
  return {
    label: "Weak",
    color: "#f87171",
    verdict: "LOW QUALITY — Skip it",
    verdictBg: "bg-[#f87171]/10 border-[#f87171]/40 text-[#f87171]",
  };
}

function deriveAuto(inputs: ScorerInputs): Record<ScoreFactorKey, 0 | 1> {
  const bias = (inputs.biasDirection ?? "").toString().toLowerCase();
  const trend = (inputs.trend ?? "").toString().toLowerCase();
  const trendAligned =
    (trend === "bullish" && bias === "long") ||
    (trend === "bearish" && bias === "short");

  const haystack = [
    ...(inputs.confluenceFactors ?? []),
    ...(inputs.riskFactors ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const levelHit =
    /support|resistance|level|vwap|poc|value area|prior high|prior low|swing/.test(
      haystack,
    );
  const volumeHit = /volume|liquidity|delta|order flow|absorption/.test(haystack);

  const rrPass =
    typeof inputs.rr === "number" &&
    Number.isFinite(inputs.rr) &&
    inputs.rr >= (inputs.minRr ?? 1.5);

  const sessionHaystack =
    haystack + " " + (inputs.session ?? "").toString().toLowerCase();
  const timingHit =
    /open|opening|rth|ny am|ny pm|london|asia|session|first hour|power hour/.test(
      sessionHaystack,
    );

  return {
    trend: trendAligned ? 1 : 0,
    level: levelHit ? 1 : 0,
    volume: volumeHit ? 1 : 0,
    rr: rrPass ? 1 : 0,
    timing: timingHit ? 1 : 0,
  };
}

export function SetupScorer({ inputs }: { inputs: ScorerInputs }) {
  const auto = useMemo(() => deriveAuto(inputs), [inputs]);
  const [scores, setScores] = useState<Record<ScoreFactorKey, 0 | 1>>(auto);

  // Re-sync when analysis input changes
  useEffect(() => {
    setScores(auto);
  }, [auto]);

  const total = (Object.values(scores) as number[]).reduce((a, b) => a + b, 0);
  const t = tier(total);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Setup Score
        </div>
        <div className="text-right">
          <div
            className="font-data font-bold leading-none"
            style={{ color: t.color, fontSize: "2.25rem" }}
          >
            {total}
            <span className="text-base text-muted-foreground font-normal">/5</span>
          </div>
          <div
            className="mt-0.5 text-[10px] font-data uppercase tracking-[2px]"
            style={{ color: t.color }}
          >
            {t.label}
          </div>
        </div>
      </div>

      <ul className="space-y-2.5">
        {FACTORS.map((f) => {
          const v = scores[f.key];
          const on = v === 1;
          return (
            <li key={f.key}>
              <button
                type="button"
                onClick={() =>
                  setScores((s) => ({ ...s, [f.key]: s[f.key] === 1 ? 0 : 1 }))
                }
                className="group block w-full text-left"
                aria-pressed={on}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                        on
                          ? "border-trade-green bg-trade-green/20 text-trade-green"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {on ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      {f.label}
                    </span>
                  </div>
                  <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
                    {on ? "1" : "0"}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: on ? "100%" : "0%",
                      backgroundColor: t.color,
                    }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {f.hint}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      <div
        className={`mt-4 rounded-lg border px-3 py-2.5 text-center text-xs font-data font-bold uppercase tracking-[2px] ${t.verdictBg}`}
      >
        {t.verdict}
      </div>
    </div>
  );
}
