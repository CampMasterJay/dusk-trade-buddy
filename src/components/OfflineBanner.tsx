import { useEffect, useRef } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuth } from "@/components/AuthProvider";
import { flushQueuedTrades, getQueuedTrades } from "@/lib/offlineCache";

export function OfflineBanner() {
  const online = useOnlineStatus();
  const { user } = useAuth();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!user) return;
    // Coming back online — flush queued trades.
    (async () => {
      const queue = await getQueuedTrades(user.id);
      if (queue.length === 0) return;
      const { synced, failed } = await flushQueuedTrades(user.id);
      if (synced > 0) {
        toast.success(
          `Synced ${synced} offline trade${synced === 1 ? "" : "s"}`,
          { icon: <RefreshCw className="size-4" /> },
        );
      }
      if (failed > 0) {
        toast.error(`Failed to sync ${failed} trade${failed === 1 ? "" : "s"}`);
      }
    })();
  }, [online, user]);

  if (online) return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500/15 border-b border-amber-500/40 text-amber-200">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 text-sm">
        <WifiOff className="size-4 shrink-0" />
        <span className="font-medium">Offline Mode</span>
        <span className="text-amber-200/80 hidden sm:inline">
          — viewing cached data. New trades will sync when you reconnect.
        </span>
      </div>
    </div>
  );
}