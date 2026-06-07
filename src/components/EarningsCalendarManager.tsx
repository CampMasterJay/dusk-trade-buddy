import { useCallback, useEffect, useState } from "react";
import { Calendar, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { fetchEarningsEvents, daysUntil, type EarningsEvent } from "@/lib/earnings";

export function EarningsCalendarManager() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EarningsEvent[] | null>(null);
  const [ticker, setTicker] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setEvents(await fetchEarningsEvents(user.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!user) return;
    if (!ticker.trim() || !date) {
      toast.error("Ticker and date required.");
      return;
    }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("earnings_events").insert({
        user_id: user.id,
        ticker: ticker.trim().toUpperCase(),
        earnings_date: date,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success(`Added ${ticker.toUpperCase()} earnings`);
      setTicker("");
      setDate("");
      setNotes("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("earnings_events").delete().eq("id", id);
      if (error) throw error;
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const upcoming = (events ?? []).filter((e) => daysUntil(e.earnings_date) >= 0);

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        <h3 className="text-xs uppercase tracking-wider font-data text-muted-foreground">
          Earnings calendar
        </h3>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          {upcoming.length} upcoming
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ticker
          </Label>
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="AAPL"
            className="font-mono h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Date
          </Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Notes (BMO/AMC)
          </Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="After close"
            className="h-8 text-sm"
          />
        </div>
        <Button onClick={add} disabled={saving} size="sm" className="h-8">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No upcoming earnings. Add the next reporting dates for tickers you trade.
        </p>
      ) : (
        <ul className="space-y-1">
          {upcoming.slice(0, 20).map((ev) => {
            const d = daysUntil(ev.earnings_date);
            const urgent = d <= 5;
            return (
              <li
                key={ev.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
                  urgent
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border bg-muted/20",
                )}
              >
                <span className="font-mono font-semibold">{ev.ticker}</span>
                <span className="text-muted-foreground font-mono">{ev.earnings_date}</span>
                <span
                  className={cn(
                    "font-mono text-[10px] px-1.5 py-0.5 rounded border",
                    urgent
                      ? "border-amber-500/50 text-amber-300 bg-amber-500/10"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {d === 0 ? "TODAY" : `${d}d`}
                </span>
                {ev.notes && (
                  <span className="text-muted-foreground truncate">{ev.notes}</span>
                )}
                <button
                  type="button"
                  onClick={() => remove(ev.id)}
                  className="ml-auto text-muted-foreground hover:text-rose-400"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}