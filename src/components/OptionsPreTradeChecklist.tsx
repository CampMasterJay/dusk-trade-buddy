import { useEffect, useMemo } from "react";
import { CheckSquare, Square, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type OptionsChecklistKind = "debit" | "credit" | "0dte";

export type OptionsChecklistInputs = {
  ivRank: number | null; // 0–100
  dte: number | null;
  hasCatalyst: boolean;
  hasEarningsInWindow: boolean; // earnings within 5 days
  isEarningsPlay: boolean; // user intentionally tagged
  positionPctOfAccount: number | null; // 0–100
  bprPctOfAccount: number | null; // for credit
  profitTargetPct: number | null;
  stopLossPct: number | null;
  marketRegime: string | null; // "Trending" | "Ranging" | etc.
  isDefinedRisk: boolean;
  // 0DTE-only
  hour24Et?: number | null;
  recentLoss?: boolean | null; // any loss in current session
};

type Item = {
  label: string;
  pass: boolean | null; // null = unknown / can't verify
  hint?: string;
};

function detectKind(
  isDebit: boolean | null,
  is0DTE: boolean,
): OptionsChecklistKind {
  if (is0DTE) return "0dte";
  if (isDebit === false) return "credit";
  return "debit";
}

export function buildChecklist(
  kind: OptionsChecklistKind,
  i: OptionsChecklistInputs,
): Item[] {
  if (kind === "debit") {
    return [
      {
        label: "IVR below 40 (buying cheap premium)",
        pass: i.ivRank == null ? null : i.ivRank < 40,
        hint: i.ivRank == null ? "Enter IV Rank" : `IVR = ${i.ivRank}`,
      },
      { label: "Clear directional catalyst", pass: i.hasCatalyst },
      {
        label: "Expiration gives ≥ 2× expected move time (DTE ≥ 14)",
        pass: i.dte == null ? null : i.dte >= 14,
        hint: i.dte == null ? undefined : `DTE = ${i.dte}`,
      },
      {
        label: "Break-even achievable (not far OTM)",
        pass: null,
        hint: "Verify on simulator",
      },
      {
        label: "No earnings within 5 days (or intentional)",
        pass: !i.hasEarningsInWindow || i.isEarningsPlay,
      },
      {
        label: "Position size ≤ 5% of account",
        pass:
          i.positionPctOfAccount == null ? null : i.positionPctOfAccount <= 5,
        hint:
          i.positionPctOfAccount != null
            ? `Risk = ${i.positionPctOfAccount.toFixed(1)}%`
            : undefined,
      },
      {
        label: "Defined exit: profit target & stop loss",
        pass: !!(i.profitTargetPct && i.stopLossPct),
      },
      {
        label: "Aligns with market regime (trending = directional OK)",
        pass:
          i.marketRegime == null
            ? null
            : /trend|expansion/i.test(i.marketRegime),
        hint: i.marketRegime ?? undefined,
      },
    ];
  }

  if (kind === "credit") {
    return [
      {
        label: "IVR above 50 (selling elevated premium)",
        pass: i.ivRank == null ? null : i.ivRank > 50,
        hint: i.ivRank == null ? "Enter IV Rank" : `IVR = ${i.ivRank}`,
      },
      {
        label: "Strike placement ≥ 1 standard deviation buffer",
        pass: null,
        hint: "Verify in option chain",
      },
      {
        label: "DTE between 21–45 (optimal theta zone)",
        pass: i.dte == null ? null : i.dte >= 21 && i.dte <= 45,
        hint: i.dte == null ? undefined : `DTE = ${i.dte}`,
      },
      {
        label: "Underlying in ranging or stable regime",
        pass:
          i.marketRegime == null
            ? null
            : /rang|chop|stable|neutral/i.test(i.marketRegime),
        hint: i.marketRegime ?? undefined,
      },
      {
        label: "No earnings / Fed / major news within DTE",
        pass: !i.hasEarningsInWindow,
      },
      {
        label: "Profit target ≈ 50% of max profit",
        pass:
          i.profitTargetPct == null
            ? null
            : i.profitTargetPct >= 40 && i.profitTargetPct <= 60,
        hint:
          i.profitTargetPct != null ? `${i.profitTargetPct}%` : undefined,
      },
      {
        label: "Stop loss ≈ 2× credit received (≈ 200%)",
        pass:
          i.stopLossPct == null ? null : i.stopLossPct >= 150 && i.stopLossPct <= 250,
        hint: i.stopLossPct != null ? `${i.stopLossPct}%` : undefined,
      },
      {
        label: "Position BPR ≤ 5% of account",
        pass: i.bprPctOfAccount == null ? null : i.bprPctOfAccount <= 5,
        hint:
          i.bprPctOfAccount != null
            ? `BPR = ${i.bprPctOfAccount.toFixed(1)}%`
            : undefined,
      },
    ];
  }

  // 0DTE — 6 items
  return [
    {
      label: "Before 11 AM ET (best 0DTE window)",
      pass: i.hour24Et == null ? null : i.hour24Et < 11,
      hint: i.hour24Et != null ? `Now: ${i.hour24Et}:00 ET` : undefined,
    },
    {
      label: "Position size ≤ 2% of account",
      pass: i.positionPctOfAccount == null ? null : i.positionPctOfAccount <= 2,
      hint:
        i.positionPctOfAccount != null
          ? `Risk = ${i.positionPctOfAccount.toFixed(1)}%`
          : undefined,
    },
    {
      label: "Hard stop set (actual order, not mental)",
      pass: !!i.stopLossPct,
    },
    {
      label: "Will exit by 3:30 PM ET regardless",
      pass: null,
      hint: "Acknowledge",
    },
    {
      label: "Defined-risk strategy (spread, not naked)",
      pass: i.isDefinedRisk,
    },
    {
      label: "NOT revenge trading from a prior loss today",
      pass: i.recentLoss == null ? null : !i.recentLoss,
      hint: i.recentLoss ? "Loss earlier today detected" : undefined,
    },
  ];
}

function scoreOf(items: Item[]): { score: number; total: number } {
  // null counts as not passing; pass=true counts.
  return {
    score: items.filter((x) => x.pass === true).length,
    total: items.length,
  };
}

function verdictOf(score: number, total: number) {
  // Use 5/6/7 thresholds for 8-item lists; scale for 6-item.
  const lowCap = total === 6 ? 3 : 5;
  const midCap = total === 6 ? 4 : 6;
  if (score < lowCap)
    return {
      label: "LOW CONVICTION — Consider skipping",
      tone: "rose" as const,
      Icon: ShieldX,
    };
  if (score <= midCap)
    return {
      label: "MARGINAL — Proceed with caution",
      tone: "amber" as const,
      Icon: ShieldAlert,
    };
  return {
    label: "QUALIFIED SETUP — Proceed",
    tone: "emerald" as const,
    Icon: ShieldCheck,
  };
}

type Props = {
  isDebit: boolean | null;
  is0DTE: boolean;
  inputs: OptionsChecklistInputs;
  onScoreChange?: (score: number, total: number) => void;
};

export function OptionsPreTradeChecklist({
  isDebit,
  is0DTE,
  inputs,
  onScoreChange,
}: Props) {
  const kind = detectKind(isDebit, is0DTE);
  const items = useMemo(() => buildChecklist(kind, inputs), [kind, inputs]);
  const { score, total } = scoreOf(items);
  const verdict = verdictOf(score, total);

  useEffect(() => {
    onScoreChange?.(score, total);
  }, [score, total, onScoreChange]);

  return (
    <Card
      className={cn(
        "p-3 space-y-2 border-2",
        verdict.tone === "emerald" && "border-emerald-500/40 bg-emerald-500/5",
        verdict.tone === "amber" && "border-amber-500/40 bg-amber-500/5",
        verdict.tone === "rose" && "border-rose-500/50 bg-rose-500/10",
      )}
    >
      <div className="flex items-center gap-2">
        <verdict.Icon
          className={cn(
            "h-4 w-4",
            verdict.tone === "emerald" && "text-emerald-400",
            verdict.tone === "amber" && "text-amber-400",
            verdict.tone === "rose" && "text-rose-400",
          )}
        />
        <h3 className="text-xs uppercase tracking-wider font-data text-muted-foreground">
          {kind === "debit"
            ? "Debit strategy checklist"
            : kind === "credit"
              ? "Credit strategy checklist"
              : "0DTE checklist"}
        </h3>
        <span className="ml-auto font-mono text-sm">
          <span
            className={cn(
              "font-semibold",
              verdict.tone === "emerald" && "text-emerald-400",
              verdict.tone === "amber" && "text-amber-400",
              verdict.tone === "rose" && "text-rose-400",
            )}
          >
            {score}
          </span>
          <span className="text-muted-foreground">/{total}</span>
        </span>
      </div>

      <ul className="space-y-1">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2 text-xs">
            {item.pass === true ? (
              <CheckSquare className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
            ) : item.pass === false ? (
              <Square className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />
            ) : (
              <Square className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  item.pass === true
                    ? "text-foreground"
                    : item.pass === false
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {item.label}
              </div>
              {item.hint && (
                <div className="text-[10px] font-mono text-muted-foreground">
                  {item.hint}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div
        className={cn(
          "text-xs font-semibold pt-1 border-t",
          verdict.tone === "emerald" && "text-emerald-400 border-emerald-500/30",
          verdict.tone === "amber" && "text-amber-400 border-amber-500/30",
          verdict.tone === "rose" && "text-rose-400 border-rose-500/40",
        )}
      >
        {verdict.label}
      </div>
    </Card>
  );
}