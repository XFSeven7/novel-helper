import React, { useCallback, useMemo, useState } from "react";
import type { OutlineStageNode } from "../../api";
import { collectExpandableStageIds, stageRoots } from "../../utils/outlineStageTree";

type Props = {
  stages: OutlineStageNode[] | undefined;
  numberById: Map<string, string>;
  collapsedBranchIds: ReadonlySet<string>;
  activeId: string | null;
  onJump: (nodeId: string) => void;
};

export function StagePreviewNavTree({
  stages,
  numberById,
  collapsedBranchIds,
  activeId,
  onJump
}: Props) {
  const roots = stageRoots(stages);
  const expandableIds = useMemo(() => collectExpandableStageIds(roots), [roots]);
  const [expandedIds, setExpandedIds] = useState<string[]>(() => expandableIds);

  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return [...set];
    });
  }, []);

  const renderNode = (node: OutlineStageNode, depth: number, ancestorIds: string[]) => {
    if (ancestorIds.some((id) => collapsedBranchIds.has(id))) return null;

    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedSet.has(node.id);
    const branchCollapsed = collapsedBranchIds.has(node.id);
    const label = node.label?.trim() || "未命名阶段";
    const number = numberById.get(node.id) ?? "";
    const active = activeId === node.id;

    return (
      <div key={node.id} className="outlineStageTreeNode">
        <div
          className={[
            "outlineStageTreeRow",
            "stagePreviewNavRow",
            active ? "outlineStageTreeRow--selected" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <button
            type="button"
            className={`outlineStageTreeToggle${hasChildren ? "" : " outlineStageTreeToggle--spacer"}`}
            disabled={!hasChildren}
            aria-label={expanded ? "收起" : "展开"}
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpanded(node.id);
            }}
          >
            {hasChildren ? (expanded ? "▾" : "▸") : ""}
          </button>
          <button
            type="button"
            className="outlineStageTreeLabelBtn"
            onClick={() => onJump(node.id)}
            title={number ? `${number} ${label}` : label}
          >
            {number ? (
              <>
                <span className="stagePreviewSectionNumber">{number}</span> {label}
              </>
            ) : (
              label
            )}
          </button>
        </div>
        {hasChildren && expanded && !branchCollapsed ? (
          <div className="outlineStageTreeChildren">
            {children.map((c) => renderNode(c, depth + 1, [...ancestorIds, node.id]))}
          </div>
        ) : null}
      </div>
    );
  };

  if (!roots.length) {
    return <p className="muted stagePreviewNavEmpty">暂无阶段</p>;
  }

  return (
    <div className="stagePreviewNav" role="tree" aria-label="阶段预览导航">
      {roots.map((node) => renderNode(node, 0, []))}
    </div>
  );
}
