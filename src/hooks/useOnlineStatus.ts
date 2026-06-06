import { useEffect, useState } from "react";

export function useOnlineStatus(): boolean {
  // Always start as online to avoid SSR/CSR hydration mismatches
  // (some server runtimes expose `navigator` with `onLine === false`).
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    if (typeof navigator !== "undefined") setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}