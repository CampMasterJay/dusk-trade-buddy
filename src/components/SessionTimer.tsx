import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Clock, Timer } from "lucide-react";

type Tone = "green" | "amber" | "red" | "neutral";

type Window = {
  key: string;
  label: string;
  /** Minutes since CT midnight, start. */
  start: number;
  /** Minutes since CT midnight, end. */
  end: number;
  tone: Tone;
  /** True if this is a prime trading window (for vibration alerts). */
  prime?: boolean;
};

/** Times below are in America/Chicago (CT). */
const WINDOWS: Window[] = [
  { key: "premarket", label: "NY Pre-Market", start: 8 * 60, end: 8 * 60 + 30, tone: "amber" },
  { key: "open", label: "NY Regular Open", start: 8 * 60 + 30, end: 8 * 60 + 45, tone: "green", prime: true },
  { key: "orb", label: "ORB Window", start: 8 * 60 + 30, end: 8 * 60 + 45, tone: "green", prime: true },
  { key: "prime", label: "Prime Trading Window", start: 8 * 60 + 45, end: 10 * 60, tone: "green", prime: true },
  { key: "midmorning", label: "Mid-Morning", start: 10 * 60, end: 11 * 60 + 30, tone: "amber" },
  { key: "lunch", label: "Lunch Chop Zone", start: 11 * 60 + 30, end: 13 * 60, tone: "red" },
  { key: "afternoon", label: "Afternoon Session", start: 13 * 60, end: 15 * 60, tone: "green", prime: true },
  { key: "close", label: "Market Close", start: 15 * 60, end: 15 * 60 + 1, tone: "amber" },
];

/** Distinct anchors used for the "next event" countdown list. */
const ANCHORS: { key: string; label: string; minute: number }[] = [
  { key: "premarket", label: "NY Pre-Market Open", minute: 8 * 60 },
  { key: "open", label: "NY Regular Open", minute: 8 * 60 + 30 },
  { key: "orb-close", label: "ORB Window Close", minute: 8 * 60 + 45 },
  { key: "prime-end", label: "Prime Window End", minute: 10 * 60 },
  { key: "lunch", label: "Lunch Chop Zone", minute: 11 * 60 + 30 },
  { key: "afternoon", label: "Afternoon Session", minute: 13 * 60 },
  { key: "close", label: "Market Close", minute: 15 * 60 },
];

function ctParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // Intl returns "24" for midnight in some envs; normalize to 0.
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;
  return {
    weekday: get("weekday"),
    hour,
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
  };
}

function fmtCountdown(totalSec: number) {
  if (totalSec < 0) totalSec = 0;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : `${m}m ${String(s).padStart(2, "0")}s`;
}

const TONE_BG: Record<Tone, string> = {
  green: "bg-trade-green",
  amber: "bg-amber-400",
  red: "bg-trade-red",
  neutral: "bg-muted-foreground",
};

const TONE_TEXT: Record<Tone, string> = {
  green: "text-trade-green",
  amber: "text-amber-400",
  red: "text-trade-red",
  neutral: "text-muted-foreground",
};

const TONE_BORDER: Record<Tone, string> = {
  green: "border-trade-green/40 bg-trade-green/10",
  amber: "border-amber-500/40 bg-amber-500/10",
  red: "border-trade-red/40 bg-trade-red/10",
  neutral: "border-border bg-background",
};

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* noop */
  }
}

