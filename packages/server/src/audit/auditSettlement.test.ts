import { describe, expect, it } from "vitest";
import { settleIndexesFromExtract } from "./auditSettlement.js";
import type { ChapterExtract } from "./auditExtractSchema.js";

describe("settleIndexesFromExtract", () => {
  it("creates character and applies foreshadow ops", () => {
    const extract: ChapterExtract = {
      chapter: { auditedAt: "2026-01-01T00:00:00.000Z" },
      gistL1: "测试摘要",
      humanAuditReport: "",
      entities: {
        characters: [{ name: "张三", role: "主角" }],
        events: [{ summary: "张三入门", participants: ["张三"] }]
      },
      hookOps: [{ title: "神秘玉佩", action: "plant", progress: "首次提及" }],
      consistencyChecks: [],
      impactAnalysis: []
    };
    const indexes = {
      characters: { characters: [], updatedAt: "", version: 2 },
      places: { places: [], hiddenNames: [], updatedAt: "" },
      orgs: { orgs: [], hiddenNames: [], updatedAt: "" },
      foreshadows: { version: 1 as const, updatedAt: "", foreshadows: [], hiddenIds: [] },
      ledger: { openLoops: [], closedLoops: [], updatedAt: "" },
      timeline: { chapters: [], events: [], compressedRanges: [], compressionSuggestions: [], updatedAt: "" },
      progress: { version: 1, updatedAt: "", items: [] }
    };
    const { report } = settleIndexesFromExtract({
      extract,
      filename: "0001_test.md",
      chapterNum: 1,
      indexes
    });
    expect(report.characters.created).toBe(1);
    expect(report.foreshadows.applied).toBeGreaterThan(0);
  });
});
