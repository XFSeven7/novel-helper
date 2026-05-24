import { describe, expect, it } from "vitest";
import {
  collectStagePathLabels,
  findStageNode,
  insertChildStage,
  insertRootStage,
  insertSiblingStage,
  pickSelectionAfterDelete,
  removeStageNode,
  reorderStageSibling,
  updateStageNode,
  type OutlineStageNode
} from "./outlineStageTree";

const sample: OutlineStageNode[] = [
  {
    id: "a",
    label: "第一幕",
    children: [
      { id: "a1", label: "起", children: [] },
      { id: "a2", label: "承", children: [] }
    ]
  },
  { id: "b", label: "第二幕", children: [] }
];

describe("findStageNode", () => {
  it("finds nested node with path", () => {
    const found = findStageNode(sample, "a2");
    expect(found?.node.label).toBe("承");
    expect(found?.path.map((n) => n.id)).toEqual(["a", "a2"]);
  });
});

describe("updateStageNode", () => {
  it("updates nested note", () => {
    const next = updateStageNode(sample, "a1", { note: "细纲" });
    expect(findStageNode(next, "a1")?.node.note).toBe("细纲");
  });
});

describe("insertStageNode", () => {
  it("inserts root", () => {
    const { roots, newId } = insertRootStage(sample);
    expect(roots).toHaveLength(3);
    expect(findStageNode(roots, newId)).not.toBeNull();
  });

  it("inserts child", () => {
    const r = insertChildStage(sample, "a");
    expect(r).not.toBeNull();
    expect(findStageNode(r!.roots, "a")?.node.children).toHaveLength(3);
  });

  it("inserts sibling after", () => {
    const r = insertSiblingStage(sample, "a1");
    expect(r).not.toBeNull();
    const siblings = findStageNode(r!.roots, "a1")!.siblings;
    expect(siblings.map((n) => n.id)).toEqual(["a1", r!.newId, "a2"]);
  });
});

describe("removeStageNode", () => {
  it("removes subtree", () => {
    const next = removeStageNode(sample, "a");
    expect(next.map((n) => n.id)).toEqual(["b"]);
  });
});

describe("pickSelectionAfterDelete", () => {
  it("prefers previous sibling", () => {
    expect(pickSelectionAfterDelete(sample, "a2")).toBe("a1");
  });
});

describe("collectStagePathLabels", () => {
  it("returns breadcrumb labels", () => {
    expect(collectStagePathLabels(sample, "a2")).toEqual(["第一幕", "承"]);
  });
});

describe("reorderStageSibling", () => {
  it("moves root to end", () => {
    const next = reorderStageSibling(sample, "a", 2)!;
    expect(next.map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("moves nested sibling before previous", () => {
    const next = reorderStageSibling(sample, "a2", 0)!;
    const siblings = findStageNode(next, "a1")!.siblings;
    expect(siblings.map((n) => n.id)).toEqual(["a2", "a1"]);
  });

  it("no-op when dropping adjacent to self", () => {
    expect(reorderStageSibling(sample, "a1", 1)).toBe(sample);
  });
});
