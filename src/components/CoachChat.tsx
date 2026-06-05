import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send, Sparkles, Trash2, X, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useUserSettings } from "@/hooks/useUserSettings";
import { coachChat } from "@/lib/api/coachChat.functions";
import { getTradeStats, type TradeStats } from "@/lib/tradeService";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const QUICK_PROMPTS = [
  "Review my last 5 trades",
  "Why am I losing?",
  "Is my win rate good enough?",
  "What should I focus on this week?",
  "Am I overtrading?",
];

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function buildStatsContext(
  stats: TradeStats | null,
  balance: number | null,
): string {
  if (!stats) return "";
  const wr = (stats.winRate * 100).toFixed(1);
  const lines = [
    balance != null ? `Current balance: ${fmtUsd(balance)} (target $1,000)` : null,
    `Total trades: ${stats.totalTrades} (wins ${stats.wins}, losses ${stats.losses})`,
    `Win rate: ${wr}%`,
    `Total PnL: ${fmtUsd(stats.totalPnl)} | Total R: ${stats.totalR.toFixed(2)}R`,
    `Average win: ${fmtUsd(stats.avgWin)} | Average loss: ${fmtUsd(stats.avgLoss)}`,
    `Expected value/trade: ${fmtUsd(stats.ev)}`,
    `Largest win: ${fmtUsd(stats.largestWin)} | Largest loss: ${fmtUsd(stats.largestLoss)}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function renderMarkdown(text: string) {
  // Tiny renderer: paragraphs + bullets + bold
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let buf: string[] = [];
  const flushP = () => {
    if (buf.length === 0) return;
    const joined = buf.join(" ");
    out.push(
      <p key={out.length} className="leading-relaxed">
        {formatInline(joined)}
      </p>,
    );
    buf = [];
  };
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={out.length} className="ml-4 list-disc space-y-1">
        {bullets.map((b, i) => (
          <li key={i}>{formatInline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushP();
      flushBullets();
      continue;
    }
    const m = line.match(/^[-*]\s+(.*)$/);
    if (m) {
      flushP();
      bullets.push(m[1]);
    } else {
      flushBullets();
      buf.push(line);
    }
  }
  flushP();
  flushBullets();
  return out;
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function CoachChat() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const chat = useServerFn(coachChat);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    void getTradeStats(user.id).then(({ data }) => {
      if (data) setStats(data);
    });
  }, [open, user?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  const statsContext = useMemo(
    () =>
      buildStatsContext(
        stats,
        settings?.current_balance != null
          ? Number(settings.current_balance)
          : null,
      ),
    [stats, settings?.current_balance],
  );

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await chat({
        data: {
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          statsContext,
        },
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: res.reply },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed.");
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
  }

  if (!user) return null;

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open EdgeCoach chat"
        className="fixed bottom-20 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-trade-green text-background shadow-[0_10px_30px_-10px_rgba(34,197,94,0.6)] ring-1 ring-trade-green/40 transition hover:scale-105 hover:bg-trade-green/90 md:bottom-6"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-1 ring-trade-green">
          <Sparkles className="h-2.5 w-2.5 text-trade-green" />
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[85vh] flex-col gap-0 rounded-t-2xl border-border bg-card p-0"
        >
          <SheetHeader className="flex-row items-center justify-between gap-2 border-b border-border px-4 py-3 text-left">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-trade-green/15 text-trade-green">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <SheetTitle className="text-sm font-bold font-data uppercase tracking-[2px]">
                  EdgeCoach
                </SheetTitle>
                <p className="text-[10px] font-data uppercase tracking-wider text-muted-foreground">
                  {stats
                    ? `${stats.totalTrades} trades · ${(stats.winRate * 100).toFixed(0)}% WR`
                    : "Personal trading coach"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-data uppercase tracking-wider text-muted-foreground hover:bg-accent"
                  aria-label="Clear chat"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </SheetHeader>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-trade-green/30 bg-trade-green/5 p-4">
                  <p className="text-sm leading-relaxed">
                    Hey — I'm <strong>EdgeCoach</strong>. I have access to your
                    trade stats and I'll keep it direct. Pick a prompt below or
                    ask me anything.
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-data uppercase tracking-[2px] text-muted-foreground">
                    Quick prompts
                  </p>
                  <div className="flex flex-col gap-2">
                    {QUICK_PROMPTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => void send(p)}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:border-trade-green/40 hover:bg-trade-green/5"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-trade-green px-3.5 py-2 text-sm text-background">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="space-y-2 text-sm text-foreground">
                  {renderMarkdown(m.content)}
                </div>
              ),
            )}

            {loading && (
              <div className="flex items-center gap-2 text-xs font-data uppercase tracking-wider text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-trade-green" />
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-trade-green [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-trade-green [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-trade-green" />
                </span>
                <span>EdgeCoach is thinking…</span>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-trade-red/40 bg-trade-red/10 p-3 text-xs text-trade-red">
                {error}
              </div>
            )}
          </div>

          {/* Quick prompts strip (when chat has messages) */}
          {messages.length > 0 && (
            <div className="border-t border-border px-3 py-2">
              <div className="flex gap-1.5 overflow-x-auto">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void send(p)}
                    disabled={loading}
                    className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:border-trade-green/40 hover:bg-trade-green/5 hover:text-foreground disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 border-t border-border p-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask EdgeCoach…"
              rows={1}
              className="min-h-[40px] max-h-32 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-trade-green/50"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-trade-green text-background hover:bg-trade-green/90 disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}