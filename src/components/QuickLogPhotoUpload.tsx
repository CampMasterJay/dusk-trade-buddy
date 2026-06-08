import { useRef, useState } from "react";
import { Camera, Loader2, Sparkles, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { processImageFile, validateImageFile } from "@/lib/imageUpload";
import { extractTradeFromPhoto } from "@/lib/api/extractTradePhoto.functions";

type ExtractedFields = Record<string, string | number | boolean | null>;

interface Props {
  mode: "futures" | "options";
  onExtracted: (fields: ExtractedFields) => void;
}

/**
 * Drop-in photo-to-fields widget for Quick Log. The user picks a screenshot
 * of their broker fill / P&L, AI reads it, and we hand the parsed fields
 * back to the parent form to prefill.
 */
export function QuickLogPhotoUpload({ mode, onExtracted }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const extract = useServerFn(extractTradeFromPhoto);

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
      const filled = Object.values(res.fields).filter((v) => v != null).length;
      if (filled === 0) {
        toast.warning("Couldn't read any fields. Try a clearer screenshot.");
        return;
      }
      onExtracted(res.fields);
      toast.success(`Prefilled ${filled} field${filled === 1 ? "" : "s"} from photo`);
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
        ref={fileRef}
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
      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="font-data text-xs"
        >
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="mr-1 h-3.5 w-3.5" />
          )}
          {busy ? "Reading…" : preview ? "Replace photo" : "Upload photo"}
        </Button>
        {preview && !busy && (
          <img
            src={preview}
            alt="trade screenshot"
            className="h-10 w-10 rounded border border-border object-cover"
          />
        )}
      </div>
    </div>
  );
}