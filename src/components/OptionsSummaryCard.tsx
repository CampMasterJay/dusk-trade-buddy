import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchOpenOptionsGreeks,
  type PortfolioGreeks,
} from "@/lib/portfolioGreeks";
import { cn } from "@/lib/utils";

function fmt$(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`;
}

export function OptionsSummaryCard() {
  const { user } = useAuth();
  const [greeks, setGreeks] = useState<PortfolioGreeks | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchOpenOptionsGreeks(user.id)
      .then((g) => !cancelled && setGreeks(g))
      .catch(() => !cancelled && setGreeks(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading options portfolio…
      </Card>
    );
  }

  if (!greeks || greeks.positions === 0) return null;

  const biasColor =
    greeks.bias === "Bullish"
      ? "text-emerald-400"
      : greeks.bias === "Bearish"
        ? "text-rose-400"
        : "text-muted-foreground";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Open Options Portfolio</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {greeks.positions} position{greeks.positions === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <GreekStat label="Δ Delta" value={greeks.netDelta.toFixed(2)} subtitle={greeks.bias} subtitleClass={biasColor} />
        <GreekStat label="Γ Gamma" value={greeks.netGamma.toFixed(3)} />
        <GreekStat
          label="Θ Theta"
          value={`${fmt$(greeks.netTheta)}/d`}
          subtitleClass={greeks.netTheta < 0 ? "text-rose-400" : "text-emerald-400"}
          subtitle="time decay"
        />
        <GreekStat
          label="V Vega"
          value={fmt$(greeks.netVega)}
          subtitle="per 1% IV"
        />
      </div>

      {greeks.warnings.length > 0 && (
        <div className="space-y-1.5">
          {greeks.warnings.map((w, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2 items-start text-xs rounded-md border p-2",
                "border-amber-500/40 bg-amber-500/10 text-amber-300",
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GreekStat({
  label,
  value,
  subtitle,
  subtitleClass,
}: {
  label: string;
  value: string;
  subtitle?: string;
  subtitleClass?: string;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-sm mt-0.5">{value}</div>
      {subtitle && <div className={cn("text-[10px] mt-0.5", subtitleClass)}>{subtitle}</div>}
    </div>
  );
}