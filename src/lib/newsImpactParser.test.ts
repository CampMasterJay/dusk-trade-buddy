import { describe, it, expect } from "vitest";
import { parseImpactScores } from "./newsImpactParser";

describe("parseImpactScores", () => {
  it("parses a plain JSON array", () => {
    const raw = JSON.stringify([
      { id: "a1", level: "high", sentiment: "bullish", rationale: "FOMC rate cut" },
      { id: "a2", level: "low", sentiment: "neutral", rationale: "Earnings beat" },
    ]);
    const r = parseImpactScores(raw);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: "a1", level: "high", sentiment: "bullish" });
  });

  it("strips ```json fences before parsing", () => {
    const raw = "```json\n[{\"id\":\"x\",\"level\":\"medium\",\"sentiment\":\"bearish\",\"rationale\":\"\"}]\n```";
    const r = parseImpactScores(raw);
    expect(r).toHaveLength(1);
    expect(r[0].level).toBe("medium");
  });

  it("extracts a JSON block surrounded by commentary", () => {
    const raw =
      'Here are the scores: [{"id":"x","level":"high","sentiment":"bullish","rationale":""}] hope that helps!';
    const r = parseImpactScores(raw);
    expect(r).toHaveLength(1);
  });

  it("accepts an object envelope with a scores array", () => {
    const raw = JSON.stringify({
      scores: [{ id: "y", level: "low", sentiment: "neutral", rationale: "" }],
    });
    const r = parseImpactScores(raw);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("y");
  });

  it("drops malformed entries (bad enum, missing id)", () => {
    const raw = JSON.stringify([
      { id: "good", level: "high", sentiment: "bullish", rationale: "" },
      { id: "bad-level", level: "extreme", sentiment: "bullish", rationale: "" },
      { level: "high", sentiment: "bullish", rationale: "no id" },
    ]);
    const r = parseImpactScores(raw);
    expect(r.map((x) => x.id)).toEqual(["good"]);
  });

  it("returns [] for non-JSON garbage", () => {
    expect(parseImpactScores("totally not json")).toEqual([]);
    expect(parseImpactScores("")).toEqual([]);
  });
});