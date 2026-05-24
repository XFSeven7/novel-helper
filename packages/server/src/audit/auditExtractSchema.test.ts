import { describe, expect, it } from "vitest";
import { parseChapterExtract } from "./auditExtractSchema.js";

describe("parseChapterExtract", () => {
  it("accepts minimal valid extract", () => {
    const ex = parseChapterExtract(JSON.stringify({ gistL1: "摘要", entities: { characters: [], events: [] } }));
    expect(ex.gistL1).toBe("摘要");
  });

  it("rejects oversized hookOps", () => {
    const ops = Array.from({ length: 21 }, () => ({ action: "mention" as const, title: "x" }));
    expect(() =>
      parseChapterExtract(JSON.stringify({ hookOps: ops, entities: { characters: [], events: [] } }))
    ).toThrow(/校验失败/);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseChapterExtract("{not json")).toThrow();
  });
});
