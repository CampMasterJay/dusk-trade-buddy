import { useState, useEffect, useCallback } from "react";
import { X, Lightbulb, ChevronLeft, ChevronRight } from "lucide-react";

const TIPS = [
  {
    id: 1,
    text: "Upload a full chart screenshot showing at least 50–100 candles for best analysis results",
  },
  {
    id: 2,
    text: "Include the price axis and time axis in your screenshot — the AI needs these to detect levels",
  },
  {
    id: 3,
    text: "For Opening Range Breakout setups, screenshot the chart at 8:45 AM CT showing the first 15-min candle",
  },
];

const VISIT_KEY = "chartAnalyzerTipsShown";

export function useTipsVisibility() {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VISIT_KEY);
      const count = raw ? parseInt(raw, 10) : 0;
      if (count < 3) {
        setVisible(true);
        localStorage.setItem(VISIT_KEY, String(count + 1));
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);
  const prev = useCallback(() => setIndex((i) => (i === 0 ? TIPS.length - 1 : i - 1)), []);
  const next = useCallback(() => setIndex((i) => (i === TIPS.length - 1 ? 0 : i + 1)), []);

  return { visible, index, tip: TIPS[index], total: TIPS.length, dismiss, prev, next };
}

export function TipsCarousel() {
  const { visible, index, tip, total, dismiss, prev, next } = useTipsVisibility();

  if (!visible) return null;

  return (
    <div className="relative rounded-xl border border-trade-green/20 bg-trade-green/5 p-4">
      <button
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Dismiss tips"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-trade-green/15">
          <Lightbulb className="h-4 w-4 text-trade-green" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground leading-relaxed">
            {tip.text}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {Array.from({ length: total }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === index ? "w-4 bg-trade-green" : "w-1.5 bg-trade-green/30"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={prev}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Previous tip"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] font-data text-muted-foreground">
                {index + 1}/{total}
              </span>
              <button
                onClick={next}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Next tip"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
