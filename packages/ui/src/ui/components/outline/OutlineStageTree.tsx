import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OutlineStageNode } from "../../api";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { appConfirm } from "../../dialog/dialog";
import {
  countDescendants,
  findStageNode,
  insertChildStage,
  insertRootStage,
  insertSiblingStage,
  pickSelectionAfterDelete,
  removeStageNode,
  stageRoots,
  updateStageNode
} from "../../utils/outlineStageTree";

type Props = {
  bookId: string;
  stages: OutlineStageNode[] | undefined;
  disabled: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStagesChange: (stages: OutlineStageNode[]) => void;
  onSelectionAfterDelete: (id: string | null) => void;
};

export function OutlineStageTree({
  bookId,
  stages: stagesProp,
  disabled,
  selectedId,
  onSelect,
  onStagesChange,
  onSelectionAfterDelete
}: Props) {
  const roots = stageRoots(stagesProp);
  const storageKey = `novel-helper-stage-tree-expanded:${bookId}`;

  const [expandedIds, setExpandedIds] = useLocalStorageState<string[]>({
    key: storageKey,
    defaultValue: []
  });

  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);

  const toggleExpanded = useCallback(
    (id: string) => {
      setExpandedIds((prev) => {
        const set = new Set(prev);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        return [...set];
      });
    },
    [setExpandedIds]
  );

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renamingId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  const startRename = (node: OutlineStageNode) => {
    if (disabled) return;
    setRenamingId(node.id);
    setRenameDraft(node.label?.trim() || "");
    onSelect(node.id);
  };

  const commitRename = (id: string) => {
    const label = renameDraft.trim();
    applyStages(updateStageNode(roots, id, { label }));
    setRenamingId(null);
    setRenameDraft("");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
  };

  const handleRowActivate = (node: OutlineStageNode, hasChildren: boolean) => {
    onSelect(node.id);
    if (hasChildren) toggleExpanded(node.id);
  };

  const applyStages = (next: OutlineStageNode[]) => {
    onStagesChange(next.length ? next : []);
  };

  const handleAddRoot = () => {
    const { roots: next, newId } = insertRootStage(roots);
    applyStages(next);
    setExpandedIds((prev) => (prev.includes(newId) ? prev : [...prev, newId]));
    onSelect(newId);
  };

  const handleAddChild = (parentId: string) => {
    const r = insertChildStage(roots, parentId);
    if (!r) return;
    applyStages(r.roots);
    setExpandedIds((prev) => (prev.includes(parentId) ? prev : [...prev, parentId]));
    onSelect(r.newId);
  };

  const handleAddSibling = (siblingId: string) => {
    const r = insertSiblingStage(roots, siblingId);
    if (!r) return;
    applyStages(r.roots);
    onSelect(r.newId);
  };

  const handleDelete = async (id: string) => {
    const found = findStageNode(roots, id);
    if (!found) return;
    const subCount = countDescendants(found.node);
    const ok = await appConfirm({
      title: "删除阶段",
      message:
        subCount > 0 ? `将同时删除 ${subCount} 个子阶段，是否继续？` : "确定删除此阶段？",
      confirmLabel: "删除",
      variant: "danger"
    });
    if (!ok) return;
    if (renamingId === id) cancelRename();
    const nextPick = pickSelectionAfterDelete(roots, id);
    const next = removeStageNode(roots, id);
    applyStages(next);
    onSelectionAfterDelete(selectedId === id ? nextPick : selectedId);
  };

  const renderNode = (node: OutlineStageNode, depth: number) => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedSet.has(node.id);
    const selected = selectedId === node.id;
    const label = node.label?.trim() || "未命名阶段";

    const isRenaming = renamingId === node.id;

    return (
      <div key={node.id} className="outlineStageTreeNode">
        <div
          className={`outlineStageTreeRow${selected ? " outlineStageTreeRow--selected" : ""}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onContextMenu={(e) => {
            e.preventDefault();
            startRename(node);
          }}
        >
          <button
            type="button"
            className={`outlineStageTreeToggle${hasChildren ? "" : " outlineStageTreeToggle--spacer"}`}
            disabled={!hasChildren}
            aria-label={expanded ? "收起" : "展开"}
            onClick={(e) => {
              e.stopPropagation();
              handleRowActivate(node, hasChildren);
            }}
          >
            {hasChildren ? (expanded ? "▾" : "▸") : ""}
          </button>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              className="outlineStageTreeRenameInput"
              value={renameDraft}
              disabled={disabled}
              aria-label="阶段名称"
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename(node.id);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={() => commitRename(node.id)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              type="button"
              className="outlineStageTreeLabelBtn"
              disabled={disabled}
              onClick={() => handleRowActivate(node, hasChildren)}
              title={`${label}（右键改名）`}
            >
              {label}
            </button>
          )}
          {!disabled ? (
            <span className="outlineStageTreeActions">
              <button
                type="button"
                className="outlineStageTreeAct"
                title="添加子阶段"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddChild(node.id);
                }}
              >
                +
              </button>
              <button
                type="button"
                className="outlineStageTreeAct"
                title="添加同级"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddSibling(node.id);
                }}
              >
                ⊕
              </button>
              <button
                type="button"
                className="outlineStageTreeAct outlineStageTreeAct--danger"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(node.id);
                }}
              >
                ×
              </button>
            </span>
          ) : null}
        </div>
        {hasChildren && expanded ? (
          <div className="outlineStageTreeChildren">{children.map((c) => renderNode(c, depth + 1))}</div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="outlineStageTree">
      <p className="muted outlineHint outlineHintCompact">点击展开/选中；右键改名；细纲在中间区编辑。</p>
      <div className="outlineStageTreeToolbar">
        <span className="outlineStageTreeToolbarTitle">阶段</span>
        <button type="button" className="btnSort" disabled={disabled} onClick={handleAddRoot}>
          + 根阶段
        </button>
      </div>
      {roots.length ? (
        <div className="outlineStageTreeScroll" role="tree">
          {roots.map((node) => renderNode(node, 0))}
        </div>
      ) : (
        <p className="muted outlineStageTreeEmpty">暂无阶段。点击「根阶段」或在规划向导中设计。</p>
      )}
    </div>
  );
}
