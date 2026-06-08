import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  X,
  BookOpen,
  Zap,
  Target as TargetIcon,
  TrendingUp,
  TrendingDown,
  Star,
} from "lucide-react";
import { useTradingMode } from "@/lib/tradingMode";
import { OPTIONS_TEMPLATES, type OptionsTemplate } from "@/lib/optionsStrategyTemplates";

export type BuildPlayAnalysis = {
  instrument?: string | null;
  timeframe?: string | null;
  trend?: string;
  bias?: string;
  biasDirection?: string;
  setupDetected?: string;
  setupQuality?: number;
  summary?: string;
  patterns?: string[];
  confluenceFactors?: string[];
  riskFactors?: string[];
  risks?: string[];
  setupIdea?: { direction?: string; entry?: string; stop?: string; target?: string; rr?: string };
  optionsRecommendation?: {
    primaryStrategy?: string;
    alternativeStrategy?: string;
    reasoning?: string;
    idealDTE?: string;
    idealDelta?: string;
    ivRankNote?: string;
    strikeGuidance?: string;
    expirationGuidance?: string;
    maxRiskGuidance?: string;
    earningsWarning?: boolean;
    keyRisk?: string;
  };
};

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fmtUsd(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function matchOptionsTemplate(a: BuildPlayAnalysis): OptionsTemplate | null {
  const target = (a.optionsRecommendation?.primaryStrategy ?? "").toLowerCase();
  if (!target) return null;
  let best: { t: OptionsTemplate; score: number } | null = null;
  for (const t of OPTIONS_TEMPLATES) {
    const names = (t.filters.strategies ?? []).map((s) => s.toLowerCase());
    let score = 0;
    for (const n of names) {
      if (n === target) score = Math.max(score, 3);
      else if (target.includes(n) || n.includes(target)) score = Math.max(score, 2);
    }
    if (score === 0) continue;
    if (!best || score > best.score) best = { t, score };
  }
  return best?.t ?? null;
}

export function BuildPlayModal({
  a,
  balance,
  riskPct,
  onClose,
  onUseLevels,
  onOpenOptionsTrade,
}: {
  a: BuildPlayAnalysis;
  balance?: number;
  riskPct?: number;
  onClose: () => void;
  onUseLevels?: () => void;
  onOpenOptionsTrade?: () => void;
}) {
  const [mode] = useTradingMode();
  const navigate = useNavigate();

  const dirRaw = (a.biasDirection ?? a.setupIdea?.direction ?? "").toString().toLowerCase();
  const dirLabel = dirRaw === "long" ? "LONG" : dirRaw === "short" ? "SHORT" : "NEUTRAL";
  const setupName = (a.setupDetected ?? a.patterns?.[0] ?? "A+ Play").toString().toUpperCase();
  const quality = Math.max(0, Math.min(5, Math.round(Number(a.setupQuality ?? 0))));

  const entry = toNum(a.setupIdea?.entry);
  const stop = toNum(a.setupIdea?.stop);
  const target = toNum(a.setupIdea?.target);
  const rr =
    entry != null && stop != null && target != null && entry !== stop
      ? Math.abs(target - entry) / Math.abs(entry - stop)
      : toNum(a.setupIdea?.rr);

  const _balance = balance ?? 0;
  const _riskPct = riskPct ?? 0;
  const riskDollar = _balance > 0 && _riskPct > 0 ? (_balance * _riskPct) / 100 : 0;
  const stopDist = entry != null && stop != null ? Math.abs(entry - stop) : null;
  const contracts =
    riskDollar > 0 && stopDist != null && stopDist > 0
      ? Math.max(1, Math.floor(riskDollar / (stopDist * 50)))
      : null;

  const confluence = a.confluenceFactors ?? [];
  const risks = a.riskFactors ?? a.risks ?? [];

  const optTemplate = useMemo(() => matchOptionsTemplate(a), [a]);
  const rec = a.optionsRecommendation;
  const isOptions = mode === "options";

  function seedFuturesPlaybook() {
    const dir = dirLabel === "LONG" ? "Long" : dirLabel === "SHORT" ? "Short" : "Both";
    sessionStorage.setItem(
      "pendingPlaybookSeed",
      JSON.stringify({
        setups: a.setupDetected ? [a.setupDetected] : [],
        instruments: a.instrument ? [a.instrument] : [],
        direction: dir,
      }),
    );
    void navigate({ to: "/playbook" });
  }

  function seedOptionsPlaybook() {
    if (!rec) return;
    const dir = rec.primaryStrategy?.toLowerCase().match(/credit|condor|spread.*put|short/)
      ? "Credit"
      : rec.primaryStrategy?.toLowerCase().match(/long|debit|straddle|strangle/)
        ? "Debit"
        : "Both";
    const dteMatch = (rec.idealDTE ?? "").match(/(\d+)\D+(\d+)|(\d+)/);
    const dteRange: [number, number] = dteMatch
      ? dteMatch[2]
        ? [Number(dteMatch[1]), Number(dteMatch[2])]
        : [Math.max(0, Number(dteMatch[3]) - 7), Number(dteMatch[3]) + 7]
      : [0, 60];
    sessionStorage.setItem(
      "pendingOptionsPlaybookSeed",
      JSON.stringify({
        strategies: rec.primaryStrategy ? [rec.primaryStrategy] : [],
        underlyings: a.instrument ? [a.instrument] : [],
        dteRange,
        direction: dir,
        earnings: rec.earningsWarning ? "Avoid" : "Either",
      }),
    );
    void navigate({ to: "/playbook" });
  }

  const biasCls =
    dirLabel === "LONG"
      ? "text-trade-green border-trade-green/40 bg-trade-green/10"
      : dirLabel === "SHORT"
        ? "text-trade-red border-trade-red/40 bg-trade-red/10"
        : "text-muted-foreground border-border bg-muted";
  const BiasIcon = dirLabel === "SHORT" ? TrendingDown : TrendingUp;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-trade-green/40 bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-gradient-to-r from-trade-green/15 via-card to-card p-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-trade-green" />
            <span className="text-xs font-bold font-data uppercase tracking-[3px] text-trade-green">
              A+ Play Builder
            </span>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-data uppercase tracking-wider text-muted-foreground">
              {isOptions ? "Options" : "Futures"} Mode
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Shared header */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-bold font-data uppercase tracking-[2px] leading-tight text-foreground">
                {setupName}
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-data uppercase tracking-wider ${biasCls}`}
              >
                <BiasIcon className="h-3 w-3" />
                {dirLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3.5 w-3.5 ${i < quality ? "fill-trade-green text-trade-green" : "text-muted-foreground/40"}`}
                  />
                ))}
                <span className="ml-1 text-[10px] font-data uppercase tracking-wider text-muted-foreground">
                  Quality {quality}/5
                </span>
              </div>
              {a.instrument && (
                <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-data">
                  {a.instrument}
                </span>
              )}
              {a.timeframe && (
                <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-data">
                  {a.timeframe}
                </span>
              )}
            </div>
            {a.summary && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {a.summary}
              </p>
            )}
          </div>

          {/* MODE-SPECIFIC BODY */}
          {!isOptions ? (
            <>
              {/* Futures Plan */}
              <div className="rounded-xl border border-trade-green/30 bg-trade-green/5 p-4">
                <h3 className="mb-3 text-[10px] font-data uppercase tracking-[3px] text-trade-green">
                  Trade Plan
                </h3>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat label="Entry" value={entry ?? a.setupIdea?.entry ?? "—"} tone="green" />
                  <Stat label="Stop" value={stop ?? a.setupIdea?.stop ?? "—"} tone="red" />
                  <Stat label="Target" value={target ?? a.setupIdea?.target ?? "—"} tone="green" />
                  <Stat label="R:R" value={rr != null ? rr.toFixed(2) : "—"} tone="neutral" />
                </div>
                {(riskDollar > 0 || contracts != null) && (
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs font-data">
                    {riskDollar > 0 && (
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                          Risk per trade
                        </span>
                        <div className="font-bold text-trade-red">{fmtUsd(riskDollar)}</div>
                      </div>
                    )}
                    {contracts != null && (
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                          Est. size
                        </span>
                        <div className="font-bold">{contracts} contracts</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <ChecklistBlock confluence={confluence} risks={risks} />
            </>
          ) : (
            <>
              {/* Options Strategy */}
              {rec ? (
                <div className="rounded-xl border border-trade-green/30 bg-gradient-to-br from-trade-green/8 to-card p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-trade-green">
                    <Sparkles className="h-3 w-3" /> Recommended Strategy
                  </div>
                  <div className="text-xl font-bold font-data uppercase tracking-wider">
                    {rec.primaryStrategy}
                  </div>
                  {rec.alternativeStrategy && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Alt: <span className="font-data">{rec.alternativeStrategy}</span>
                    </div>
                  )}
                  {rec.reasoning && (
                    <p className="mt-3 text-sm leading-relaxed">{rec.reasoning}</p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {rec.idealDTE && <Stat label="DTE" value={rec.idealDTE} tone="neutral" />}
                    {rec.idealDelta && <Stat label="Delta" value={rec.idealDelta} tone="neutral" />}
                    {rec.ivRankNote && <Stat label="IV" value={rec.ivRankNote} tone="neutral" />}
                    {rec.strikeGuidance && (
                      <Stat label="Strikes" value={rec.strikeGuidance} tone="neutral" />
                    )}
                    {rec.expirationGuidance && (
                      <Stat label="Expiry" value={rec.expirationGuidance} tone="neutral" />
                    )}
                    {rec.maxRiskGuidance && (
                      <Stat label="Max Risk" value={rec.maxRiskGuidance} tone="red" />
                    )}
                  </div>

                  {(rec.earningsWarning || rec.keyRisk) && (
                    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                      {rec.earningsWarning && (
                        <div className="flex items-start gap-2 text-xs text-amber-500">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Earnings window — IV crush risk
                        </div>
                      )}
                      {rec.keyRisk && (
                        <div className="flex items-start gap-2 text-xs text-trade-red">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {rec.keyRisk}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-500">
                  No options recommendation in this analysis. Switch the Chart Analyzer mode
                  to Options (or Both) and re-run for a strategy suggestion.
                </div>
              )}

              {optTemplate && (
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
                    <BookOpen className="h-3 w-3" /> Best-fit Template
                  </div>
                  <div className="flex items-start gap-3">
                    <optTemplate.icon className="mt-0.5 h-5 w-5 text-trade-green" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold font-data uppercase tracking-wider">
                        {optTemplate.name}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {optTemplate.blurb}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed">{optTemplate.notes}</p>
                    </div>
                  </div>
                </div>
              )}

              <ChecklistBlock confluence={confluence} risks={risks} />
            </>
          )}

          {/* Actions */}
          <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
            {!isOptions ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onUseLevels?.();
                    onClose();
                  }}
                  disabled={!onUseLevels}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-trade-green px-4 py-3 text-sm font-bold font-data uppercase tracking-wider text-background hover:bg-trade-green/90 disabled:opacity-50"
                >
                  Use These Levels <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={seedFuturesPlaybook}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-bold font-data uppercase tracking-wider hover:bg-accent"
                >
                  <BookOpen className="h-4 w-4" /> Save to Playbook
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onOpenOptionsTrade?.();
                    onClose();
                  }}
                  disabled={!onOpenOptionsTrade || !rec}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-trade-green px-4 py-3 text-sm font-bold font-data uppercase tracking-wider text-background hover:bg-trade-green/90 disabled:opacity-50"
                >
                  <TargetIcon className="h-4 w-4" /> Open Trade Sheet
                </button>
                <button
                  type="button"
                  onClick={seedOptionsPlaybook}
                  disabled={!rec}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-bold font-data uppercase tracking-wider hover:bg-accent disabled:opacity-50"
                >
                  <BookOpen className="h-4 w-4" /> Save to Playbook
                </button>
              </>
            )}
          </div>

          <p className="pt-1 text-[10px] text-muted-foreground">
            AI-generated play — confirm against your own process before risking capital.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "green" | "red" | "neutral";
}) {
  const cls =
    tone === "green"
      ? "text-trade-green"
      : tone === "red"
        ? "text-trade-red"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <div className="text-[9px] font-data uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-bold font-data ${cls}`}>{value}</div>
    </div>
  );
}

function ChecklistBlock({
  confluence,
  risks,
}: {
  confluence: string[];
  risks: string[];
}) {
  if (confluence.length === 0 && risks.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {confluence.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <h4 className="mb-2 text-[10px] font-data uppercase tracking-wider text-trade-green">
            Confluence
          </h4>
          <ul className="space-y-1.5">
            {confluence.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-trade-green" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {risks.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <h4 className="mb-2 text-[10px] font-data uppercase tracking-wider text-trade-red">
            Risks
          </h4>
          <ul className="space-y-1.5">
            {risks.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-trade-red" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}