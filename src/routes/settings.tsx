import { createFileRoute } from "@tanstack/react-router";
import { LogOut, KeyRound, CheckCircle2, Circle, Lock, Plus, Bell, Bookmark, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SETTINGS,
  getNotificationPermission,
  getNotificationSettings,
  requestNotificationPermission,
  setNotificationSettings,
  subscribeNotificationSettings,
  type NotificationSettings,
} from "@/lib/notifications";
import {
  clearAllSavedArticles,
  getSavedArticles,
  subscribeSavedArticles,
  SAVED_MAX,
} from "@/lib/savedArticlesDb";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "EdgeTrader — Settings" },
      { name: "description", content: "Manage your EdgeTrader account and preferences." },
      { property: "og:title", content: "EdgeTrader — Settings" },
      { property: "og:description", content: "Manage your account and preferences." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { user, signOut } = useAuth();

  return (
    <ProtectedRoute>
      <AppHeader balance={12450.0} />
      <div className="p-4 lg:p-6">
        <h1 className="text-2xl font-bold font-heading mb-4">Settings</h1>

          <div className="rounded-xl border border-border bg-card p-6 mb-4">
            <h2 className="text-lg font-semibold font-heading mb-3">Account</h2>
            <div className="flex items-center justify-between py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-data">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">User ID</span>
              <span className="text-sm font-data truncate max-w-[200px]">{user?.id}</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 mb-4">
            <h2 className="text-lg font-semibold font-heading mb-3">Preferences</h2>
            <div className="flex items-center justify-between py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Theme</span>
              <span className="text-sm font-data text-trade-green">Dark (always)</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">Currency</span>
              <span className="text-sm font-data">USD ($)</span>
            </div>
          </div>

          <NotificationsSection />

          <SavedArticlesSection />

          <ApiKeysSection />

          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-trade-red hover:bg-trade-red/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
      </div>
    </ProtectedRoute>
  );
}

// ---------- Notifications ----------

function NotificationsSection() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const supported =
    typeof window !== "undefined" && typeof Notification !== "undefined";

  useEffect(() => {
    if (!supported) return;
    setPermission(getNotificationPermission());
    setSettings(getNotificationSettings());
    return subscribeNotificationSettings(setSettings);
  }, [supported]);

  const handleEnable = async () => {
    if (!supported) {
      toast.error("Notifications aren't supported on this device.");
      return;
    }
    if (permission === "denied") {
      toast.error("Notifications are blocked. Enable them in your browser settings.");
      return;
    }
    if (permission === "default") {
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== "granted") {
        toast.error("Permission denied. You can still enable later.");
        return;
      }
    }
    setNotificationSettings({ enabled: !settings.enabled });
  };

  const toggle = (key: keyof NotificationSettings) => {
    setNotificationSettings({ [key]: !settings[key] });
  };

  const granted = permission === "granted";
  const masterOn = granted && settings.enabled;

  return (
    <div className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="size-5 text-primary" />
        <h2 className="text-lg font-semibold font-heading">Notifications</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Alerts work while the app is open or running in the background.
        {permission === "denied" && (
          <span className="block mt-1 text-trade-red">
            Permission is blocked — enable notifications for this site in your browser settings.
          </span>
        )}
      </p>

      <ToggleRow
        label="Enable notifications"
        sub={
          masterOn
            ? "On — you'll receive alerts for the categories below."
            : "Off — turn on to allow alerts."
        }
        checked={masterOn}
        onChange={handleEnable}
        disabled={!supported || permission === "denied"}
      />

      <div className={cn("mt-2 space-y-1", !masterOn && "opacity-50 pointer-events-none")}> 
        <ToggleRow
          label="Market open reminder"
          sub="8:25 AM CT, weekdays."
          checked={settings.marketOpen}
          onChange={() => toggle("marketOpen")}
        />
        <ToggleRow
          label="HIGH impact news"
          sub="Trigger as soon as a high-impact headline drops."
          checked={settings.news}
          onChange={() => toggle("news")}
        />
        <ToggleRow
          label="Daily loss limit"
          sub="Warn at 80% and stop at 100% of daily limit."
          checked={settings.lossLimit}
          onChange={() => toggle("lossLimit")}
        />
        <ToggleRow
          label="Challenge milestones"
          sub="25%, 50%, 75%, 100% of your target."
          checked={settings.milestones}
          onChange={() => toggle("milestones")}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        aria-pressed={checked}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-trade-green" : "bg-muted",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-background transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

// ---------- API Keys & Integrations ----------

type IntegrationStatus = "connected" | "available" | "coming_soon";

type Integration = {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  category: "AI" | "Market Data" | "News" | "Broker" | "Notifications";
};

const INTEGRATIONS: Integration[] = [
  {
    id: "lovable_ai",
    name: "Lovable AI",
    description: "Powers Chart Analyzer, Coach, and Market Context summaries.",
    status: "connected",
    category: "AI",
  },
  {
    id: "alpaca_news",
    name: "Alpaca Markets News",
    description: "Real-time financial news feed for the News tab.",
    status: "available",
    category: "News",
  },
  {
    id: "polygon",
    name: "Polygon.io",
    description: "Equity, options, and futures market data.",
    status: "available",
    category: "Market Data",
  },
  {
    id: "fred",
    name: "FRED (Federal Reserve)",
    description: "Macro indicators: Fed Funds, US10Y, DXY, breadth.",
    status: "available",
    category: "Market Data",
  },
  {
    id: "tradovate",
    name: "Tradovate",
    description: "Auto-import micro futures trades from your broker.",
    status: "coming_soon",
    category: "Broker",
  },
  {
    id: "topstep",
    name: "TopstepX",
    description: "Sync trades and challenge progress automatically.",
    status: "coming_soon",
    category: "Broker",
  },
  {
    id: "discord",
    name: "Discord Webhook",
    description: "Send trade alerts and EOD reports to a channel.",
    status: "coming_soon",
    category: "Notifications",
  },
];

function StatusPill({ status }: { status: IntegrationStatus }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-trade-green/30 bg-trade-green/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-trade-green">
        <CheckCircle2 className="size-3" />
        Connected
      </span>
    );
  }
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-500">
        <Circle className="size-3" />
        Not connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Lock className="size-3" />
      Coming soon
    </span>
  );
}

function ApiKeysSection() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 mb-4">
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" />
          <h2 className="text-lg font-semibold font-heading">API Keys & Integrations</h2>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Securely store credentials for third-party services. Keys are encrypted server-side and never exposed to the browser.
      </p>

      <div className="space-y-2">
        {INTEGRATIONS.map((it) => (
          <div
            key={it.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-foreground">{it.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.category}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{it.description}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <StatusPill status={it.status} />
              <button
                type="button"
                disabled={it.status === "coming_soon"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  it.status === "coming_soon"
                    ? "border-border/50 text-muted-foreground/60 cursor-not-allowed"
                    : it.status === "connected"
                      ? "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                      : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
                )}
              >
                {it.status === "connected" ? "Manage" : it.status === "available" ? (
                  <>
                    <Plus className="size-3" />
                    Add key
                  </>
                ) : (
                  "Locked"
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center">
        <p className="text-[11px] text-muted-foreground">
          Need another integration? More services will be added here as they're wired up.
        </p>
      </div>
    </div>
  );
}
