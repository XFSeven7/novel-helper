import { describe, expect, it } from "vitest";
import { computeCopybookStats, markCopybookChars } from "./copybookDiff.js";

describe("copybookDiff", () => {
  it("computes accuracy and error count", () => {
    const stats = computeCopybookStats("abc", "axc");
    expect(stats.errorCount).toBe(1);
    expect(stats.accuracy).toBeCloseTo(2 / 3);
  });

  it("marks per-char correctness", () => {
    expect(markCopybookChars("abc", "axc")).toEqual([
      { char: "a", ok: true },
      { char: "x", ok: false },
      { char: "c", ok: true }
    ]);
  });
});
