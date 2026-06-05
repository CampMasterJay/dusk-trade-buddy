import { useEffect, useState } from "react";

export type SetupStatus =
  | "watching"
  | "triggered_enter"
  | "triggered_skipped"
  | "invalidated"
  | "missed"
  | "waiting_news";

/** Status values from older stored data that we still accept while reading. */
type LegacyStatus = SetupStatus | "triggered";

export type WatchedSetup = {
  id: string;
  setupType: string;
  instrument: string;
  level: string;
  direction: "long" | "short";
  notes?: string;
  status: SetupStatus;
  outcomeNote?: string;
  outcomeAt?: number;
  createdAt: number;
};

const KEY = "setup-advisor:watchlist:v1";
const EVT = "setup-advisor:changed";

function read(): WatchedSetup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<WatchedSetup, "status"> & { status: LegacyStatus }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => ({
      ...s,
      status: (s.status === "triggered" ? "triggered_enter" : s.status) as SetupStatus,
    }));
  } catch {
    return [];
  }
}

function write(list: WatchedSetup[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVT));
}

export function getSetups(): WatchedSetup[] {
  return read();
}

export function addSetup(input: Omit<WatchedSetup, "id" | "createdAt" | "status"> & { status?: SetupStatus }) {
  const s: WatchedSetup = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: input.status ?? "watching",
  };
  write([s, ...read()]);
  return s;
}

export function updateSetup(id: string, patch: Partial<WatchedSetup>) {
  write(read().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export function removeSetup(id: string) {
  write(read().filter((s) => s.id !== id));
}

export function useSetups() {
  const [list, setList] = useState<WatchedSetup[]>(() => read());
  useEffect(() => {
    const handler = () => setList(read());
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return list;
}