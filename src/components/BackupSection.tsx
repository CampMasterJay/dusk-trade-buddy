import { useRef, useState } from "react";
import { Download, Upload, Loader2, AlertTriangle, Database } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  buildBackup,
  downloadOrShareBackup,
  parseBackup,
  countBackup,
  getExistingCounts,
  importBackup,
  type BackupPayload,
  type BackupCounts,
} from "@/lib/backup";

function CountList({ counts }: { counts: BackupCounts }) {
  const items = [
    ["Trades", counts.trades],
    ["Journals", counts.journals],
    ["Setup plans", counts.setupPlans],
    ["Chart analyses", counts.chartAnalyses],
    ["Game plans", counts.gamePlans],
  ] as const;
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-data">
      {items.map(([label, n]) => (
        <li key={label} className="flex justify-between border-b border-border/30 py-1">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums">{n}</span>
        </li>
      ))}
    </ul>
  );
}

export function BackupSection() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pending, setPending] = useState<{
    payload: BackupPayload;
    incoming: BackupCounts;
    existing: BackupCounts;
  } | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = await buildBackup();
      await downloadOrShareBackup(payload);
      toast.success("Backup ready.");
    } catch (e) {
      toast.error((e as Error).message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReading(true);
    try {
      const text = await file.text();
      const payload = parseBackup(text);
      const [existing] = await Promise.all([getExistingCounts()]);
      setPending({ payload, incoming: countBackup(payload), existing });
    } catch (err) {
      toast.error((err as Error).message || "Could not read backup");
    } finally {
      setReading(false);
    }
  };

  const runImport = async (mode: "merge" | "replace") => {
    if (!pending) return;
    setImporting(true);
    try {
      const counts = await importBackup(pending.payload, mode);
      const total =
        counts.trades + counts.journals + counts.setupPlans + counts.chartAnalyses + counts.gamePlans;
      toast.success(`Imported ${total} record${total === 1 ? "" : "s"}.`);
      setPending(null);
    } catch (err) {
      toast.error((err as Error).message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const existingTotal = pending
    ? pending.existing.trades +
      pending.existing.journals +
      pending.existing.setupPlans +
      pending.existing.chartAnalyses +
      pending.existing.gamePlans
    : 0;

  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary">
          <Database className="size-5" />
        </span>
        <h2 className="text-lg font-semibold font-heading">Backup & Restore</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Download a full JSON snapshot of your account, or restore from a previous backup.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleExport}
          disabled={exporting}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-40",
          )}
          aria-label="Export my data"
        >
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Export My Data
        </button>
        <button
          onClick={handlePick}
          disabled={reading || importing}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-sm font-semibold disabled:opacity-40"
          aria-label="Import backup"
        >
          {reading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Import Backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Includes settings, trades, journals, watched setups, chart analyses, and game plans.
      </p>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold font-heading mb-1">Import backup</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Exported {new Date(pending.payload.exportedAt).toLocaleString()}
            </p>

            <div className="mb-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1">To import</div>
              <CountList counts={pending.incoming} />
            </div>
            <div className="mb-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1">Currently in your account</div>
              <CountList counts={pending.existing} />
            </div>

            {existingTotal > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <div>
                  You already have <span className="font-data font-semibold">{existingTotal}</span> records.
                  <strong className="block mt-1 font-semibold">Merge</strong> keeps existing rows and overwrites
                  any with matching IDs. <strong className="block mt-1 font-semibold">Replace</strong> deletes
                  ALL current data before importing. This cannot be undone.
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setPending(null)}
                disabled={importing}
                className="flex-1 rounded-md border border-border px-3 py-2 text-xs font-semibold disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => runImport("merge")}
                disabled={importing}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-40"
              >
                {importing && <Loader2 className="size-3 animate-spin" />}
                Merge import
              </button>
              {existingTotal > 0 && (
                <button
                  onClick={() => runImport("replace")}
                  disabled={importing}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-trade-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {importing && <Loader2 className="size-3 animate-spin" />}
                  Replace all
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}