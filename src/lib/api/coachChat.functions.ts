import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
  statsContext: z.string().max(2000).optional(),
});

export const coachChat = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI is not configured on the server." };
    }

    const system =
      "You are EdgeCoach, a professional futures trading coach. " +
      "You are helping a trader working on a $100 to $1,000 challenge trading micro futures. " +
      "You have access to their trade stats:\n\n" +
      (data.statsContext?.trim() || "(No trades logged yet.)") +
      "\n\nBe direct, specific, and data-driven. No generic advice — " +
      "personalize everything to their data. Keep responses concise (3-6 short paragraphs " +
      "or a short list). Use plain markdown. Reference specific numbers from their stats " +
      "whenever possible. If the data is too thin to answer, say so and tell them what to log.";

    try {
      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: system },
              ...data.messages.map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429)
          return { ok: false as const, error: "Coach is rate-limited. Try again in a moment." };
        if (res.status === 402)
          return { ok: false as const, error: "AI credits exhausted. Add credits in workspace settings." };
        return {
          ok: false as const,
          error: `Coach failed (${res.status}). ${txt.slice(0, 160)}`,
        };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const reply = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!reply) {
        return { ok: false as const, error: "Coach returned an empty response." };
      }
      return { ok: true as const, reply };
    } catch (err) {
      return {
        ok: false as const,
        error: `Coach error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  });