import { describe, expect, it } from "vitest";
import { clampCommentsPerChapterRange, validateCommentsPerChapterRange } from "./commentsRange.js";

describe("commentsRange", () => {
  it("defaults to 10 and 16", () => {
    expect(clampCommentsPerChapterRange({})).toEqual({ min: 10, max: 16 });
  });

  it("clamps to 1..50", () => {
    expect(clampCommentsPerChapterRange({ min: 0, max: 99 })).toEqual({ min: 1, max: 50 });
  });

  it("validate rejects min > max", () => {
    expect(validateCommentsPerChapterRange({ min: 20, max: 10 })).toBe(false);
  });

  it("validate accepts valid range", () => {
    expect(validateCommentsPerChapterRange({ min: 8, max: 12 })).toBe(true);
  });
});
