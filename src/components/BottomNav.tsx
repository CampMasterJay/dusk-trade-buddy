import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Home, BarChart3, List, Newspaper, Settings } from "lucide-react";
import { subscribeUnreadHighImpact } from "@/lib/unreadHighImpact";

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/chart-analyzer", label: "Analyzer", icon: BarChart3 },
  { to: "/trade-log", label: "Trade Log", icon: List },
  { to: "/news", label: "News", icon: Newspaper },
  { to: "/settings", label: "Settings", icon: Settings },
];

const authPaths = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function BottomNav() {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [unreadHigh, setUnreadHigh] = useState(0);

  useEffect(() => subscribeUnreadHighImpact(setUnreadHigh), []);

  // Hide on auth pages
  if (authPaths.includes(pathname)) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm md:hidden">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.to;
          const Icon = item.icon;
          const showBadge = item.to === "/news" && unreadHigh > 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center justify-center gap-0.5 w-16 h-full"
            >
              <div className="relative">
                <Icon
                  className={`h-5 w-5 transition-colors ${
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
      </div>
    </nav>
  );
}
