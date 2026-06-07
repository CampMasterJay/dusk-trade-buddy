import { useEffect, useMemo, useState } from "react";
import { Zap, AlertTriangle, Clock, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  aggregateZeroDte,
  fetchZeroDteTrades,
  formatCountdown,
  minutesUntilMarketClose,
  positionSizePct,
  urgencyFromMinutes,
  type ZeroDteRow,
} from "@/lib/zeroDte";

const TONE_BG: Record<string, string> = {
  green: "bg-trade-green/10 border-trade-green/40 text-trade-green",
  amber: "bg-amber-500/10 border-amber-500/40 text-amber-400",
  red: "bg-trade-red/10 border-trade-red/40 text-trade-red",
  muted: "bg-muted/30 border-border text-muted-foreground",
};

export function ZeroDteModule() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("zeroDteMode") === "1";
  });
  const [rows, setRows] = useState<ZeroDteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    localStorage.setItem("zeroDteMode", enabled ? "1" : "0");
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setRows(await fetchZeroDteTrades());
    } catch (e) {
      toast.error("Failed to load 0DTE trades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id]);

  const minsLeft = useMemo(() => minutesUntilMarketClose(new Date(now)), [now]);
  const urgency = useMemo(() => urgencyFromMinutes(minsLeft), [minsLeft]);
  const accountBalance = Number(settings?.current_balance ?? 100);

  const openToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter((r) => r.status === "Open" && r.trade_date === today);
  }, [rows]);

  const stats = useMemo(() => aggregateZeroDte(rows), [rows]);

  // Mandatory exit lock: open 0DTE positions with <=15 min to close
  const mustExit = minsLeft > 0 && minsLeft <= 15 && openToday.length > 0;

  const closeAll = async () => {
    if (!openToday.length) return;
    if (
      !confirm(
        `Close ${openToday.length} 0DTE position(s)? They will be marked Closed with $0 net P&L unless you edit later.`,
      )
    )
      return;
    const { error } = await supabase
      .from("options_trades")
      .update({
        status: "Closed",
        actual_exit_reason: "0DTE forced close",
        net_pnl: 0,
      })
      .in(
        "id",
        openToday.map((r) => r.id),
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Closed all open 0DTE positions");
    reload();
  };

  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <div>
            <div className="text-sm font-semibold">0DTE Mode</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-data">
              Zero days to expiration framework
            </div>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="mt-3 space-y-3">
          {/* Primer */}
          <div className="text-[11px] text-muted-foreground space-y-1 border-l-2 border-amber-500/40 pl-2">
            <p>• Gamma at max — moves are amplified</p>
            <p>• Theta decays to zero by 4 PM ET same day</p>
            <p>• All value goes to zero at expiration</p>
            <p>• High risk, high reward — size very small</p>
          </div>

          {/* Countdown */}
          <div
            className={cn(
              "border rounded-md p-3 flex items-center justify-between",
              TONE_BG[urgency.tone],
              urgency.pulse && "animate-pulse",
            )}
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <div>
                <div className="text-[10px] uppercase tracking-wider font-data opacity-80">
                  {urgency.label}
                </div>
                <div className="text-xs">{urgency.message}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold font-data tabular-nums">
                {formatCountdown(minsLeft)}
              </div>
              <div className="text-[10px] uppercase tracking-wider opacity-80">
                to 4 PM ET
              </div>
            </div>
          </div>

          {/* Mandatory exit lock */}
          {mustExit && (
            <div className="border-2 border-trade-red rounded-md p-3 bg-trade-red/10 animate-pulse">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="h-4 w-4 text-trade-red" />
                <div className="text-sm font-bold text-trade-red">
                  0DTE POSITIONS EXPIRE IN {Math.ceil(minsLeft)} MIN
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Close now or accept full loss on{" "}
                <span className="text-foreground font-semibold">
                  {openToday.reduce((s, r) => s + (r.leg1_contracts || 0), 0)}
                </span>{" "}
                contracts across {openToday.length} position(s).
              </p>
              <Button
                variant="destructive"
                className="w-full"
                onClick={closeAll}
              >
                <X className="h-4 w-4 mr-2" />
                CLOSE ALL 0DTE
              </Button>
            </div>
          )}

          {/* Open positions w/ sizing warnings */}
          {openToday.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-data text-muted-foreground mb-1">
                Open 0DTE Today ({openToday.length})
              </div>
              <div className="space-y-1">
                {openToday.map((r) => {
                  const pct = positionSizePct(r, accountBalance);
                  const high = pct > 3;
                  const ok = pct <= 2;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between border border-border rounded-md p-2"
                    >
                      <div>
                        <div className="text-xs font-semibold">
                          {r.underlying}{" "}
                          <span className="text-muted-foreground font-normal">
                            · {r.strategy_type ?? "0DTE"} · {r.leg1_contracts}x
                          </span>
                        </div>
                        {high && (
                          <div className="text-[10px] text-trade-red flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="h-3 w-3" /> HIGH 0DTE RISK
                            — expires worthless 100% at close.
                          </div>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-data tabular-nums",
                          high && "border-trade-red text-trade-red",
                          !high && !ok && "border-amber-500 text-amber-400",
                          ok && "border-trade-green text-trade-green",
                        )}
                      >
                        {pct.toFixed(2)}%
                      </Badge>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Target ≤ 2% of account per 0DTE trade.
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="0DTE Trades" value={String(stats.total)} />
            <Stat
              label="Win rate"
              value={`${stats.winRate.toFixed(0)}%`}
              tone={
                stats.total >= 5
                  ? stats.winRate >= 50
                    ? "green"
                    : "red"
                  : "muted"
              }
            />
            <Stat
              label="Avg hold"
              value={
                stats.avgHoldMinutes >= 60
                  ? `${(stats.avgHoldMinutes / 60).toFixed(1)}h`
                  : `${Math.round(stats.avgHoldMinutes)}m`
              }
            />
            <Stat
              label="Total P&L"
              value={`${stats.totalPnl >= 0 ? "+" : ""}$${stats.totalPnl.toFixed(0)}`}
              tone={stats.totalPnl >= 0 ? "green" : "red"}
            />
          </div>

          {stats.verdict && (
            <div
              className={cn(
                "border rounded-md p-2 text-xs",
                TONE_BG[stats.verdictTone],
              )}
            >
              <div className="text-[10px] uppercase tracking-wider font-data opacity-80 mb-0.5">
                0DTE Verdict ({stats.total} trades)
              </div>
              {stats.verdict}
            </div>
          )}

          {loading && (
            <div className="text-[10px] text-muted-foreground">Loading…</div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "amber" | "muted";
}) {
  const toneCls =
    tone === "green"
      ? "text-trade-green"
      : tone === "red"
        ? "text-trade-red"
        : tone === "amber"
          ? "text-amber-400"
          : "text-foreground";
  return (
    <div className="border border-border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wider font-data text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-base font-bold font-data tabular-nums", toneCls)}>
        {value}
      </div>
    </div>
  );
}