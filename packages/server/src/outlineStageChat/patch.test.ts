import { describe, expect, it } from "vitest";
import type { OutlineIndex } from "../outlineStore.js";
import { applyStagePatch, parseStagePatchFromAssistant, stripStagePatchBlock } from "./patch.js";

describe("parseStagePatchFromAssistant", () => {
  it("parses fenced stagePatch and strips from display text", () => {
    const raw = [
      "好的，拆成三段：",
      "",
      "```stagePatch",
      JSON.stringify({
        currentNote: "总述",
        children: [{ label: "子A", note: "细纲A" }]
      }),
      "```"
    ].join("\n");
    const parsed = parseStagePatchFromAssistant(raw);
    expect(parsed.patch?.children).toHaveLength(1);
    expect(parsed.patch?.children?.[0]?.label).toBe("子A");
    expect(stripStagePatchBlock(raw)).not.toContain("stagePatch");
    expect(stripStagePatchBlock(raw)).toContain("好的，拆成三段");
  });

  it("returns null patch when block missing", () => {
    expect(parseStagePatchFromAssistant("仅讨论").patch).toBeNull();
  });
});

function miniOutline(stages: OutlineIndex["book"]["mainlineStages"]): OutlineIndex {
  return {
    version: 1,
    updatedAt: "t",
    book: { mainlineStages: stages },
    volumes: [],
    ungroupedFilenames: [],
    chapterPlans: {}
  };
}

describe("applyStagePatch", () => {
  it("creates children and updates current note", () => {
    const outline = miniOutline([{ id: "root", label: "R", children: [] }]);
    const { outline: next, createdIds, warnings } = applyStagePatch(outline, "root", {
      currentNote: "总述",
      children: [
        { label: "子1", note: "n1" },
        { label: "子2", note: "n2", children: [{ label: "孙", note: "sn" }] }
      ]
    });
    const root = next.book.mainlineStages?.[0];
    expect(root?.note).toBe("总述");
    expect(root?.children).toHaveLength(2);
    expect(root?.children?.[1]?.children?.[0]?.label).toBe("孙");
    expect(createdIds.length).toBe(3);
    expect(warnings).toEqual([]);
  });

  it("merges by id and deletes omitted siblings", () => {
    const outline = miniOutline([
      {
        id: "root",
        label: "R",
        children: [
          { id: "a", label: "旧A", note: "x", children: [] },
          { id: "b", label: "旧B", children: [] }
        ]
      }
    ]);
    const { outline: next } = applyStagePatch(outline, "root", {
      children: [{ id: "a", label: "新A", note: "y" }]
    });
    const kids = next.book.mainlineStages?.[0]?.children ?? [];
    expect(kids).toHaveLength(1);
    expect(kids[0]?.id).toBe("a");
    expect(kids[0]?.label).toBe("新A");
    expect(kids[0]?.note).toBe("y");
  });

  it("clears children when patch children is empty array", () => {
    const outline = miniOutline([
      {
        id: "root",
        label: "R",
        children: [{ id: "a", label: "A", children: [] }]
      }
    ]);
    const { outline: next } = applyStagePatch(outline, "root", { children: [] });
    expect(next.book.mainlineStages?.[0]?.children ?? []).toHaveLength(0);
  });
});
