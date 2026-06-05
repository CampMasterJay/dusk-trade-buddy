import { useEffect, useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/AuthProvider";
import {
  EMOTIONS,
  type EmotionState,
  type TradeJournal,
  getJournalByTradeId,
  upsertJournal,
} from "@/lib/journalService";
import { cn } from "@/lib/utils";

interface Props {
  tradeId: string;
  onSaved?: () => void;
}

export function JournalTab({ tradeId, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [journal, setJournal] = useState<TradeJournal | null>(null);

  const [preThoughts, setPreThoughts] = useState("");
  const [executionQuality, setExecutionQuality] = useState<number>(0);
  const [emotion, setEmotion] = useState<EmotionState | "">("");
  const [postReflection, setPostReflection] = useState("");
  const [wouldRepeat, setWouldRepeat] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getJournalByTradeId(tradeId).then(({ data }) => {
      if (!active) return;
      if (data) {
        setJournal(data);
        setPreThoughts(data.pre_thoughts ?? "");
        setExecutionQuality(data.execution_quality ?? 0);
        setEmotion((data.emotion as EmotionState) ?? "");
        setPostReflection(data.post_reflection ?? "");
        setWouldRepeat(data.would_repeat ?? true);
      } else {
        setJournal(null);
        setPreThoughts("");
        setExecutionQuality(0);
        setEmotion("");
        setPostReflection("");
        setWouldRepeat(true);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [tradeId]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { data, error } = await upsertJournal({
      trade_id: tradeId,
      user_id: user.id,
      pre_thoughts: preThoughts.trim() || null,
      execution_quality: executionQuality > 0 ? executionQuality : null,
      emotion: emotion || null,
      post_reflection: postReflection.trim() || null,
      would_repeat: wouldRepeat,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setJournal(data);
    toast.success("Journal saved");
    onSaved?.();
  };

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-2">
      {/* Pre-trade thoughts */}
      <div className="space-y-2">
        <Label htmlFor="pre-thoughts" className="text-xs font-data uppercase tracking-wider text-muted-foreground">
          Why did I take this setup?
        </Label>
        <Textarea
          id="pre-thoughts"
          value={preThoughts}
          onChange={(e) => setPreThoughts(e.target.value)}
          placeholder="Pre-trade thoughts..."
          rows={3}
          maxLength={2000}
        />
      </div>

      {/* Execution quality */}
      <div className="space-y-2">
        <Label className="text-xs font-data uppercase tracking-wider text-muted-foreground">
          How well did I execute?
        </Label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setExecutionQuality(n === executionQuality ? 0 : n)}
              className="p-1"
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
            >
              <Star
                className={cn(
                  "h-7 w-7 transition-colors",
                  n <= executionQuality
                    ? "fill-trade-amber text-trade-amber"
                    : "text-muted-foreground/40",
                )}
              />
            </button>
          ))}
          {executionQuality > 0 && (
            <span className="ml-2 text-xs font-data text-muted-foreground">
              {executionQuality}/5
            </span>
          )}
        </div>
      </div>

      {/* Emotion */}
      <div className="space-y-2">
        <Label className="text-xs font-data uppercase tracking-wider text-muted-foreground">
          Emotional state
        </Label>
        <div className="flex flex-wrap gap-2">
          {EMOTIONS.map((em) => {
            const active = emotion === em;
            const isNegative = em === "Anxious" || em === "Impatient" || em === "Revenge" || em === "FOMO";
            return (
              <button
                key={em}
                type="button"
                onClick={() => setEmotion(active ? "" : em)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-data uppercase tracking-wider border transition-colors",
                  active
                    ? isNegative
                      ? "bg-trade-red/15 border-trade-red/50 text-trade-red"
                      : "bg-trade-green/15 border-trade-green/50 text-trade-green"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {em}
              </button>
            );
          })}
        </div>
      </div>

      {/* Post-trade reflection */}
      <div className="space-y-2">
        <Label htmlFor="post-reflection" className="text-xs font-data uppercase tracking-wider text-muted-foreground">
          What did I learn?
        </Label>
        <Textarea
          id="post-reflection"
          value={postReflection}
          onChange={(e) => setPostReflection(e.target.value)}
          placeholder="Post-trade reflection..."
          rows={3}
          maxLength={2000}
        />
      </div>

      {/* Would repeat */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
        <div>
          <div className="text-sm font-data text-foreground">Would take again?</div>
          <div className="text-xs text-muted-foreground font-data mt-0.5">
            {wouldRepeat ? "Yes — repeatable setup" : "No — avoid in the future"}
          </div>
        </div>
        <Switch checked={wouldRepeat} onCheckedChange={setWouldRepeat} />
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-trade-green text-background hover:bg-trade-green/90 font-data"
      >
        {saving ? "Saving..." : journal ? "Update journal" : "Save journal"}
      </Button>

      {journal && (
        <p className="text-[10px] text-center uppercase tracking-wider font-data text-muted-foreground">
          Last updated {new Date(journal.updated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}