import { useEffect, useState } from "react";

export type SetupStatus = "watching" | "triggered" | "missed" | "invalidated";

export type WatchedSetup = {
  id: string;
  setupType: string;
  instrument: string;
  level: string;
  direction: "long" | "short";
  notes?: string;
  status: SetupStatus;
  createdAt: number;
};

const KEY = "setup-advisor:watchlist:v1";
const EVT = "setup-advisor:changed";

function read(): WatchedSetup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchedSetup[];
    return Array.isArray(parsed) ? parsed : [];
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