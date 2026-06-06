import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OutlineStageNode } from "../../api";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { appConfirm } from "../../dialog/dialog";
import {
  findStageNode,
  insertChildStage,
  insertRootStage,
  insertSiblingStage,
  pickSelectionAfterDelete,
  removeStageNode,
  reorderStageSibling,
  collectExpandableStageIds,
  stageRoots,
  updateStageNode
} from "../../utils/outlineStageTree";
import { StagePreviewModal } from "./StagePreviewModal";

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 8;

type Props = {
  bookId: string;
  stages: OutlineStageNode[] | undefined;
  disabled: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStagesChange: (stages: OutlineStageNode[]) => void;
  onSelectionAfterDelete: (id: string | null) => void;
  highlightIds?: string[];
  ensureExpandedIds?: string[];
};

type DragSession = {
  nodeId: string;
  pointerId: number;
  timer: number | null;
  active: boolean;
  moved: boolean;
};

export function OutlineStageTree({
  bookId,
  stages: stagesProp,
  disabled,
  selectedId,
  onSelect,
  onStagesChange,
  onSelectionAfterDelete,
  highlightIds = [],
  ensureExpandedIds = []
}: Props) {
  const roots = stageRoots(stagesProp);
  const storageKey = `novel-helper-stage-tree-expanded:${bookId}`;

  const [expandedIds, setExpandedIds] = useLocalStorageState<string[]>({
    key: storageKey,
    defaultValue: []
  });

  const highlightSet = useMemo(() => new Set(highlightIds), [highlightIds]);

  useEffect(() => {
    if (!ensureExpandedIds.length) return;
    setExpandedIds((prev) => {
      const set = new Set(prev);
      for (const id of ensureExpandedIds) set.add(id);
      return [...set];
    });
  }, [ensureExpandedIds, setExpandedIds]);

  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);
  const expandableIds = useMemo(() => collectExpandableStageIds(roots), [roots]);
  const allExpanded =
    expandableIds.length > 0 && expandableIds.every((id) => expandedSet.has(id));

  const handleExpandAll = useCallback(() => {
    setExpandedIds(expandableIds);
  }, [expandableIds, setExpandedIds]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds([]);
  }, [setExpandedIds]);

  const toggleExpandAll = useCallback(() => {
    if (allExpanded) handleCollapseAll();
    else handleExpandAll();
  }, [allExpanded, handleCollapseAll, handleExpandAll]);

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

  const [previewOpen, setPreviewOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropInsertAt, setDropInsertAt] = useState<number | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const dragSessionRef = useRef<DragSession | null>(null);
  const dropInsertAtRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const rootsRef = useRef(roots);
  rootsRef.current = roots;

  useEffect(() => {
    if (!renamingId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  const applyStages = useCallback(
    (next: OutlineStageNode[]) => {
      onStagesChange(next.length ? next : []);
    },
    [onStagesChange]
  );

  const dragContext = useMemo(() => {
    if (!draggingId) return null;
    const found = findStageNode(roots, draggingId);
    if (!found) return null;
    return {
      draggingId,
      siblingIds: found.siblings.map((s) => s.id)
    };
  }, [draggingId, roots]);

  const computeDropInsertAt = useCallback((clientY: number, siblingIds: string[]) => {
    for (let i = 0; i < siblingIds.length; i++) {
      const el = rowRefs.current.get(siblingIds[i]!);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return siblingIds.length;
  }, []);

  const clearDragSession = useCallback(() => {
    const session = dragSessionRef.current;
    if (session?.timer) window.clearTimeout(session.timer);
    dragSessionRef.current = null;
    setDraggingId(null);
    setDropInsertAt(null);
    dropInsertAtRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const finishDrag = useCallback(
    (nodeId: string) => {
      const insertAt = dropInsertAtRef.current;
      clearDragSession();
      if (insertAt == null) return;
      const next = reorderStageSibling(rootsRef.current, nodeId, insertAt);
      if (next) applyStages(next);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    },
    [clearDragSession, applyStages]
  );


  const startDrag = useCallback(
    (nodeId: string, clientY: number) => {
      const session = dragSessionRef.current;
      if (!session || session.nodeId !== nodeId) return;
      session.active = true;
      setDraggingId(nodeId);
      onSelect(nodeId);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      const found = findStageNode(rootsRef.current, nodeId);
      if (!found) return;
      const siblingIds = found.siblings.map((s) => s.id);
      const insertAt = computeDropInsertAt(clientY, siblingIds);
      dropInsertAtRef.current = insertAt;
      setDropInsertAt(insertAt);
    },
    [computeDropInsertAt, onSelect]
  );

  const handleRowPointerDown = (e: React.PointerEvent, node: OutlineStageNode) => {
    if (disabled || renamingId || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".outlineStageTreeAct, .outlineStageTreeRenameInput")) return;

    const startY = e.clientY;
    const session: DragSession = {
      nodeId: node.id,
      pointerId: e.pointerId,
      timer: null,
      active: false,
      moved: false
    };
    dragSessionRef.current = session;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== session.pointerId) return;
      const sessionLive = dragSessionRef.current;
      if (!sessionLive) return;

      if (!sessionLive.active) {
        if (Math.abs(ev.clientY - startY) > MOVE_CANCEL_PX) {
          sessionLive.moved = true;
          if (sessionLive.timer) {
            window.clearTimeout(sessionLive.timer);
            sessionLive.timer = null;
          }
        }
        return;
      }

      ev.preventDefault();
      const found = findStageNode(rootsRef.current, sessionLive.nodeId);
      if (!found) return;
      const siblingIds = found.siblings.map((s) => s.id);
      const insertAt = computeDropInsertAt(ev.clientY, siblingIds);
      dropInsertAtRef.current = insertAt;
      setDropInsertAt(insertAt);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== session.pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      const sessionLive = dragSessionRef.current;
      if (sessionLive?.active) {
        finishDrag(sessionLive.nodeId);
      } else {
        clearDragSession();
      }
    };

    session.timer = window.setTimeout(() => {
      const sessionLive = dragSessionRef.current;
      if (!sessionLive || sessionLive.moved || sessionLive.nodeId !== node.id) return;
      const found = findStageNode(rootsRef.current, node.id);
      if (!found || found.siblings.length <= 1) return;
      startDrag(node.id, startY);
    }, LONG_PRESS_MS);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startRename = (node: OutlineStageNode) => {
    if (disabled || draggingId) return;
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
    if (suppressClickRef.current || draggingId) return;
    onSelect(node.id);
    if (hasChildren) toggleExpanded(node.id);
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
    if ((found.node.children ?? []).length > 0) return;
    const ok = await appConfirm({
      title: "删除阶段",
      message: "确定删除此阶段？",
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

  const renderNode = (node: OutlineStageNode, depth: number, siblingIndex: number, siblingCount: number) => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedSet.has(node.id);
    const selected = selectedId === node.id;
    const label = node.label?.trim() || "未命名阶段";
    const isRenaming = renamingId === node.id;
    const isDragging = draggingId === node.id;
    const isDropSibling = dragContext?.siblingIds.includes(node.id) ?? false;
    const showDropBefore =
      isDropSibling && dropInsertAt != null && dropInsertAt === siblingIndex && draggingId !== node.id;
    const showDropAfter =
      isDropSibling &&
      dropInsertAt != null &&
      dropInsertAt === siblingCount &&
      siblingIndex === siblingCount - 1 &&
      draggingId !== node.id;

    return (
      <div key={node.id} className="outlineStageTreeNode">
        {showDropBefore ? <div className="outlineStageTreeDropLine" aria-hidden /> : null}
        {siblingIndex > 0 && !showDropBefore ? (
          <div
            className="outlineStageTreeSiblingDivider"
            style={{ marginLeft: `${8 + depth * 14}px` }}
            aria-hidden
          />
        ) : null}
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(node.id, el);
            else rowRefs.current.delete(node.id);
          }}
          className={[
            "outlineStageTreeRow",
            selected ? "outlineStageTreeRow--selected" : "",
            highlightSet.has(node.id) ? "outlineStageTreeRow--highlight" : "",
            isDragging ? "outlineStageTreeRow--dragging" : "",
            !disabled && !isRenaming ? "outlineStageTreeRow--draggable" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onPointerDown={(e) => handleRowPointerDown(e, node)}
          onContextMenu={(e) => {
            if (draggingId) {
              e.preventDefault();
              return;
            }
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
              title={`${label}（右键改名，长按拖动排序）`}
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
                title={hasChildren ? "请先删除子阶段" : "删除"}
                disabled={hasChildren}
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
        {showDropAfter ? <div className="outlineStageTreeDropLine" aria-hidden /> : null}
        {hasChildren && expanded ? (
          <div className="outlineStageTreeChildren">
            {children.map((c, i) => renderNode(c, depth + 1, i, children.length))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={`outlineStageTree${draggingId ? " outlineStageTree--dragging" : ""}`}>
      <p className="muted outlineHint outlineHintCompact">
        点击展开/选中；右键改名；长按拖动同级排序；细纲在中间区编辑。
      </p>
      <div className="outlineStageTreeToolbar">
        <span className="outlineStageTreeToolbarTitle">阶段</span>
        <div className="outlineStageTreeToolbarActions">
          <button
            type="button"
            className="btnSort btnSortCompact"
            disabled={disabled || expandableIds.length === 0}
            title={allExpanded ? "收起全部阶段" : "展开全部阶段"}
            onClick={toggleExpandAll}
          >
            {allExpanded ? "收起" : "展开"}
          </button>
          <button
            type="button"
            className="btnSort btnSortCompact"
            disabled={disabled || roots.length === 0}
            onClick={() => setPreviewOpen(true)}
          >
            预览
          </button>
          <button type="button" className="btnSort btnSortCompact" disabled={disabled} onClick={handleAddRoot}>
            + 根阶段
          </button>
        </div>
      </div>
      <StagePreviewModal open={previewOpen} stages={stagesProp} onClose={() => setPreviewOpen(false)} />
      {roots.length ? (
        <div className="outlineStageTreeScroll" role="tree">
          {roots.map((node, i) => renderNode(node, 0, i, roots.length))}
        </div>
      ) : (
        <p className="muted outlineStageTreeEmpty">暂无阶段。点击「根阶段」或在规划向导中设计。</p>
      )}
    </div>
  );
}
