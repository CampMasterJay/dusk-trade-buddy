import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  updateAnalysisFeedback,
  type FeedbackRating,
} from "@/lib/chartAnalysisService";

const OPTIONS: { value: FeedbackRating; label: string; desc: string }[] = [
  { value: "spot_on", label: "Spot on", desc: "Entry/stop/target were correct" },
  { value: "partially_correct", label: "Partially correct", desc: "Direction right, levels off" },
  { value: "wrong_direction", label: "Wrong direction", desc: "Bias was incorrect" },
  { value: "mis_executed", label: "Setup valid, mis-executed", desc: "I didn't follow the plan" },
];

export function AnalysisFeedbackPrompt({
  analysisId,
  setupLabel,
  direction,
  result,
  existingRating,
  existingNote,
  onSaved,
}: {
  analysisId: string;
  setupLabel: string;
  direction: string;
  result: "won" | "lost";
  existingRating?: string | null;
  existingNote?: string | null;
  onSaved?: () => void;
}) {
  const [rating, setRating] = useState<FeedbackRating | null>(
    (existingRating as FeedbackRating | null) ?? null,
  );
  const [note, setNote] = useState(existingNote ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function submit(value: FeedbackRating) {
    setRating(value);
    setSaving(true);
    const { error } = await updateAnalysisFeedback(analysisId, value, note);
    setSaving(false);
    if (!error) {
      setSavedAt(Date.now());
      onSaved?.();
    }
  }

  async function saveNote() {
    if (!rating) return;
    setSaving(true);
    const { error } = await updateAnalysisFeedback(analysisId, rating, note);
    setSaving(false);
    if (!error) {
      setSavedAt(Date.now());
      onSaved?.();
    }
  }

  const isWin = result === "won";

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="text-xs text-foreground">
        This analysis suggested{" "}
        <span className="font-semibold">{setupLabel}</span>{" "}
        <span
          className={
            direction.toLowerCase() === "long"
              ? "text-trade-green"
              : direction.toLowerCase() === "short"
                ? "text-trade-red"
                : "text-muted-foreground"
          }
        >
          {direction}
        </span>
        . You{" "}
        <span className={isWin ? "text-trade-green font-semibold" : "text-trade-red font-semibold"}>
          {isWin ? "won" : "lost"}
        </span>
        . Was the analysis accurate?
      </p>

      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const selected = rating === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              onClick={() => void submit(opt.value)}
              className={`rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                selected
                  ? "border-trade-green/50 bg-trade-green/10 text-trade-green"
                  : "border-border bg-card hover:bg-accent text-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {selected && <CheckCircle2 className="h-3 w-3" />}
                {opt.label}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{opt.desc}</div>
            </button>
          );
        })}
      </div>

      {rating && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note…"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => void saveNote()}
            disabled={saving}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[10px] font-data uppercase tracking-wider hover:bg-accent disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {savedAt && (
        <p className="mt-1.5 text-[10px] font-data uppercase tracking-wider text-trade-green">
          Feedback saved
        </p>
      )}
    </div>
  );
}

export function computeAnalysisAccuracy(items: { feedback_rating: string | null }[]) {
  const rated = items.filter((i) => i.feedback_rating);
  const total = rated.length;
  if (total === 0) return { total: 0, accuracyPct: 0 };
  const accurate = rated.filter(
    (i) =>
      i.feedback_rating === "spot_on" ||
      i.feedback_rating === "partially_correct" ||
      i.feedback_rating === "mis_executed",
  ).length;
  return { total, accuracyPct: Math.round((accurate / total) * 100) };
}