export function SessionTimer() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { weekday, hour, minute, second } = ctParts(now);
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const minuteOfDay = hour * 60 + minute;
  const secondOfDay = minuteOfDay * 60 + second;

  /** Currently active window (prime > green > amber > red precedence on overlap). */
  const active = useMemo(() => {
    if (!isWeekday) return null;
    const matches = WINDOWS.filter((w) => minuteOfDay >= w.start && minuteOfDay < w.end);
    if (matches.length === 0) return null;
    const rank: Record<Tone, number> = { green: 0, amber: 1, red: 2, neutral: 3 };
    return [...matches].sort((a, b) => rank[a.tone] - rank[b.tone])[0];
  }, [isWeekday, minuteOfDay]);

  // Vibrate when entering or leaving a prime window.
  const lastPrimeRef = useRef<boolean | null>(null);
  useEffect(() => {
    const inPrime = !!active?.prime;
    if (lastPrimeRef.current === null) {
      lastPrimeRef.current = inPrime;
      return;
    }
    if (lastPrimeRef.current !== inPrime) {
      vibrate(inPrime ? [120, 60, 120] : [200]);
      lastPrimeRef.current = inPrime;
    }
  }, [active]);

  // Status banner
  let bannerTone: Tone = "neutral";
  let bannerLabel = "Markets Closed";
  let bannerDetail = isWeekday ? "Outside session hours" : "Weekend — markets closed";
  if (active) {
    bannerTone = active.tone;
    bannerLabel = active.label;
    const remaining = active.end * 60 - secondOfDay;
    bannerDetail = `${fmtCountdown(remaining)} remaining`;
    // Amber within 5 min of any window change while green
    if (active.tone === "green" && remaining <= 5 * 60) {
      bannerTone = "amber";
      bannerDetail = `Window ends in ${fmtCountdown(remaining)}`;
    }
  }

  // Next anchors (today only)
  const upcoming = useMemo(() => {
    return ANCHORS
      .map((a) => ({ ...a, secLeft: a.minute * 60 - secondOfDay }))
      .filter((a) => a.secLeft > 0)
      .slice(0, 4);
  }, [secondOfDay]);

  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-data uppercase tracking-[3px] text-muted-foreground">
          <Timer className="h-3 w-3" />
          Session Timer
        </div>
        <div className="flex items-baseline gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="font-data text-sm tabular-nums text-foreground">{clock}</span>
          <span className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">CT</span>
        </div>
      </div>

      {/* Active status banner */}
      <div
        className={cn(
          "flex items-center justify-between rounded-lg border p-3",
          TONE_BORDER[bannerTone],
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONE_BG[bannerTone], active ? "animate-pulse" : "")} />
          <div className="min-w-0">
            <div className={cn("font-heading text-sm font-semibold truncate", TONE_TEXT[bannerTone])}>
              {bannerLabel}
            </div>
            <div className="text-[11px] text-muted-foreground">{bannerDetail}</div>
          </div>
        </div>
      </div>

      {/* Timeline bar (8:00 → 15:00 CT) */}
      <Timeline minuteOfDay={minuteOfDay} isWeekday={isWeekday} />

      {/* Upcoming countdowns */}
      <div className="mt-4">
        <div className="mb-2 text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
          {isWeekday && upcoming.length > 0 ? "Up next" : "No more events today"}
        </div>
        {isWeekday && upcoming.length > 0 ? (
          <ul className="space-y-1.5">
            {upcoming.map((a) => (
              <li
                key={a.key}
                className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-2"
              >
                <span className="text-xs text-foreground">{a.label}</span>
                <span className="font-data text-xs tabular-nums text-muted-foreground">
                  {fmtCountdown(a.secLeft)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function Timeline({ minuteOfDay, isWeekday }: { minuteOfDay: number; isWeekday: boolean }) {
  const dayStart = 8 * 60; // 8:00 CT
  const dayEnd = 15 * 60; // 15:00 CT
  const span = dayEnd - dayStart;

  const pct = (m: number) => `${Math.max(0, Math.min(100, ((m - dayStart) / span) * 100))}%`;
  const cursor = Math.min(Math.max(minuteOfDay, dayStart), dayEnd);

  // Render bands (skip the ORB overlay; it's inside the open band already)
  const bands = WINDOWS.filter((w) => w.key !== "orb");

  return (
    <div className="mt-4">
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        {bands.map((w) => (
          <div
            key={w.key}
            className={cn("absolute top-0 h-full opacity-90", TONE_BG[w.tone])}
            style={{
              left: pct(w.start),
              width: `calc(${pct(w.end)} - ${pct(w.start)})`,
            }}
            title={w.label}
          />
        ))}
        {isWeekday && minuteOfDay >= dayStart && minuteOfDay <= dayEnd ? (
          <div
            className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-foreground shadow-[0_0_6px_rgba(255,255,255,0.6)]"
            style={{ left: pct(cursor) }}
          />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-[9px] font-data uppercase tracking-wider text-muted-foreground">
        <span>8a</span>
        <span>9a</span>
        <span>10a</span>
        <span>11a</span>
        <span>12p</span>
        <span>1p</span>
        <span>2p</span>
        <span>3p</span>
      </div>
    </div>
  );
}