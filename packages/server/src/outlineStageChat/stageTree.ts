import type { OutlineStageNode } from "../outlineStore.js";

export type FoundStageNode = {
  node: OutlineStageNode;
  path: OutlineStageNode[];
  siblings: OutlineStageNode[];
};

export function stageRoots(stages: OutlineStageNode[] | undefined): OutlineStageNode[] {
  return Array.isArray(stages) ? stages : [];
}

export function findStageNode(roots: OutlineStageNode[], id: string): FoundStageNode | null {
  const walk = (
    nodes: OutlineStageNode[],
    path: OutlineStageNode[]
  ): FoundStageNode | null => {
    for (const node of nodes) {
      const nextPath = [...path, node];
      if (node.id === id) {
        return { node, path: nextPath, siblings: nodes };
      }
      const children = node.children ?? [];
      if (children.length) {
        const found = walk(children, nextPath);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(roots, []);
}

export function updateStageNodeInTree(
  roots: OutlineStageNode[],
  stageId: string,
  patch: Partial<Pick<OutlineStageNode, "label" | "note" | "chatTurns">>
): OutlineStageNode[] {
  const mapNodes = (nodes: OutlineStageNode[]): OutlineStageNode[] =>
    nodes.map((node) => {
      if (node.id === stageId) {
        const next = { ...node, ...patch };
        if (patch.chatTurns !== undefined && (!patch.chatTurns || patch.chatTurns.length === 0)) {
          const { chatTurns: _c, ...rest } = next;
          return rest;
        }
        return next;
      }
      const children = node.children;
      if (!children?.length) return node;
      return { ...node, children: mapNodes(children) };
    });
  return mapNodes(roots);
}
