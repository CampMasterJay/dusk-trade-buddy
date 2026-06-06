import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Home, BarChart3, List, Newspaper, Settings, Target, ChevronLeft } from "lucide-react";
import { subscribeUnreadHighImpact } from "@/lib/unreadHighImpact";

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/chart-analyzer", label: "Analyzer", icon: BarChart3 },
  { to: "/setup-advisor", label: "Setups", icon: Target },
  { to: "/trade-log", label: "Trade Log", icon: List },
  { to: "/news", label: "News", icon: Newspaper },
  { to: "/settings", label: "Settings", icon: Settings },
];

const authPaths = ["/login", "/signup", "/forgot-password", "/reset-password"];
const STORAGE_KEY = "edgetrader.sidenav.open";
const EDGE_SWIPE_PX = 24;
const SWIPE_THRESHOLD_PX = 50;

export function BottomNav() {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [unreadHigh, setUnreadHigh] = useState(0);
  const [open, setOpen] = useState(true);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => subscribeUnreadHighImpact(setUnreadHigh), []);

  // Restore persisted state
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "0") setOpen(false);
      else if (v === "1") setOpen(true);
    } catch {
      // ignore
    }
  }, []);

  // Persist + sync class on <html> so layout can react via CSS var
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      // ignore
    }
    const root = document.documentElement;
    root.style.setProperty("--sidenav-w", open ? "4rem" : "0rem");
  }, [open]);

  // Right-swipe from the left edge reopens the nav
  useEffect(() => {
    if (open) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= EDGE_SWIPE_PX) {
        startRef.current = { x: t.clientX, y: t.clientY };
      } else {
        startRef.current = null;
      }
    };
    const onMove = (e: TouchEvent) => {
      const s = startRef.current;
      if (!s) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = Math.abs(t.clientY - s.y);
      if (dx > SWIPE_THRESHOLD_PX && dy < dx) {
        setOpen(true);
        startRef.current = null;
      }
    };
    const onEnd = () => {
      startRef.current = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [open]);

  // Hide on auth pages
  if (authPaths.includes(pathname)) {
    return null;
  }

  return (
    <>
      <nav
        aria-hidden={!open}
        className={`fixed top-0 bottom-0 left-0 z-50 w-16 border-r border-border bg-background/95 backdrop-blur-sm md:hidden transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col items-center justify-start gap-1 w-16 h-full py-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.to;
          const Icon = item.icon;
          const showBadge = item.to === "/news" && unreadHigh > 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              data-tour={`nav-${item.to}`}
              className="relative flex flex-col items-center justify-center gap-0.5 w-full py-2 transition-colors duration-200"
            >
              <span
                className={`pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-full bg-trade-green transition-all duration-300 ease-out ${
                  isActive ? "h-8 opacity-100" : "h-0 opacity-0"
                }`}
              />
              <div className="relative">
                <Icon
                  className={`h-5 w-5 transition-all duration-200 ${
                    isActive ? "text-trade-green" : "text-muted-foreground"
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {showBadge ? (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-trade-red px-1 text-[10px] font-bold leading-none text-white">
                    {unreadHigh > 9 ? "9+" : unreadHigh}
                  </span>
                ) : null}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors ${
                  isActive ? "text-trade-green" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Collapse navigation"
          className="mt-auto mb-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        </div>
      </nav>

      {/* Edge handle hint when collapsed — also acts as a tap-to-open target */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 h-16 w-1.5 rounded-r-full bg-trade-green/70 shadow-[0_0_12px_rgba(34,197,94,0.5)] md:hidden"
        />
      )}
    </>
  );
}
