export type OutlineStageNode = {
  id: string;
  label: string;
  note?: string;
  children?: OutlineStageNode[];
  chapterRange?: string;
};

export type FoundStageNode = {
  node: OutlineStageNode;
  parent: OutlineStageNode | null;
  siblings: OutlineStageNode[];
  index: number;
  path: OutlineStageNode[];
};

export function newStageId(): string {
  return `stage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyStageNode(partial?: Partial<OutlineStageNode>): OutlineStageNode {
  return {
    id: newStageId(),
    label: "",
    children: [],
    ...partial
  };
}

export function findStageNode(roots: OutlineStageNode[], id: string): FoundStageNode | null {
  const walk = (
    nodes: OutlineStageNode[],
    parent: OutlineStageNode | null,
    path: OutlineStageNode[]
  ): FoundStageNode | null => {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]!;
      const nextPath = [...path, node];
      if (node.id === id) {
        return { node, parent, siblings: nodes, index, path: nextPath };
      }
      const children = node.children ?? [];
      if (children.length) {
        const found = walk(children, node, nextPath);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(roots, null, []);
}

export function collectStagePathLabels(roots: OutlineStageNode[], id: string): string[] {
  const found = findStageNode(roots, id);
  if (!found) return [];
  return found.path.map((n) => n.label?.trim() || "未命名阶段");
}

export function updateStageNode(
  roots: OutlineStageNode[],
  id: string,
  patch: Partial<Pick<OutlineStageNode, "label" | "note">>
): OutlineStageNode[] {
  const mapNodes = (nodes: OutlineStageNode[]): OutlineStageNode[] =>
    nodes.map((node) => {
      if (node.id === id) {
        return { ...node, ...patch };
      }
      const children = node.children;
      if (!children?.length) return node;
      return { ...node, children: mapNodes(children) };
    });
  return mapNodes(roots);
}

export function insertRootStage(roots: OutlineStageNode[]): { roots: OutlineStageNode[]; newId: string } {
  const node = emptyStageNode();
  return { roots: [...roots, node], newId: node.id };
}

export function insertChildStage(
  roots: OutlineStageNode[],
  parentId: string
): { roots: OutlineStageNode[]; newId: string } | null {
  const node = emptyStageNode();
  let inserted = false;
  const mapNodes = (nodes: OutlineStageNode[]): OutlineStageNode[] =>
    nodes.map((n) => {
      if (n.id === parentId) {
        inserted = true;
        const children = [...(n.children ?? []), node];
        return { ...n, children };
      }
      const children = n.children;
      if (!children?.length) return n;
      return { ...n, children: mapNodes(children) };
    });
  const next = mapNodes(roots);
  return inserted ? { roots: next, newId: node.id } : null;
}

export function insertSiblingStage(
  roots: OutlineStageNode[],
  siblingId: string
): { roots: OutlineStageNode[]; newId: string } | null {
  const found = findStageNode(roots, siblingId);
  if (!found) return null;
  const node = emptyStageNode();
  if (!found.parent) {
    const next = [...roots];
    next.splice(found.index + 1, 0, node);
    return { roots: next, newId: node.id };
  }
  const parentId = found.parent.id;
  let inserted = false;
  const mapNodes = (nodes: OutlineStageNode[]): OutlineStageNode[] =>
    nodes.map((n) => {
      if (n.id === parentId) {
        inserted = true;
        const children = [...(n.children ?? [])];
        children.splice(found.index + 1, 0, node);
        return { ...n, children };
      }
      const children = n.children;
      if (!children?.length) return n;
      return { ...n, children: mapNodes(children) };
    });
  const next = mapNodes(roots);
  return inserted ? { roots: next, newId: node.id } : null;
}

export function countDescendants(node: OutlineStageNode): number {
  const children = node.children ?? [];
  return children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

export function removeStageNode(roots: OutlineStageNode[], id: string): OutlineStageNode[] {
  const filterNodes = (nodes: OutlineStageNode[]): OutlineStageNode[] =>
    nodes
      .filter((n) => n.id !== id)
      .map((n) => {
        const children = n.children;
        if (!children?.length) return n;
        return { ...n, children: filterNodes(children) };
      });
  return filterNodes(roots);
}

/** 删除后优先选中上一个同级，否则父级，否则 null */
export function pickSelectionAfterDelete(
  roots: OutlineStageNode[],
  deletedId: string
): string | null {
  const found = findStageNode(roots, deletedId);
  if (!found) return null;
  if (found.index > 0) return found.siblings[found.index - 1]!.id;
  if (found.parent) return found.parent.id;
  if (found.siblings.length > 1) return found.siblings[1]!.id;
  return null;
}

export function stageRoots(bookMainline: OutlineStageNode[] | undefined): OutlineStageNode[] {
  return bookMainline ?? [];
}
