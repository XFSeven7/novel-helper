import { describe, expect, it } from "vitest";
import { parseTrainingGradingJson } from "./parseGrading.js";

const sample = JSON.stringify({
  overallScore: 72,
  strengths: ["a"],
  improvements: ["b"],
  exampleRewrite: "x",
  nextStep: "y"
});

describe("parseTrainingGradingJson", () => {
  it("parses bare JSON", () => {
    const r = parseTrainingGradingJson(sample);
    expect(r.overallScore).toBe(72);
  });

  it("parses JSON inside markdown fence", () => {
    const r = parseTrainingGradingJson("```json\n" + sample + "\n```");
    expect(r.overallScore).toBe(72);
  });
});
