import { Zap } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-trade-green/20">
              <Zap className="h-5 w-5 text-trade-green" />
            </div>
            <span className="text-xl font-bold font-heading tracking-tight">
              Edge<span className="text-trade-green">Trader</span>
            </span>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-2xl">
            <h1 className="text-2xl font-semibold font-heading tracking-tight">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
            <div className="mt-6">{children}</div>
          </div>

          {footer && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-data text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider font-heading";

export const primaryBtnClass =
  "h-10 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed";