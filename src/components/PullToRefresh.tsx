import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

const THRESHOLD = 70;
const MAX_PULL = 120;

export function PullToRefresh() {
  const router = useRouter();
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (refreshing) return;
      // Only engage when scrolled to the very top.
      const scroller = document.scrollingElement || document.documentElement;
      if (scroller.scrollTop > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // Resistance curve.
      const damped = Math.min(MAX_PULL, dy * 0.5);
      setPull(damped);
    };
    const onEnd = async () => {
      if (startY.current == null) return;
      const distance = pull;
      startY.current = null;
      if (distance >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
          window.dispatchEvent(new CustomEvent("edgetrader:refresh"));
          await router.invalidate();
        } finally {
          // Brief delay for visual feedback.
          setTimeout(() => {
            setRefreshing(false);
            setPull(0);
          }, 400);
        }
      } else {
        setPull(0);
      }
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
  }, [pull, refreshing, router]);

  if (pull === 0 && !refreshing) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{
        transform: `translateY(${Math.max(0, pull - 24)}px)`,
        transition: refreshing ? "transform 200ms ease-out" : "none",
      }}
    >
      <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-md">
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <ArrowDown
            className="h-4 w-4 text-muted-foreground transition-transform"
            style={{
              transform: `rotate(${progress * 180}deg)`,
              opacity: 0.4 + progress * 0.6,
            }}
          />
        )}
      </div>
    </div>
  );
}