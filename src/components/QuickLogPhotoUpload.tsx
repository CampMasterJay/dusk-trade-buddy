import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { processImageFile, validateImageFile } from "@/lib/imageUpload";
import { extractTradeFromPhoto } from "@/lib/api/extractTradePhoto.functions";
import { calcFuturesPnl, calcOptionsPnl } from "@/lib/pnlCalc";

type ExtractedFields = Record<string, string | number | boolean | null>;

interface Props {
  mode: "futures" | "options";
  onExtracted: (fields: ExtractedFields) => void;
}

function summarize(mode: "futures" | "options", t: ExtractedFields, i: number): string {
  if (mode === "options") {
    const u = t.underlying ? String(t.underlying).toUpperCase() : "?";
    const act = t.leg1_action ? String(t.leg1_action) : "";
    const k = t.leg1_strike != null ? String(t.leg1_strike) : "";
    const ty = t.leg1_type ? String(t.leg1_type)[0] : "";
    const exp = t.leg1_expiration ? ` ${t.leg1_expiration}` : "";
    const qty = t.leg1_contracts != null ? ` ×${t.leg1_contracts}` : "";
    const core = `${u} ${act} ${k}${ty}${exp}${qty}`.replace(/\s+/g, " ").trim();
    return core || `Trade ${i + 1}`;
  }
  const sym = t.instrument ? String(t.instrument).toUpperCase() : "?";
  const dir = t.direction ? String(t.direction) : "";
  const e = t.entry != null ? ` @${t.entry}` : "";
  const core = `${sym} ${dir}${e}`.replace(/\s+/g, " ").trim();
  return core || `Trade ${i + 1}`;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtUSD(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function tradePnl(
  mode: "futures" | "options",
  t: ExtractedFields,
): { value: number; predicted: boolean } | null {
  if (mode === "options") {
    const realized = num(t.net_pnl);
    if (realized != null) return { value: realized, predicted: false };
    const entry = num(t.leg1_premium);
    const exit = num(t.exit_premium);
    const contracts = num(t.leg1_contracts) ?? 1;
    const action = t.leg1_action === "Buy" || t.leg1_action === "Sell" ? t.leg1_action : null;
    if (entry != null && exit != null && action) {
      const v = calcOptionsPnl({ action, entryPremium: entry, exitPremium: exit, contracts });
      if (v != null) return { value: v, predicted: true };
    }
    return null;
  }
  const realized = num(t.pnl);
  if (realized != null) return { value: realized, predicted: false };
  const entry = num(t.entry);
  const exit = num(t.exit);
  const dir = t.direction === "Long" || t.direction === "Short" ? t.direction : null;
  const sym = t.instrument ? String(t.instrument) : "";
  if (entry != null && exit != null && dir && sym) {
    const v = calcFuturesPnl({ symbol: sym, direction: dir, entry, exit, contracts: num(t.contracts) ?? 1 });
    if (v != null) return { value: v, predicted: true };
  }
  return null;
}

/**
 * Drop-in photo-to-fields widget for Quick Log. The user picks a screenshot
 * of their broker fill / P&L, AI reads it, and we hand the parsed fields
 * back to the parent form to prefill.
 */
export function QuickLogPhotoUpload({ mode, onExtracted }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<ExtractedFields[] | null>(null);
  const extract = useServerFn(extractTradeFromPhoto);

  const apply = (fields: ExtractedFields) => {
    const filled = Object.values(fields).filter((v) => v != null && v !== "").length;
    if (filled === 0) {
      toast.warning("Couldn't read any fields. Try a clearer screenshot.");
      return;
    }
    onExtracted(fields);
    toast.success(`Prefilled ${filled} field${filled === 1 ? "" : "s"} from photo`);
  };

  const handleFile = async (file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const img = await processImageFile(file);
      setPreview(img.dataUrl);
      const res = await extract({ data: { imageDataUrl: img.dataUrl, mode } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.trades.length > 1) {
        setChoices(res.trades);
        toast.message(`Found ${res.trades.length} trades — pick one to log`);
        return;
      }
      apply(res.trades[0]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-border bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-data uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-trade-amber" />
          Auto-fill from photo
        </div>
        {preview && (
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear photo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Snap your broker fill or P&L — AI extracts the fields.
      </p>
      <input
        ref={cameraRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="font-data text-xs"
        >
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="mr-1 h-3.5 w-3.5" />
          )}
          {busy ? "Reading…" : "Take photo"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => galleryRef.current?.click()}
          disabled={busy}
          className="font-data text-xs"
        >
          <ImagePlus className="mr-1 h-3.5 w-3.5" />
          Upload from device
        </Button>
        {preview && !busy && (
          <img
            src={preview}
            alt="trade screenshot"
            className="h-10 w-10 rounded border border-border object-cover"
          />
        )}
      </div>
      <Dialog open={!!choices} onOpenChange={(o) => !o && setChoices(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Multiple trades detected</DialogTitle>
            <DialogDescription>
              Pick which trade to log. Only one trade is logged per Quick Log entry.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {choices?.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  apply(t);
                  setChoices(null);
                }}
                className="w-full rounded-md border border-border bg-background/60 p-3 text-left text-sm hover:border-trade-amber hover:bg-background/80"
              >
                {(() => {
                  const pnl = tradePnl(mode, t);
                  return (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-data uppercase tracking-wider text-trade-amber text-[11px]">
                          Trade {i + 1}
                        </div>
                        {pnl && (
                          <div
                            className={`font-data text-xs tabular-nums ${
                              pnl.value >= 0 ? "text-trade-green" : "text-trade-red"
                            }`}
                          >
                            {pnl.predicted && (
                              <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                                est
                              </span>
                            )}
                            {fmtUSD(pnl.value)}
                          </div>
                        )}
                      </div>
                      <div className="mt-0.5 truncate">{summarize(mode, t, i)}</div>
                    </>
                  );
                })()}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setChoices(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}