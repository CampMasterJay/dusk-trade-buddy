import { type ReactNode, useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "./AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { settings, loading: settingsLoading } = useUserSettings();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (loading || settingsLoading || !user || !settings) return;
    if (!settings.onboarding_completed && pathname !== "/onboarding") {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, settingsLoading, user, settings, pathname, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground font-data text-sm">
          <div className="h-2 w-2 rounded-full bg-trade-green animate-pulse" />
          Authenticating...
        </div>
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}