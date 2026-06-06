import { useEffect, useState } from "react";

const APP_VERSION = "v1.0.0";
const MIN_DISPLAY_MS = 1500;

export function SplashScreen() {
  const [progress, setProgress] = useState(8);
  const [fading, setFading] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    // Smoothly creep progress up to 92% while we wait for min display.
    const tick = () => {
      const elapsed = performance.now() - start;
      const pct = Math.min(92, 8 + (elapsed / MIN_DISPLAY_MS) * 84);
      setProgress(pct);
      if (elapsed < MIN_DISPLAY_MS) {
        raf = requestAnimationFrame(tick);
      } else {
        setProgress(100);
        // small beat at 100% then fade
        setTimeout(() => setFading(true), 180);
        setTimeout(() => setRemoved(true), 180 + 320);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (removed) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-300"
      style={{
        backgroundColor: "#07070d",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      {/* Logo monogram */}
      <div
        className="flex h-20 w-20 items-center justify-center rounded-2xl border border-trade-green/30 bg-trade-green/5"
        style={{
          boxShadow:
            "0 0 60px rgba(0, 255, 170, 0.28), 0 0 18px rgba(0, 255, 170, 0.35), inset 0 0 24px rgba(0, 255, 170, 0.08)",
        }}
      >
        <span
          className="font-heading text-5xl font-bold leading-none text-trade-green"
          style={{ textShadow: "0 0 18px rgba(0, 255, 170, 0.6)" }}
        >
          E
        </span>
      </div>

      {/* Wordmark */}
      <div
        className="mt-6 font-data text-sm font-bold uppercase tracking-[6px] text-trade-green"
        style={{ textShadow: "0 0 12px rgba(0, 255, 170, 0.35)" }}
      >
        EDGE TRADER
      </div>

      {/* Loading bar */}
      <div className="mt-8 h-[3px] w-44 overflow-hidden rounded-full bg-trade-green/10">
        <div
          className="h-full rounded-full bg-trade-green transition-[width] duration-150 ease-out"
          style={{
            width: `${progress}%`,
            boxShadow: "0 0 12px rgba(0, 255, 170, 0.55)",
          }}
        />
      </div>

      {/* Version */}
      <div className="absolute bottom-6 font-data text-[10px] uppercase tracking-[3px] text-trade-muted">
        {APP_VERSION}
      </div>
    </div>
  );
}