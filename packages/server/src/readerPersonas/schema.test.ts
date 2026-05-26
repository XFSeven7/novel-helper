import { describe, expect, it } from "vitest";
import { randomCommentsCapForChapter } from "./schema.js";

describe("randomCommentsCapForChapter", () => {
  it("stays within custom bounds", () => {
    for (let i = 0; i < 30; i++) {
      const n = randomCommentsCapForChapter(`seed-${i}`, 12, 14);
      expect(n).toBeGreaterThanOrEqual(12);
      expect(n).toBeLessThanOrEqual(14);
    }
  });

  it("same seed same value", () => {
    expect(randomCommentsCapForChapter("x", 10, 16)).toBe(randomCommentsCapForChapter("x", 10, 16));
  });
});
