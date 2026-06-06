/**
 * Pure parser for AI-returned news impact JSON. The model occasionally wraps
 * output in ```json fences or includes commentary — strip and parse safely.
 */

export type ParsedImpactScore = {
  id: string;
  level: "high" | "medium" | "low";
  sentiment: "bullish" | "bearish" | "neutral";
  rationale: string;
};

const LEVELS = new Set(["high", "medium", "low"]);
const SENTIMENTS = new Set(["bullish", "bearish", "neutral"]);

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Fall back to extracting the first {...} or [...] block.
    const match = raw.match(/[\[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function coerceScore(item: unknown): ParsedImpactScore | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : null;
  const level = typeof obj.level === "string" ? obj.level.toLowerCase() : null;
  const sentiment =
    typeof obj.sentiment === "string" ? obj.sentiment.toLowerCase() : null;
  const rationale = typeof obj.rationale === "string" ? obj.rationale : "";
  if (!id || !level || !sentiment) return null;
  if (!LEVELS.has(level) || !SENTIMENTS.has(sentiment)) return null;
  return {
    id,
    level: level as ParsedImpactScore["level"],
    sentiment: sentiment as ParsedImpactScore["sentiment"],
    rationale,
  };
}

export function parseImpactScores(raw: string): ParsedImpactScore[] {
  const cleaned = stripFences(raw);
  const parsed = tryParseJson(cleaned);
  if (!parsed) return [];
  // Accept either an array directly, or { scores: [...] }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { scores?: unknown }).scores)
      ? ((parsed as { scores: unknown[] }).scores)
      : [];
  return list.map(coerceScore).filter((x): x is ParsedImpactScore => x !== null);
}