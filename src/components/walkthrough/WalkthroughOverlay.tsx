import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useWalkthrough } from "./WalkthroughProvider";

type Rect = { top: number; left: number; width: number; height: number };

const PADDING = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_W = 340;

function getRect(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function WalkthroughOverlay() {
  const { active, step, stepIndex, targetEl, resolving, next, prev, stop } = useWalkthrough();
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : 0,
    h: typeof window !== "undefined" ? window.innerHeight : 0,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!active) return;
    const update = () => {
      setRect(getRect(targetEl));
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    update();
    if (!targetEl) return;
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const ro = new ResizeObserver(update);
    ro.observe(targetEl);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro.disconnect();
    };
  }, [active, targetEl, step]);

  if (!mounted || !active || !step) return null;

  const total = active.steps.length;
  const isLast = stepIndex === total - 1;
  const isFirst = stepIndex === 0;

  const tooltipW = Math.min(TOOLTIP_W, viewport.w - 24);

  // Tooltip position
  let tooltipTop = viewport.h / 2 - 80;
  let tooltipLeft = viewport.w / 2 - tooltipW / 2;
  let placement: "center" | "top" | "bottom" = "center";

  if (rect) {
    const spaceBelow = viewport.h - (rect.top + rect.height) - TOOLTIP_GAP - 16;
    const spaceAbove = rect.top - TOOLTIP_GAP - 16;
    const preferTop = step.placement === "top" || (step.placement !== "bottom" && spaceBelow < 220 && spaceAbove > spaceBelow);
    placement = preferTop ? "top" : "bottom";
    tooltipLeft = Math.min(
      Math.max(12, rect.left + rect.width / 2 - tooltipW / 2),
      viewport.w - tooltipW - 12,
    );
    if (placement === "bottom") {
      tooltipTop = rect.top + rect.height + TOOLTIP_GAP;
    } else {
      // measured after render; rough estimate ~ 180px tall, clamp:
      tooltipTop = Math.max(12, rect.top - TOOLTIP_GAP - 180);
    }
  }

  // Spotlight padded rect
  const sp = rect
    ? {
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] pointer-events-none" aria-live="polite">
      {/* Dim layer with cut-out via SVG mask */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto" aria-hidden>
        <defs>
          <mask id="walkthrough-mask">
            <rect width="100%" height="100%" fill="white" />
            {sp && (
              <rect
                x={sp.left}
                y={sp.top}
                width={sp.width}
                height={sp.height}
                rx={10}
                ry={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#walkthrough-mask)"
        />
      </svg>

      {/* Spotlight border ring */}
      {sp && (
        <div
          className="absolute rounded-[10px] ring-2 ring-primary/80 shadow-[0_0_0_2px_rgba(0,0,0,0.4)] pointer-events-none transition-all duration-200"
          style={{ top: sp.top, left: sp.left, width: sp.width, height: sp.height }}
        />
      )}

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-title"
        className="absolute pointer-events-auto rounded-xl border border-border bg-card text-card-foreground shadow-2xl transition-all duration-200"
        style={{
          top: tooltipTop,
          left: tooltipLeft,
          width: tooltipW,
        }}
      >
        <div className="flex items-start gap-2 p-4 pb-2">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
              {active.title} · Step {stepIndex + 1} of {total}
            </div>
            <h3 id="walkthrough-title" className="mt-1 text-sm font-semibold font-heading">
              {step.title}
            </h3>
          </div>
          <button
            onClick={stop}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close walkthrough"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="px-4 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
        {resolving && (
          <div className="px-4 mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Finding the right spot…
          </div>
        )}
        {!resolving && step.selector && !rect && (
          <div className="px-4 mt-2 text-[11px] text-trade-red">
            Couldn't locate that element. You can skip or continue.
          </div>
        )}
        <div className="mt-3 flex items-center justify-between p-3 pt-2 border-t border-border/60">
          <div className="flex items-center gap-1">
            {active.steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? "w-5 bg-primary" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={stop}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
            <button
              onClick={prev}
              disabled={isFirst}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium disabled:opacity-40"
            >
              <ChevronLeft className="h-3 w-3" />
              Back
            </button>
            <button
              onClick={next}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {isLast ? "Done" : "Next"}
              {!isLast && <ChevronRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}