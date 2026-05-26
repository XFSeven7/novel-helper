import type { OutlineStageNode } from "./outlineStageTree";
import { stageRoots } from "./outlineStageTree";

export type StagePreviewSection = {
  nodeId: string;
  number: string;
  label: string;
  note: string;
  depth: number;
  /** 自根至父节点（不含自身）的 id 列表，用于判断祖先是否已折叠 */
  ancestorIds: string[];
};

export function buildStagePreviewSections(stages: OutlineStageNode[] | undefined): StagePreviewSection[] {
  const sections: StagePreviewSection[] = [];
  const walk = (
    nodes: OutlineStageNode[],
    depth: number,
    parentNumber: string | undefined,
    ancestorIds: string[]
  ) => {
    nodes.forEach((node, index) => {
      const number = parentNumber ? `${parentNumber}.${index + 1}` : String(index + 1);
      sections.push({
        nodeId: node.id,
        number,
        label: node.label?.trim() || "未命名阶段",
        note: node.note?.trim() ?? "",
        depth,
        ancestorIds
      });
      const children = node.children ?? [];
      if (children.length > 0) walk(children, depth + 1, number, [...ancestorIds, node.id]);
    });
  };
  walk(stageRoots(stages), 0, undefined, []);
  return sections;
}

/** 任一祖先在 collapsedIds 中则整节（含子孙块）不展示 */
export function isStagePreviewSectionHidden(
  section: StagePreviewSection,
  collapsedIds: ReadonlySet<string>
): boolean {
  return section.ancestorIds.some((id) => collapsedIds.has(id));
}

export function buildStagePreviewNumberMap(
  sections: StagePreviewSection[]
): Map<string, string> {
  return new Map(sections.map((s) => [s.nodeId, s.number]));
}
