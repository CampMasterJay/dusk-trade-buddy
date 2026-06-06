import { useEffect, useState } from "react";

/**
 * Tiny global announcer for screen readers.
 * - Mount <LiveRegion /> once near the app root.
 * - Call announce("Trade logged") from anywhere; the message is set on a
 *   role="status" aria-live="polite" element.
 */

type Listener = (msg: string, assertive: boolean) => void;
const listeners = new Set<Listener>();

export function announce(message: string, opts: { assertive?: boolean } = {}) {
  const assertive = !!opts.assertive;
  listeners.forEach((l) => l(message, assertive));
}

export function LiveRegion() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  useEffect(() => {
    const listener: Listener = (msg, isAssertive) => {
      // Clear first so identical consecutive messages still trigger SR output.
      if (isAssertive) {
        setAssertive("");
        requestAnimationFrame(() => setAssertive(msg));
      } else {
        setPolite("");
        requestAnimationFrame(() => setPolite(msg));
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {polite}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertive}
      </div>
    </>
  );
}