import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const WATCHLIST_MAX = 10;

export function normalizeTicker(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9./\-]/g, "")
    .slice(0, 12);
}

export function WatchlistManager({
  tickers,
  onChange,
  saving,
}: {
  tickers: string[];
  onChange: (next: string[]) => Promise<void> | void;
  saving?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  const add = async () => {
    const next = normalizeTicker(value);
    if (!next) return;
    if (tickers.includes(next)) {
      toast.info(`${next} is already in your watchlist`);
      setValue("");
      return;
    }
    if (tickers.length >= WATCHLIST_MAX) {
      toast.error(`Watchlist limit is ${WATCHLIST_MAX} tickers`);
      return;
    }
    await onChange([...tickers, next]);
    setValue("");
    setAdding(false);
  };

  const remove = async (t: string) => {
    await onChange(tickers.filter((x) => x !== t));
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Watchlist · {tickers.length}/{WATCHLIST_MAX}
        </div>
        {saving ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Saving
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {tickers.map((t) => (
          <TickerChip key={t} ticker={t} onRemove={() => void remove(t)} />
        ))}
        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1"
          >
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => {
                if (!value.trim()) setAdding(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setValue("");
                  setAdding(false);
                }
              }}
              placeholder="TICKER"
              maxLength={12}
              className="w-20 bg-transparent text-xs font-data font-semibold uppercase tracking-wider placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <button
              type="submit"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled={tickers.length >= WATCHLIST_MAX}
            onClick={() => setAdding(true)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              tickers.length >= WATCHLIST_MAX && "opacity-50 cursor-not-allowed hover:text-muted-foreground",
            )}
          >
            <Plus className="size-3" />
            Add ticker
          </button>
        )}
      </div>
      {tickers.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Tap × on a chip to remove (swipe also works on mobile).
        </p>
      ) : null}
    </div>
  );
}

function TickerChip({ ticker, onRemove }: { ticker: string; onRemove: () => void }) {
  // Touch swipe-to-remove: drag a chip > 60px to the left to remove it.
  const [dx, setDx] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setDx(0);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX === null) return;
    const delta = e.touches[0].clientX - startX;
    if (delta < 0) setDx(Math.max(delta, -90));
  };
  const onTouchEnd = () => {
    if (dx < -60) {
      onRemove();
    }
    setDx(0);
    setStartX(null);
  };

  return (
    <span
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ transform: `translateX(${dx}px)` }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold font-data text-primary transition-transform",
        dx < -40 && "border-trade-red/50 bg-trade-red/10 text-trade-red",
      )}
    >
      {ticker}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${ticker}`}
        className="ml-0.5 -mr-0.5 inline-flex size-4 items-center justify-center rounded hover:bg-foreground/10"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}