import { useEffect, useState } from "react";
import { Bell, BellOff, Trash2, TrendingUp, TrendingDown, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  createAlert,
  deleteAlert,
  listAlerts,
  MAX_ACTIVE_ALERTS,
  type PriceAlert,
} from "@/lib/priceAlerts";
import { useUserSettings } from "@/hooks/useUserSettings";

export function PriceAlertsPanel() {
  const { settings } = useUserSettings();
  const watchlist = (settings?.watchlist ?? []) as string[];
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const [instrument, setInstrument] = useState(watchlist[0] ?? "");
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  const refresh = async () => {
    try {
      const all = await listAlerts();
      setAlerts(all);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("edge:price-alerts-changed", onChange);
    return () => window.removeEventListener("edge:price-alerts-changed", onChange);
  }, []);

  useEffect(() => {
    if (!instrument && watchlist[0]) setInstrument(watchlist[0]);
  }, [watchlist, instrument]);

  const active = alerts.filter((a) => a.active);
  const history = alerts.filter((a) => !a.active);

  const submit = async () => {
    const p = parseFloat(price);
    if (!instrument.trim() || !Number.isFinite(p)) {
      toast.error("Instrument and price are required");
      return;
    }
    if (active.length >= MAX_ACTIVE_ALERTS) {
      toast.error(`Max ${MAX_ACTIVE_ALERTS} active alerts reached`);
      return;
    }
    try {
      await createAlert({ instrument, price: p, direction });
      setPrice("");
      toast.success(`Alert set: ${instrument.toUpperCase()} ${direction} ${p}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create alert");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAlert(id);
    } catch {
      toast.error("Could not delete alert");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
          <Bell className="h-3 w-3" />
          Price Alerts
        </div>
        <span className="text-[10px] font-data text-muted-foreground">
          {active.length}/{MAX_ACTIVE_ALERTS} active
        </span>
      </div>

      {/* Form */}
      <div className="space-y-3">
        <div>
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            Instrument
          </Label>
          {watchlist.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {watchlist.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setInstrument(t)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-data uppercase tracking-wider",
                    instrument.toUpperCase() === t.toUpperCase()
                      ? "border-trade-green bg-trade-green/10 text-trade-green"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}
          <Input
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            placeholder="AAPL, SPY…"
            className="mt-2 font-data uppercase"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
              When price is
            </Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "above" | "below")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="above">Above</SelectItem>
                <SelectItem value="below">Below</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
              Price
            </Label>
            <Input
              value={price}
              inputMode="decimal"
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 215.50"
              className="mt-1 font-data"
            />
          </div>
        </div>

        <Button onClick={submit} className="w-full" size="sm" disabled={active.length >= MAX_ACTIVE_ALERTS}>
          <Bell className="h-4 w-4" />
          Alert me
        </Button>
      </div>

      {/* Active list */}
      <div className="mt-4">
        <div className="mb-2 text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
          Active alerts
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : active.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active alerts.</p>
        ) : (
          <div className="space-y-1.5">
            {active.map((a) => (
              <AlertRow key={a.id} alert={a} onDelete={() => remove(a.id)} />
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className="flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[2px] text-muted-foreground hover:text-foreground"
        >
          <History className="h-3 w-3" />
          History ({history.length})
        </button>
        {showHistory && (
          <div className="mt-2 space-y-1.5">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No past alerts.</p>
            ) : (
              history.map((a) => <AlertRow key={a.id} alert={a} onDelete={() => remove(a.id)} historic />)
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Alerts poll every 30s using your Alpaca keys (Settings → Alpaca). Notifications require browser permission.
      </p>
    </section>
  );
}

function AlertRow({
  alert,
  onDelete,
  historic,
}: {
  alert: PriceAlert;
  onDelete: () => void;
  historic?: boolean;
}) {
  const DirIcon = alert.direction === "above" ? TrendingUp : TrendingDown;
  const dirColor = alert.direction === "above" ? "text-trade-green" : "text-trade-red";
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border border-border bg-background px-3 py-2",
        historic && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        {historic ? (
          <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <DirIcon className={cn("h-3.5 w-3.5", dirColor)} />
        )}
        <div>
          <div className="font-data text-sm tabular-nums">
            <span className="uppercase">{alert.instrument}</span>{" "}
            <span className="text-muted-foreground">{alert.direction}</span>{" "}
            <span className={dirColor}>{Number(alert.price)}</span>
          </div>
          {alert.triggered_at ? (
            <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              Triggered {new Date(alert.triggered_at).toLocaleString()}
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-trade-red"
        aria-label="Delete alert"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}