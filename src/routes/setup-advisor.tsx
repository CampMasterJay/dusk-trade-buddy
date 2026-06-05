import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Plus,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  CircleDot,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Activity,
} from "lucide-react";
import {
  addSetup,
  removeSetup,
  updateSetup,
  useSetups,
  type SetupStatus,
  type WatchedSetup,
} from "@/lib/setupWatchlistStore";
import { toast } from "sonner";
import { useUserSettings } from "@/hooks/useUserSettings";

export const Route = createFileRoute("/setup-advisor")({
  component: SetupAdvisorPage,
});

const SETUP_TYPES = [
  "Breakout",
  "Pullback",
  "Reversal",
  "Range Break",
  "Liquidity Sweep",
  "Trend Continuation",
  "Failed Breakout",
  "Opening Range",
];

const STATUSES: { key: SetupStatus; label: string; color: string; icon: typeof CircleDot }[] = [
  { key: "watching", label: "Watching", color: "text-blue-400 border-blue-500/40 bg-blue-500/10", icon: CircleDot },
  { key: "triggered", label: "Triggered", color: "text-trade-green border-trade-green/40 bg-trade-green/10", icon: CheckCircle2 },
  { key: "missed", label: "Missed", color: "text-amber-400 border-amber-500/40 bg-amber-500/10", icon: AlertTriangle },
  { key: "invalidated", label: "Invalidated", color: "text-trade-red border-trade-red/40 bg-trade-red/10", icon: XCircle },
];

function SetupAdvisorPage() {
  return (
    <ProtectedRoute>
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-28 pt-4">
        <SessionStatusCard />
        <SetupWatchlistSection />
      </main>
    </ProtectedRoute>
  );
}

/* -------------------- Session status -------------------- */

function useNyClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function nyParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
  };
}

function SessionStatusCard() {
  const now = useNyClock();
  const { weekday, hour, minute } = nyParts(now);
  const minutesOfDay = hour * 60 + minute;
  const openMin = 9 * 60 + 30; // 9:30
  const closeMin = 16 * 60; // 16:00
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const isOpen = isWeekday && minutesOfDay >= openMin && minutesOfDay < closeMin;

  let label = "Closed";
  let detail = "";
  if (isOpen) {
    const elapsed = minutesOfDay - openMin;
    const remaining = closeMin - minutesOfDay;
    label = "NY Open — Active";
    detail = `${Math.floor(elapsed / 60)}h ${elapsed % 60}m in · ${Math.floor(remaining / 60)}h ${remaining % 60}m left`;
  } else if (isWeekday && minutesOfDay < openMin) {
    const wait = openMin - minutesOfDay;
    label = "Pre-market";
    detail = `Opens in ${Math.floor(wait / 60)}h ${wait % 60}m`;
  } else if (isWeekday && minutesOfDay >= closeMin) {
    label = "After-hours";
    detail = "Cash session closed";
  } else {
    label = "Weekend";
    detail = "Markets closed";
  }

  const [bias, setBias] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("setup-advisor:bias") ?? "" : "",
  );
  const [vix, setVix] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("setup-advisor:vix") ?? "" : "",
  );
  useEffect(() => {
    localStorage.setItem("setup-advisor:bias", bias);
  }, [bias]);
  useEffect(() => {
    localStorage.setItem("setup-advisor:vix", vix);
  }, [vix]);

  const vixNum = parseFloat(vix);
  const vixColor =
    Number.isFinite(vixNum) && vixNum < 15
      ? "text-trade-green"
      : Number.isFinite(vixNum) && vixNum <= 25
        ? "text-amber-400"
        : Number.isFinite(vixNum)
          ? "text-trade-red"
          : "text-muted-foreground";

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
        <Activity className="h-3 w-3" />
        Session Status
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className={cn("text-xl font-heading font-semibold", isOpen ? "text-trade-green" : "text-foreground")}>
            {label}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {detail}
          </div>
        </div>
        <div className="text-right">
          <div className="font-data text-xl tabular-nums text-foreground">
            {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
          </div>
          <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">NY Time</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="bias" className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            Pre-market bias
          </Label>
          <Input
            id="bias"
            value={bias}
            onChange={(e) => setBias(e.target.value)}
            placeholder="e.g. Long ES above 5200"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="vix" className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
            VIX level (optional)
          </Label>
          <Input
            id="vix"
            value={vix}
            inputMode="decimal"
            onChange={(e) => setVix(e.target.value)}
            placeholder="e.g. 17.4"
            className={cn("mt-1 font-data", vixColor)}
          />
        </div>
      </div>
    </section>
  );
}

