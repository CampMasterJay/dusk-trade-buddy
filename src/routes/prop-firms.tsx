import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Pause,
  XCircle,
  Trophy,
  TrendingDown,
  Activity,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserSettings } from "@/hooks/useUserSettings";

export const Route = createFileRoute("/prop-firms")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Prop Firm Tracker" },
      {
        name: "description",
        content:
          "Track your funded futures challenges — profit target, drawdown, and daily loss with live status alerts.",
      },
    ],
  }),
  component: PropFirmsPage,
});

type PropFirm = {
  id: string;
  firm_name: string;
  account_size: number;
  monthly_fee: number | null;
  profit_target_pct: number | null;
  profit_target_amount: number | null;
  max_daily_loss_pct: number | null;
  max_daily_loss_amount: number | null;
  max_drawdown_pct: number | null;
  max_drawdown_amount: number | null;
  drawdown_type: string;
  payout_split_pct: number | null;
  payout_frequency: string | null;
  notes: string | null;
  website_url: string | null;
};

type Account = {
  id: string;
  user_id: string;
  prop_firm_id: string;
  starting_balance: number;
  current_balance: number;
  peak_balance: number;
  challenge_start_date: string;
  status: "In Challenge" | "Funded" | "Failed" | "Paused";
  notes: string | null;
  is_active: boolean;
};

