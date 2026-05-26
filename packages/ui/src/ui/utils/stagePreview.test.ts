import { describe, expect, it } from "vitest";
import {
  buildStagePreviewNumberMap,
  buildStagePreviewSections,
  isStagePreviewSectionHidden
} from "./stagePreview";
import type { OutlineStageNode } from "./outlineStageTree";

const tree: OutlineStageNode[] = [
  {
    id: "a",
    label: "第一幕",
    note: "幕备注",
    children: [
      { id: "a1", label: "起", note: "起备注", children: [] },
      {
        id: "a2",
        label: "承",
        children: [{ id: "a2a", label: "深", note: "深备注", children: [] }]
      }
    ]
  },
  { id: "b", label: "第二幕", children: [] }
];

describe("buildStagePreviewSections", () => {
  it("dfs order with hierarchical numbers", () => {
    const sections = buildStagePreviewSections(tree);
    expect(sections.map((s) => s.number)).toEqual(["1", "1.1", "1.2", "1.2.1", "2"]);
    expect(sections[0]!.note).toBe("幕备注");
    expect(sections[2]!.number).toBe("1.2");
    expect(sections[3]!.depth).toBe(2);
  });

  it("empty label gets default title", () => {
    const sections = buildStagePreviewSections([{ id: "x", label: "", children: [] }]);
    expect(sections[0]!.label).toBe("未命名阶段");
  });
});

describe("isStagePreviewSectionHidden", () => {
  it("hides descendants when ancestor collapsed", () => {
    const sections = buildStagePreviewSections(tree);
    const child = sections.find((s) => s.nodeId === "a1")!;
    expect(child.ancestorIds).toEqual(["a"]);
    expect(isStagePreviewSectionHidden(child, new Set(["a"]))).toBe(true);
    expect(isStagePreviewSectionHidden(child, new Set())).toBe(false);
  });
});

describe("buildStagePreviewNumberMap", () => {
  it("maps nodeId to hierarchical number", () => {
    const sections = buildStagePreviewSections(tree);
    const map = buildStagePreviewNumberMap(sections);
    expect(map.get("a")).toBe("1");
    expect(map.get("a1")).toBe("1.1");
    expect(map.get("a2a")).toBe("1.2.1");
  });
});
