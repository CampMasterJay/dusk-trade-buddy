import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Home, BarChart3, List, Newspaper, Settings, Target } from "lucide-react";
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
    <nav className="fixed top-0 bottom-0 left-0 z-50 w-16 border-r border-border bg-background/95 backdrop-blur-sm md:hidden">
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
      </div>
    </nav>
  );
}