const STATUSES: Account["status"][] = [
  "In Challenge",
  "Funded",
  "Failed",
  "Paused",
];

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function PropFirmsPage() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const tickValue = Number(settings?.tick_value ?? 5);

  const [firms, setFirms] = useState<PropFirm[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [todayPnl, setTodayPnl] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const [firmsRes, accountsRes] = await Promise.all([
      supabase
        .from("prop_firms")
        .select("*")
        .eq("is_active", true)
        .order("firm_name")
        .order("account_size"),
      supabase
        .from("prop_firm_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    setFirms((firmsRes.data ?? []) as PropFirm[]);
    setAccounts((accountsRes.data ?? []) as Account[]);

    // Today's PnL (America/Chicago) from trades
    const ctToday = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Chicago",
    });
    const pnlRes = await supabase
      .from("trades")
      .select("pnl")
      .eq("user_id", user.id)
      .eq("date", ctToday)
      .is("deleted_at", null);
    const sum = (pnlRes.data ?? []).reduce(
      (s, t) => s + (Number(t.pnl) || 0),
      0,
    );
    setTodayPnl(sum);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const firmsById = useMemo(() => {
    const map = new Map<string, PropFirm>();
    firms.forEach((f) => map.set(f.id, f));
    return map;
  }, [firms]);

  const activeAccounts = accounts.filter(
    (a) => a.is_active && a.status === "In Challenge",
  );
  const otherAccounts = accounts.filter(
    (a) => !a.is_active || a.status !== "In Challenge",
  );

  return (
    <ProtectedRoute>
      <AppHeader balance={Number(settings?.current_balance ?? 100)} />
      <div className="p-4 lg:p-6 pb-24 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold font-heading flex items-center gap-2">
              <Building2 className="h-6 w-6 text-trade-blue" />
              Prop Firm Tracker
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor your funded challenges, drawdown headroom, and daily loss
              limit in real time.
            </p>
          </div>
          <AddAccountDialog firms={firms} onSaved={reload} />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : accounts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No prop firm accounts yet. Click "Add account" to get started.
            </CardContent>
          </Card>
        ) : (
          <>
            {activeAccounts.length > 0 && (
              <section className="space-y-4 mb-6">
                {activeAccounts.map((a) => {
                  const firm = firmsById.get(a.prop_firm_id);
                  if (!firm) return null;
                  return (
                    <AccountCard
                      key={a.id}
                      account={a}
                      firm={firm}
                      todayPnl={todayPnl}
                      tickValue={tickValue}
                      onChanged={reload}
                    />
                  );
                })}
              </section>
            )}

            {otherAccounts.length > 0 && (
              <section>
                <h2 className="text-sm font-data uppercase tracking-wider text-muted-foreground mb-2">
                  History & Other Accounts
                </h2>
                <div className="space-y-2">
                  {otherAccounts.map((a) => {
                    const firm = firmsById.get(a.prop_firm_id);
                    if (!firm) return null;
                    return (
                      <Card key={a.id}>
                        <CardContent className="py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <StatusBadge status={a.status} />
                            <div>
                              <div className="text-sm font-medium">
                                {firm.firm_name} · {fmt(firm.account_size)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Started{" "}
                                {new Date(
                                  a.challenge_start_date,
                                ).toLocaleDateString()}{" "}
                                · Balance {fmt(Number(a.current_balance))}
                              </div>
                            </div>
                          </div>
                          <DeleteAccountButton
                            accountId={a.id}
                            onDeleted={reload}
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}

// ---------- Account Card ----------

function computeLimits(firm: PropFirm, startingBalance: number) {
  const profitTarget =
    firm.profit_target_amount ??
    (firm.profit_target_pct != null
      ? startingBalance * (Number(firm.profit_target_pct) / 100)
      : 0);
  const maxDailyLoss =
    firm.max_daily_loss_amount ??
    (firm.max_daily_loss_pct != null
      ? startingBalance * (Number(firm.max_daily_loss_pct) / 100)
      : null);
  const maxDrawdown =
    firm.max_drawdown_amount ??
    (firm.max_drawdown_pct != null
      ? startingBalance * (Number(firm.max_drawdown_pct) / 100)
      : 0);
  return { profitTarget, maxDailyLoss, maxDrawdown };
}

function AccountCard({
  account,
  firm,
  todayPnl,
  tickValue,
  onChanged,
}: {
  account: Account;
  firm: PropFirm;
  todayPnl: number;
  tickValue: number;
  onChanged: () => void;
}) {
  const starting = Number(account.starting_balance);
  const current = Number(account.current_balance);
  const peak = Number(account.peak_balance);
  const { profitTarget, maxDailyLoss, maxDrawdown } = computeLimits(
    firm,
    starting,
  );

  const pnl = current - starting;
  const profitPct = profitTarget > 0 ? (pnl / profitTarget) * 100 : 0;

  // Drawdown reference: trailing uses peak, static uses starting
  const ddRef =
    firm.drawdown_type === "static" ? starting : Math.max(peak, starting);
  const drawdownUsed = Math.max(0, ddRef - current);
  const drawdownPct =
    maxDrawdown > 0 ? (drawdownUsed / maxDrawdown) * 100 : 0;
  const drawdownRemaining = Math.max(0, maxDrawdown - drawdownUsed);

  // Daily loss
  const dailyLossUsed = todayPnl < 0 ? Math.abs(todayPnl) : 0;
  const dailyPct =
    maxDailyLoss && maxDailyLoss > 0
      ? (dailyLossUsed / maxDailyLoss) * 100
      : 0;

  // Days elapsed
  const start = new Date(account.challenge_start_date);
  const daysElapsed = Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / 86400000),
  );

  // Status zone
  const zone: "PASS" | "CAUTION" | "DANGER" =
    drawdownPct >= 80 || (dailyPct >= 80 && maxDailyLoss)
      ? "DANGER"
      : drawdownPct >= 50 || profitPct < 25
        ? "CAUTION"
        : profitPct >= 50
          ? "PASS"
          : "CAUTION";

  // Warnings
  const dailyLimitHit = !!maxDailyLoss && dailyLossUsed >= maxDailyLoss;
  const drawdownWarning = drawdownPct >= 80;
  const targetReached = profitTarget > 0 && pnl >= profitTarget;
  const pointsToTermination =
    tickValue > 0 ? drawdownRemaining / tickValue : 0;

  return (
    <Card
      className={
        zone === "DANGER"
          ? "border-trade-red"
          : zone === "CAUTION"
            ? "border-trade-amber"
            : "border-trade-green/50"
      }
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {firm.firm_name} · {fmt(firm.account_size)}
              <ZoneBadge zone={zone} />
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              {firm.drawdown_type.replace("_", " ")} drawdown · Day{" "}
              {daysElapsed + 1}
              {firm.profit_target_pct
                ? ` · ${firm.profit_target_pct}% target`
                : ""}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <UpdateBalanceDialog account={account} onSaved={onChanged} />
            <StatusDropdown account={account} onSaved={onChanged} />
            <DeleteAccountButton accountId={account.id} onDeleted={onChanged} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warnings */}
        {targetReached && (
          <WarningBanner
            tone="success"
            icon={<Trophy className="h-4 w-4" />}
            title="CHALLENGE COMPLETE"
            body="Submit for funded account evaluation."
          />
        )}
        {dailyLimitHit && (
          <WarningBanner
            tone="danger"
            icon={<XCircle className="h-4 w-4" />}
            title="STOP TRADING"
            body="Daily loss limit hit. Resume tomorrow."
          />
        )}
        {drawdownWarning && !targetReached && (
          <WarningBanner
            tone="danger"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="DRAWDOWN WARNING"
            body={`${fmt(drawdownRemaining)} (~${pointsToTermination.toFixed(0)} pts) from account termination.`}
          />
        )}

        {/* Balance summary */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Balance" value={fmt(current)} />
          <Stat
            label="P&L"
            value={fmt(pnl)}
            tone={pnl >= 0 ? "green" : "red"}
          />
          <Stat label="Peak" value={fmt(peak)} />
        </div>

        {/* Profit target */}
        <ProgressRow
          label="Profit target"
          current={Math.max(0, pnl)}
          max={profitTarget}
          tone="green"
          rightLabel={`${Math.max(0, profitPct).toFixed(0)}%`}
        />

        {/* Drawdown */}
        <ProgressRow
          label={`Drawdown (${firm.drawdown_type.replace("_", " ")})`}
          current={drawdownUsed}
          max={maxDrawdown}
          tone="red"
          rightLabel={`${drawdownRemaining > 0 ? fmt(drawdownRemaining) + " left" : "BREACHED"}`}
        />

        {/* Daily loss */}
        {maxDailyLoss && (
          <ProgressRow
            label="Daily loss (CT)"
            current={dailyLossUsed}
            max={maxDailyLoss}
            tone="red"
            rightLabel={`${fmt(dailyLossUsed)} / ${fmt(maxDailyLoss)}`}
          />
        )}

        <div className="text-[10px] text-muted-foreground">
          Daily loss resets at midnight America/Chicago. Includes only trades
          logged in EdgeTrader.
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- UI bits ----------

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-base font-data ${
          tone === "green"
            ? "text-trade-green"
            : tone === "red"
              ? "text-trade-red"
              : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  current,
  max,
  tone,
  rightLabel,
}: {
  label: string;
  current: number;
  max: number;
  tone: "green" | "red";
  rightLabel?: string;
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-data">{rightLabel ?? `${pct.toFixed(0)}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all ${
            tone === "green" ? "bg-trade-green" : "bg-trade-red"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ZoneBadge({ zone }: { zone: "PASS" | "CAUTION" | "DANGER" }) {
  const map = {
    PASS: { label: "PASS ZONE", cls: "bg-trade-green/15 text-trade-green border-trade-green/40" },
    CAUTION: { label: "CAUTION", cls: "bg-trade-amber/15 text-trade-amber border-trade-amber/40" },
    DANGER: { label: "DANGER", cls: "bg-trade-red/15 text-trade-red border-trade-red/40" },
  } as const;
  const { label, cls } = map[zone];
  return (
    <Badge variant="outline" className={`text-[10px] font-data ${cls}`}>
      {label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: Account["status"] }) {
  const map: Record<Account["status"], { cls: string; icon: React.ReactNode }> = {
    "In Challenge": {
      cls: "text-trade-blue border-trade-blue/40",
      icon: <Activity className="h-3 w-3" />,
    },
    Funded: {
      cls: "text-trade-green border-trade-green/40",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    Failed: {
      cls: "text-trade-red border-trade-red/40",
      icon: <TrendingDown className="h-3 w-3" />,
    },
    Paused: {
      cls: "text-muted-foreground border-border",
      icon: <Pause className="h-3 w-3" />,
    },
  };
  const { cls, icon } = map[status];
  return (
    <Badge variant="outline" className={`text-[10px] ${cls} flex items-center gap-1`}>
      {icon}
      {status}
    </Badge>
  );
}

function WarningBanner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "danger" | "success";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const cls =
    tone === "danger"
      ? "border-trade-red/50 bg-trade-red/10 text-trade-red"
      : "border-trade-green/50 bg-trade-green/10 text-trade-green";
  return (
    <div className={`flex items-start gap-2 rounded-md border p-3 ${cls}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="text-xs font-data uppercase tracking-wider">{title}</div>
        <div className="text-sm">{body}</div>
      </div>
    </div>
  );
}

// ---------- Add account dialog ----------

function AddAccountDialog({
  firms,
  onSaved,
}: {
  firms: PropFirm[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [firmName, setFirmName] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [currentBalance, setCurrentBalance] = useState<string>("");
  const [status, setStatus] = useState<Account["status"]>("In Challenge");
  const [saving, setSaving] = useState(false);

  const firmNames = useMemo(
    () => Array.from(new Set(firms.map((f) => f.firm_name))),
    [firms],
  );
  const sizes = useMemo(
    () => firms.filter((f) => f.firm_name === firmName),
    [firms, firmName],
  );
  const selectedFirm = firms.find((f) => f.id === accountId);

  // Default current balance to account size
  useEffect(() => {
    if (selectedFirm) setCurrentBalance(String(selectedFirm.account_size));
  }, [selectedFirm]);

  const reset = () => {
    setFirmName("");
    setAccountId("");
    setStartDate(new Date().toISOString().split("T")[0]);
    setCurrentBalance("");
    setStatus("In Challenge");
  };

  const save = async () => {
    if (!user) return;
    if (!selectedFirm) {
      toast.error("Pick a firm and account size");
      return;
    }
    const balance = Number(currentBalance);
    if (!Number.isFinite(balance) || balance <= 0) {
      toast.error("Enter a valid current balance");
      return;
    }
    setSaving(true);
    const starting = Number(selectedFirm.account_size);
    const { error } = await supabase.from("prop_firm_accounts").insert({
      user_id: user.id,
      prop_firm_id: selectedFirm.id,
      starting_balance: starting,
      current_balance: balance,
      peak_balance: Math.max(starting, balance),
      challenge_start_date: startDate,
      status,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Prop firm account added");
    reset();
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Add account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Prop Firm Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Firm</Label>
            <Select value={firmName} onValueChange={(v) => { setFirmName(v); setAccountId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select firm" />
              </SelectTrigger>
              <SelectContent>
                {firmNames.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Account size</Label>
            <Select
              value={accountId}
              onValueChange={setAccountId}
              disabled={!firmName}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                {sizes.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {fmt(f.account_size)} — {fmt(f.monthly_fee ?? 0)}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Current balance</Label>
              <Input
                type="number"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(e.target.value)}
                placeholder="e.g. 50000"
              />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Account["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Update balance dialog ----------

function UpdateBalanceDialog({
  account,
  onSaved,
}: {
  account: Account;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(String(account.current_balance));
  const [notes, setNotes] = useState(account.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBalance(String(account.current_balance));
    setNotes(account.notes ?? "");
  }, [account]);

  const save = async () => {
    const val = Number(balance);
    if (!Number.isFinite(val) || val < 0) {
      toast.error("Enter a valid balance");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("prop_firm_accounts")
      .update({ current_balance: val, notes: notes || null })
      .eq("id", account.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Balance updated");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          Update
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Balance</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Current balance</Label>
            <Input
              type="number"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Status dropdown ----------

function StatusDropdown({
  account,
  onSaved,
}: {
  account: Account;
  onSaved: () => void;
}) {
  const change = async (next: Account["status"]) => {
    const { error } = await supabase
      .from("prop_firm_accounts")
      .update({
        status: next,
        is_active: next === "In Challenge" || next === "Funded",
      })
      .eq("id", account.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Status: ${next}`);
    onSaved();
  };
  return (
    <Select value={account.status} onValueChange={(v) => change(v as Account["status"])}>
      <SelectTrigger className="h-7 text-xs w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DeleteAccountButton({
  accountId,
  onDeleted,
}: {
  accountId: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const del = async () => {
    const { error } = await supabase
      .from("prop_firm_accounts")
      .delete()
      .eq("id", accountId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed");
    onDeleted();
  };
  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={del}>
          Delete
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-trade-red"
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}