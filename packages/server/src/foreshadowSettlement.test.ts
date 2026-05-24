import { describe, expect, it } from "vitest";
import {
  applyHookOpsToForeshadowsIndex,
  buildForeshadowHealthReport,
  extractSeedExcerpt,
  findMatchingForeshadowId,
  makeForeshadowStableId,
  parseHookOpsFromRun,
  settlerLiteHookOps,
  settleHookOps
} from "./foreshadowSettlement.js";
import type { ForeshadowsIndex } from "./fsStore.js";

function emptyIndex(): ForeshadowsIndex {
  return { version: 1, updatedAt: "", foreshadows: [], hiddenIds: [] };
}

describe("parseHookOpsFromRun", () => {
  it("parses hookOps", () => {
    const ops = parseHookOpsFromRun({
      hookOps: [{ hookId: "a", title: "玉佩", action: "advance", progress: "提及来历" }]
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]?.action).toBe("advance");
  });

  it("falls back to ledgerUpdates", () => {
    const ops = parseHookOpsFromRun({
      ledgerUpdates: {
        openLoops: [{ title: "神秘来信" }],
        closedLoops: [{ title: "旧债", progress: "已还清" }]
      }
    });
    expect(ops.some((o) => o.action === "mention" || o.action === "advance")).toBe(true);
    expect(ops.some((o) => o.action === "resolve")).toBe(true);
  });
});

describe("applyHookOpsToForeshadowsIndex", () => {
  it("plants and resolves with stable id", () => {
    let idx = emptyIndex();
    idx = applyHookOpsToForeshadowsIndex(
      idx,
      [{ title: "失踪的玉佩", action: "plant", progress: "主角发现缺口" }],
      3,
      "2026-01-01T00:00:00.000Z"
    );
    expect(idx.foreshadows).toHaveLength(1);
    expect(idx.foreshadows[0]?.status).toBe("open");
    expect(idx.foreshadows[0]?.firstChapter).toBe(3);

    const id = idx.foreshadows[0]!.id;
    idx = applyHookOpsToForeshadowsIndex(
      idx,
      [{ hookId: id, action: "resolve", progress: "玉佩物归原主" }],
      10,
      "2026-01-02T00:00:00.000Z"
    );
    expect(idx.foreshadows[0]?.status).toBe("closed");
    expect(idx.foreshadows[0]?.chapterActivity?.["10"]).toBe("玉佩物归原主");
  });

  it("merges similar titles", () => {
    let idx = emptyIndex();
    idx.foreshadows.push({
      id: makeForeshadowStableId("失踪的玉佩之谜"),
      title: "失踪的玉佩之谜",
      status: "open",
      updatedAt: ""
    });
    idx = applyHookOpsToForeshadowsIndex(
      idx,
      [{ title: "失踪玉佩", action: "mention" }],
      5,
      "2026-01-01T00:00:00.000Z"
    );
    expect(idx.foreshadows).toHaveLength(1);
    expect(idx.foreshadows[0]?.lastChapter).toBe(5);
  });

  it("does not reopen closed on plant", () => {
    let idx = emptyIndex();
    const id = makeForeshadowStableId("旧线");
    idx.foreshadows.push({ id, title: "旧线", status: "closed", updatedAt: "" });
    idx = applyHookOpsToForeshadowsIndex(idx, [{ title: "旧线", action: "plant" }], 2, "t");
    expect(idx.foreshadows[0]?.status).toBe("closed");
  });
});

describe("settleHookOps", () => {
  it("keeps resolve over mention for same key", () => {
    const out = settleHookOps([
      { title: "A", action: "mention" },
      { title: "A", action: "resolve", progress: "完结" }
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.action).toBe("resolve");
  });
});

describe("findMatchingForeshadowId", () => {
  it("matches by similarity", () => {
    const id = findMatchingForeshadowId("玉佩下落", undefined, [
      { id: "x", title: "玉佩的下落之谜", status: "open", updatedAt: "" }
    ]);
    expect(id).toBe("x");
  });
});

describe("settlerLiteHookOps", () => {
  it("rejects garbage plant titles", () => {
    const { ops, decisions } = settlerLiteHookOps([{ title: "伏笔", action: "plant" }], []);
    expect(ops).toHaveLength(0);
    expect(decisions.some((d) => d.action === "rejected")).toBe(true);
  });

  it("remaps duplicate plant to mention", () => {
    const existing = [{ id: "h1", title: "神秘玉佩", status: "open" as const, updatedAt: "" }];
    const { ops } = settlerLiteHookOps([{ title: "神秘玉佩", action: "plant" }], existing);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.action).toBe("mention");
    expect(ops[0]?.hookId).toBe("h1");
  });
});

describe("buildForeshadowHealthReport", () => {
  it("marks stale foreshadows", () => {
    const report = buildForeshadowHealthReport(
      {
        version: 1,
        updatedAt: "",
        hiddenIds: [],
        foreshadows: [
          { id: "a", title: "玉佩", status: "open", lastChapter: 2, updatedAt: "" },
          { id: "b", title: "旧线", status: "closed", lastChapter: 10, updatedAt: "" }
        ]
      },
      10,
      3
    );
    expect(report.summary.stale).toBe(1);
    expect(report.items.find((x) => x.id === "a")?.stale).toBe(true);
  });
});

describe("extractSeedExcerpt", () => {
  it("returns excerpt around title keyword", () => {
    const text = "前文铺垫很长。他低头看见玉佩缺了一角，心中一沉。后文继续。";
    const ex = extractSeedExcerpt(text, "玉佩缺角");
    expect(ex.includes("玉佩")).toBe(true);
  });
});
