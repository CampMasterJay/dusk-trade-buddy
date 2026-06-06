import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { getWalkthrough } from "@/lib/walkthroughs/catalog";
import type { Walkthrough, WalkthroughStep } from "@/lib/walkthroughs/types";

type WalkthroughCtx = {
  active: Walkthrough | null;
  stepIndex: number;
  step: WalkthroughStep | null;
  targetEl: HTMLElement | null;
  resolving: boolean;
  start: (id: string) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
};

const Ctx = createContext<WalkthroughCtx | null>(null);

export function useWalkthrough() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWalkthrough must be used inside <WalkthroughProvider>");
  return v;
}

function waitForElement(selector: string, timeoutMs = 2500): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const found = document.querySelector<HTMLElement>(selector);
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      obs.disconnect();
      resolve(document.querySelector<HTMLElement>(selector));
    }, timeoutMs);
  });
}

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Walkthrough | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const [resolving, setResolving] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tokenRef = useRef(0);

  const step = active ? active.steps[stepIndex] ?? null : null;

  const resolveStep = useCallback(
    async (s: WalkthroughStep | null) => {
      if (!s) {
        setTargetEl(null);
        return;
      }
      const token = ++tokenRef.current;
      setResolving(true);
      setTargetEl(null);
      if (s.route && s.route !== pathname) {
        try {
          await navigate({ to: s.route });
        } catch {
          // ignore
        }
      }
      if (!s.selector) {
        if (token === tokenRef.current) setResolving(false);
        return;
      }
      const el = await waitForElement(s.selector);
      if (token !== tokenRef.current) return;
      if (el) {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        } catch {
          // ignore
        }
      }
      setTargetEl(el);
      setResolving(false);
    },
    [navigate, pathname],
  );

  useEffect(() => {
    void resolveStep(step);
  }, [step, resolveStep]);

  const start = useCallback((id: string) => {
    const w = getWalkthrough(id);
    if (!w) return;
    setActive(w);
    setStepIndex(0);
  }, []);

  const stop = useCallback(() => {
    tokenRef.current++;
    setActive(null);
    setStepIndex(0);
    setTargetEl(null);
    setResolving(false);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (!active) return 0;
      if (i >= active.steps.length - 1) {
        // finish
        tokenRef.current++;
        setActive(null);
        setTargetEl(null);
        setResolving(false);
        return 0;
      }
      return i + 1;
    });
  }, [active]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, prev, stop]);

  const value = useMemo<WalkthroughCtx>(
    () => ({ active, stepIndex, step, targetEl, resolving, start, next, prev, stop }),
    [active, stepIndex, step, targetEl, resolving, start, next, prev, stop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}