/* -------------------- Watchlist section -------------------- */

function SetupWatchlistSection() {
  const setups = useSetups();
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const order: SetupStatus[] = ["watching", "triggered", "missed", "invalidated"];
    return order
      .map((status) => ({ status, items: setups.filter((s) => s.status === status) }))
      .filter((g) => g.items.length > 0);
  }, [setups]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
          <Target className="h-3 w-3" />
          Setup Watchlist
        </div>
        <span className="text-[10px] font-data text-muted-foreground">{setups.length} total</span>
      </div>

      {setups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Target className="mx-auto mb-2 size-6 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No setups stalking yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pre-define setups you're watching today so you don't chase entries in the heat of the moment.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ status, items }) => (
            <div key={status}>
              <div className="mb-2 text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
                {STATUSES.find((s) => s.key === status)?.label} · {items.length}
              </div>
              <div className="space-y-2">
                {items.map((s) => (
                  <SetupCard key={s.id} setup={s} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button className="mt-4 w-full" size="lg">
            <Plus className="h-4 w-4" />
            Add Setup to Watch
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New setup to stalk</SheetTitle>
          </SheetHeader>
          <AddSetupForm
            onDone={() => {
              setOpen(false);
              toast.success("Setup added to watchlist");
            }}
          />
        </SheetContent>
      </Sheet>
    </section>
  );
}

function SetupCard({ setup }: { setup: WatchedSetup }) {
  const meta = STATUSES.find((s) => s.key === setup.status)!;
  const Icon = meta.icon;
  const DirIcon = setup.direction === "long" ? TrendingUp : TrendingDown;
  const dirColor = setup.direction === "long" ? "text-trade-green" : "text-trade-red";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <DirIcon className={cn("h-4 w-4 shrink-0", dirColor)} />
            <span className="font-data text-sm font-semibold text-foreground">{setup.instrument}</span>
            <span className="truncate text-sm text-muted-foreground">· {setup.setupType}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="font-data tabular-nums text-foreground">{setup.level}</span>
          </div>
          {setup.notes ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{setup.notes}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => removeSetup(setup.id)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-trade-red"
          aria-label="Remove setup"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-data uppercase tracking-wider",
            meta.color,
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          {STATUSES.filter((s) => s.key !== setup.status).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => updateSetup(setup.id, { status: s.key })}
              className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-data uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddSetupForm({ onDone }: { onDone: () => void }) {
  const { settings } = useUserSettings();
  const watchlist = (settings?.watchlist ?? []) as string[];
  const [setupType, setSetupType] = useState(SETUP_TYPES[0]);
  const [instrument, setInstrument] = useState(watchlist[0] ?? "");
  const [level, setLevel] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!instrument.trim() || !level.trim()) {
      toast.error("Instrument and level are required");
      return;
    }
    addSetup({
      setupType,
      instrument: instrument.trim().toUpperCase(),
      level: level.trim(),
      direction,
      notes: notes.trim() || undefined,
    });
    onDone();
  };

  return (
    <div className="mt-4 space-y-4 pb-6">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Setup type</Label>
          <Select value={setupType} onValueChange={setSetupType}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SETUP_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Direction</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as "long" | "short")}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Instrument</Label>
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
          placeholder="ES, NQ, AAPL…"
          className="mt-2 font-data uppercase"
        />
      </div>

      <div>
        <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Level to watch</Label>
        <Input
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          placeholder="e.g. 5210.50 break-and-hold"
          className="mt-1 font-data"
        />
      </div>

      <div>
        <Label className="text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Confluence, invalidation, trigger details…"
          className="mt-1"
          rows={3}
        />
      </div>

      <Button onClick={submit} className="w-full" size="lg">
        Add to watchlist
      </Button>
    </div>
  );
}