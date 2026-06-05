import { useEffect, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { NewTradeSheet } from "@/components/NewTradeSheet";
import { deleteTrade, type Trade } from "@/lib/tradeService";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JournalTab } from "@/components/JournalTab";

interface Props {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);

function formatDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export function TradeDetailSheet({
  trade,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [chartUrl, setChartUrl] = useState<string | null>(null);
  const [, force] = useState(0);

  // Tick "edited X ago" every minute while open
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => force((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, [open]);

  // Signed URL for chart screenshot
  useEffect(() => {
    let active = true;
    setChartUrl(null);
    if (!trade?.chart_url) return;
    supabase.storage
      .from("trade-charts")
      .createSignedUrl(trade.chart_url, 3600)
      .then(({ data }) => {
        if (active) setChartUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [trade?.chart_url]);

  if (!trade) return null;

  const pnl = Number(trade.pnl ?? 0);
  const r = trade.r_multiple == null ? null : Number(trade.r_multiple);
  const stopDist = Math.abs(Number(trade.entry) - Number(trade.stop));
  const rrRatio =
    stopDist > 0
      ? Math.abs(Number(trade.target) - Number(trade.entry)) / stopDist
      : null;

  const dirColor =
    trade.direction === "Long"
      ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
      : "bg-amber-500/15 text-amber-400 border-amber-500/40";
  const resultColor =
    trade.result === "Win"
      ? "bg-trade-green/15 text-trade-green border-trade-green/40"
      : trade.result === "Loss"
        ? "bg-trade-red/15 text-trade-red border-trade-red/40"
        : "bg-muted text-muted-foreground border-border";
  const pnlColor =
    pnl > 0 ? "text-trade-green" : pnl < 0 ? "text-trade-red" : "text-muted-foreground";

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await deleteTrade(trade.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Trade deleted");
    onOpenChange(false);
    onChanged();
  };

  return (
    <>
      <Sheet open={open && !editOpen} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto pb-8"
        >
          <SheetHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div className="text-left">
              <SheetTitle className="font-heading">Trade Details</SheetTitle>
              <p className="text-[11px] text-muted-foreground font-data mt-1">
                Last edited {timeAgo(trade.updated_at)}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditOpen(true)}
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete"
                className="text-trade-red hover:text-trade-red"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          <Tabs defaultValue="details" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="journal">Journal</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-4 space-y-5">
            {/* Summary card */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-xs font-data text-muted-foreground">
                  {formatDate(trade.date)}
                </span>
                <span className="font-data font-semibold text-sm">
                  {trade.instrument}
                </span>
                <Badge className={dirColor}>{trade.direction}</Badge>
                <Badge className={resultColor}>{trade.result}</Badge>
              </div>
              <div className="flex items-baseline gap-4">
                <span className={cn("font-data font-bold text-2xl", pnlColor)}>
                  {pnl >= 0 ? "+" : ""}
                  {fmtMoney(pnl)}
                </span>
                {r != null && (
                  <span
                    className={cn(
                      "text-sm font-data",
                      r > 0
                        ? "text-trade-green"
                        : r < 0
                          ? "text-trade-red"
                          : "text-muted-foreground",
                    )}
                  >
                    {r > 0 ? "+" : ""}
                    {r.toFixed(2)}R
                  </span>
                )}
              </div>
            </div>

            {/* Setup */}
            <DetailGroup title="Setup">
              <Row label="Entry" value={fmt(trade.entry)} />
              <Row label="Stop" value={fmt(trade.stop)} />
              <Row label="Target" value={fmt(trade.target)} />
              <Row label="Stop distance" value={`${stopDist.toFixed(2)} pts`} />
              <Row
                label="R:R ratio"
                value={rrRatio != null ? `${rrRatio.toFixed(2)}R` : "—"}
              />
              {trade.range_size != null && (
                <Row label="Range size" value={`${fmt(trade.range_size)} pts`} />
              )}
            </DetailGroup>

            {trade.notes && (
              <DetailGroup title="Notes">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {trade.notes}
                </p>
              </DetailGroup>
            )}

            {trade.chart_url && (
              <DetailGroup title="Chart">
                {chartUrl ? (
                  <a href={chartUrl} target="_blank" rel="noreferrer">
                    <img
                      src={chartUrl}
                      alt="Trade chart"
                      className="w-full rounded-lg border border-border"
                    />
                  </a>
                ) : (
                  <div className="h-32 rounded-lg border border-border bg-muted/30 animate-pulse" />
                )}
              </DetailGroup>
            )}

            <div className="text-[10px] uppercase tracking-wider font-data text-muted-foreground">
              Created {new Date(trade.created_at).toLocaleString()}
            </div>
            </TabsContent>
            <TabsContent value="journal" className="mt-4">
              <JournalTab tradeId={trade.id} onSaved={onChanged} />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Edit form — controlled, no trigger */}
      <NewTradeSheet
        editTrade={trade}
        open={editOpen}
        onOpenChange={setEditOpen}
        trigger={null}
        onLogged={() => {
          setEditOpen(false);
          onChanged();
          onOpenChange(false);
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              {trade.instrument} {trade.direction} on {formatDate(trade.date)}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className="bg-trade-red text-white hover:bg-trade-red/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toString() : "—";
}

function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-data uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </span>
  );
}

function DetailGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wider font-data text-muted-foreground mb-2">
        {title}
      </h3>
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground font-data text-xs">{label}</span>
      <span className="font-data text-foreground">{value}</span>
    </div>
  );
}