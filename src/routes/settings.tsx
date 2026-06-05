import { createFileRoute } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { AppHeader } from "@/components/AppHeader";

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

          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-trade-red hover:bg-trade-red/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Sign Out</span>
        </button>
    </ProtectedRoute>
  );
}
