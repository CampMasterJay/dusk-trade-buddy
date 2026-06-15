import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { QuickLogPhotoUpload } from "@/components/QuickLogPhotoUpload";
import { calcOptionsPnl } from "@/lib/pnlCalc";

const STRATEGIES = [
  "Long Call",
  "Long Put",
  "Bull Call Spread",
  "Bear Put Spread",
  "Bull Put Spread",
  "Bear Call Spread",
  "Iron Condor",
  "Iron Butterfly",
  "Long Straddle",
  "Long Strangle",
  "Covered Call",
  "Cash Secured Put",
  "0DTE Play",
];

function asStr(v: unknown): string {
  return v == null ? "" : String(v);
}

export function OptionsQuickLogFab({ onLogged }: { onLogged: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [underlying, setUnderlying] = useState("SPY");
  const [strategy, setStrategy] = useState("Long Call");
  const [legType, setLegType] = useState<"Call" | "Put">("Call");
  const [legAction, setLegAction] = useState<"Buy" | "Sell">("Buy");
  const [strike, setStrike] = useState("");
  const [premium, setPremium] = useState("");
  const [contracts, setContracts] = useState("1");
  const [expiration, setExpiration] = useState("");
  const [exitPremium, setExitPremium] = useState("");
  const [netPnl, setNetPnl] = useState("");
  const [status, setStatus] = useState<"Open" | "Closed">("Closed");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setStrike("");
    setPremium("");
    setContracts("1");
    setExpiration("");
    setExitPremium("");
    setNetPnl("");
    setNotes("");
    setStatus("Closed");
  };

  const applyExtracted = (f: Record<string, string | number | boolean | null>) => {
    if (f.underlying) setUnderlying(String(f.underlying).toUpperCase());
    if (f.strategy_type && STRATEGIES.includes(String(f.strategy_type))) {
      setStrategy(String(f.strategy_type));
    }
    if (f.leg1_type === "Call" || f.leg1_type === "Put") setLegType(f.leg1_type);
    if (f.leg1_action === "Buy" || f.leg1_action === "Sell") setLegAction(f.leg1_action);
    if (f.leg1_strike != null) setStrike(asStr(f.leg1_strike));
    if (f.leg1_premium != null) setPremium(asStr(f.leg1_premium));
    if (f.leg1_contracts != null) setContracts(asStr(f.leg1_contracts));
    if (f.leg1_expiration) setExpiration(String(f.leg1_expiration));
    if (f.exit_premium != null) setExitPremium(asStr(f.exit_premium));
    if (f.net_pnl != null) setNetPnl(asStr(f.net_pnl));
    if (f.status === "Open" || f.status === "Closed") setStatus(f.status);
    if (f.notes) setNotes(String(f.notes));

    // Auto-calculate P/L when broker screenshot shows entry + exit premium
    // but no dollar P/L number.
    const entryP = f.leg1_premium != null ? Number(f.leg1_premium) : NaN;
    const exitP = f.exit_premium != null ? Number(f.exit_premium) : NaN;
    const qty = f.leg1_contracts != null ? Number(f.leg1_contracts) : 1;
    const action = f.leg1_action === "Sell" ? "Sell" : "Buy";
    if (f.net_pnl == null && Number.isFinite(entryP) && Number.isFinite(exitP)) {
      const computed = calcOptionsPnl({
        action,
        entryPremium: entryP,
        exitPremium: exitP,
        contracts: qty,
      });
      if (computed != null) setNetPnl(computed.toFixed(2));
    }
  };

  const submit = async () => {
    if (!user) {
      toast.error("Sign in to log trades.");
      return;
    }
    if (!underlying.trim() || !strike || !premium || !expiration) {
      toast.error("Underlying, strike, premium and expiration are required.");
      return;
    }
    setSaving(true);
    const isDebit = legAction === "Buy";
    const payload = {
      user_id: user.id,
      trade_date: new Date().toISOString().slice(0, 10),
      status,
      underlying: underlying.trim().toUpperCase(),
      strategy_type: strategy,
      is_debit: isDebit,
      is_0dte: strategy === "0DTE Play",
      leg1_type: legType,
      leg1_action: legAction,
      leg1_strike: Number(strike),
      leg1_premium: Number(premium),
      leg1_contracts: Math.max(1, Number(contracts) || 1),
      leg1_expiration: expiration,
      market_type: underlying.startsWith("/") ? "futures_option" : "equity_option",
      exit_premium: exitPremium ? Number(exitPremium) : null,
      net_pnl: netPnl ? Number(netPnl) : null,
      notes: notes || null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("options_trades").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Options trade logged");
    reset();
    setOpen(false);
    onLogged();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("edgetrader:refresh"));
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-6 right-6 z-40 h-14 rounded-full px-5 bg-trade-amber text-background hover:bg-trade-amber/90 font-data uppercase tracking-wider"
          style={{ boxShadow: "0 0 24px color-mix(in oklab, var(--trade-amber) 55%, transparent)" }}
        >
          <Plus className="mr-1 h-5 w-5" />
          Quick Log
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Quick Log Options Trade</SheetTitle>
          <SheetDescription>One-leg fast entry. Use full sheet for spreads.</SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <QuickLogPhotoUpload mode="options" onExtracted={applyExtracted} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="oql-under">Underlying</Label>
            <Input id="oql-under" value={underlying} onChange={(e) => setUnderlying(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Strategy</Label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={legType} onValueChange={(v) => setLegType(v as "Call" | "Put")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Call">Call</SelectItem>
                <SelectItem value="Put">Put</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Action</Label>
            <Select value={legAction} onValueChange={(v) => setLegAction(v as "Buy" | "Sell")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Buy">Buy</SelectItem>
                <SelectItem value="Sell">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="oql-strike">Strike</Label>
            <Input id="oql-strike" type="number" step="0.01" value={strike} onChange={(e) => setStrike(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oql-prem">Entry Premium</Label>
            <Input id="oql-prem" type="number" step="0.01" value={premium} onChange={(e) => setPremium(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oql-cts">Contracts</Label>
            <Input id="oql-cts" type="number" min="1" value={contracts} onChange={(e) => setContracts(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oql-exp">Expiration</Label>
            <Input id="oql-exp" type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "Open" | "Closed")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status === "Closed" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="oql-exit">Exit Premium</Label>
                <Input id="oql-exit" type="number" step="0.01" value={exitPremium} onChange={(e) => setExitPremium(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="oql-pnl">Net P&L ($)</Label>
                <Input id="oql-pnl" type="number" step="0.01" value={netPnl} onChange={(e) => setNetPnl(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="oql-notes">Notes</Label>
            <Input id="oql-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <SheetFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-trade-amber text-background hover:bg-trade-amber/90">
            {saving ? "Saving…" : "Log Trade"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}