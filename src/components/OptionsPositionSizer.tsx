import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  computeOptionsSizing,
  DEFAULT_COMMISSION_PER_CONTRACT_PER_SIDE,
  type SizingInput,
  type SizingResult,
} from "@/lib/optionsPositionSizing";

interface Props {
  accountBalance: number;
  riskPct: number;
  onRiskPctChange: (n: number) => void;
  calc: SizingInput["calc"];
  commissionPerContractPerSide?: number;
  onComputed?: (result: SizingResult) => void;
}

function fmt$(n: number): string {
  if (!isFinite(n)) return "Unlimited";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function OptionsPositionSizer({
  accountBalance,
  riskPct,
  onRiskPctChange,
  calc,
  commissionPerContractPerSide = DEFAULT_COMMISSION_PER_CONTRACT_PER_SIDE,
  onComputed,
}: Props) {
  const result = useMemo(() => {
    const r = computeOptionsSizing({
      accountBalance,
      riskPct,
      calc,
      commissionPerContractPerSide,
    });
    return r;
  }, [accountBalance, riskPct, calc, commissionPerContractPerSide]);

  // Surface to parent (e.g., to lock in contracts on save). Only fire when
  // the recommended contract count actually changes — avoids render loops.
  const lastContracts = useRef<number | null>(null);
  useEffect(() => {
    if (lastContracts.current !== result.contracts) {
      lastContracts.current = result.contracts;
      onComputed?.(result);
    }
  }, [result, onComputed]);

  const breakEvenLabel = Array.isArray(result.breakEven)
    ? `${result.breakEven[0].toFixed(2)} / ${result.breakEven[1].toFixed(2)}`
    : result.breakEven.toFixed(2);

  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="opt-risk-pct" className="text-sm font-medium">
            Risk %
          </Label>
          <span className="text-sm font-mono">{riskPct.toFixed(1)}%</span>
        </div>
        <Slider
          id="opt-risk-pct"
          min={1}
          max={25}
          step={0.5}
          value={[riskPct]}
          onValueChange={(v) => onRiskPctChange(v[0] ?? 5)}
        />
        <div className="text-xs text-muted-foreground">
          Risk budget: <span className="font-mono">{fmt$(result.riskDollarBudget)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Contracts" value={String(result.contracts)} emphasis />
        <Stat
          label="Max Risk"
          value={fmt$(result.maxRisk)}
          tone="danger"
        />
        <Stat
          label="Max Profit"
          value={fmt$(result.maxProfit)}
          tone="success"
        />
        <Stat label="R:R" value={result.rrRatio ? `${result.rrRatio.toFixed(2)}x` : "—"} />
        <Stat
          label="Risk / Contract"
          value={fmt$(result.maxRiskPerContract)}
        />
        <Stat
          label="Commission est."
          value={fmt$(result.commissionEstimate)}
        />
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-3">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          Break Even
        </div>
        <div className="text-2xl font-mono font-semibold mt-1">
          {breakEvenLabel}
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="space-y-2">
          {result.warnings.map((w, i) => (
            <WarningBanner key={i} kind={w.kind} message={w.message} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        Options sizing typically works best with 3–10% risk per trade minimum.
        Concentration over 15% of account is flagged.
      </p>
    </Card>
  );
}

function Stat({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-500"
      : tone === "danger"
        ? "text-rose-500"
        : "text-foreground";
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`font-mono ${emphasis ? "text-lg font-semibold" : "text-sm"} ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function WarningBanner({
  kind,
  message,
}: {
  kind: string;
  message: string;
}) {
  const danger =
    kind === "concentration" || kind === "below_one_contract";
  return (
    <div
      className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
        danger
          ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
          : "border-amber-500/40 bg-amber-500/10 text-amber-200"
      }`}
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
