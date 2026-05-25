import React, { useCallback, useEffect, useRef, useState } from "react";
import type { OutlineIndex, OutlineStageNode } from "../../api";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { clamp } from "../../utils/math";
import { collectStagePathLabels, findStageNode, stageRoots } from "../../utils/outlineStageTree";
import { OutlineStageChatColumn } from "./OutlineStageChatColumn";
import { OutlineStageNoteEditor } from "./OutlineStageNoteEditor";

type Props = {
  bookId: string;
  stages: OutlineStageNode[] | undefined;
  selectedId: string | null;
  noteDisabled: boolean;
  chatDisabled: boolean;
  modelOk: boolean;
  activeModelId: string | null;
  onUpdate: (id: string, patch: Partial<Pick<OutlineStageNode, "label" | "note" | "chatTurns">>) => void;
  onOutlineFromServer: (outline: OutlineIndex) => void;
  onError: (msg: string) => void;
};

export function OutlineStageEditorCenter({
  bookId,
  stages,
  selectedId,
  noteDisabled,
  chatDisabled,
  modelOk,
  activeModelId,
  onUpdate,
  onOutlineFromServer,
  onError
}: Props) {
  const roots = stageRoots(stages);
  const found = selectedId ? findStageNode(roots, selectedId) : null;

  const [leftRatio, setLeftRatio] = useLocalStorageState<number>({
    key: `novel-helper-stage-split-ratio:${bookId}`,
    defaultValue: 0.58,
    parse: (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? clamp(n, 0.32, 0.68) : 0.58;
    },
    serialize: (v) => String(clamp(v, 0.32, 0.68))
  });

  const [dragging, setDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  const handleNoteChange = useCallback(
    (note: string) => {
      if (!found) return;
      onUpdate(found.node.id, { note });
    },
    [found, onUpdate]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: MouseEvent) => {
      const el = splitRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const ratio = clamp(x / rect.width, 0.32, 0.68);
      setLeftRatio(ratio);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setLeftRatio]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  if (!selectedId) {
    return (
      <div className="outlineStageEditorCenter outlineStageEditorCenter--empty">
        <p className="muted">在左侧选择或新建阶段节点</p>
      </div>
    );
  }

  if (!found) {
    return (
      <div className="outlineStageEditorCenter outlineStageEditorCenter--empty">
        <p className="muted">所选阶段不存在或已被删除</p>
      </div>
    );
  }

  const { node } = found;
  const leftPct = `${leftRatio * 100}%`;

  return (
    <div
      ref={splitRef}
      className={`outlineStageSplit${dragging ? " outlineStageSplit--dragging" : ""}`}
    >
      <div style={{ flex: `0 0 ${leftPct}`, minWidth: 200, display: "flex", minHeight: 0 }}>
        <OutlineStageNoteEditor
          stageId={selectedId}
          serverNote={node.note ?? ""}
          disabled={noteDisabled}
          onNoteChange={handleNoteChange}
        />
      </div>
      <div
        className="outlineStageSplitDivider"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整细纲与策划区宽度"
        onMouseDown={startDrag}
      />
      <OutlineStageChatColumn
        bookId={bookId}
        stageId={selectedId}
        chatTurns={node.chatTurns ?? []}
        chatDisabled={chatDisabled}
        modelOk={modelOk}
        activeModelId={activeModelId}
        onOutlineFromServer={onOutlineFromServer}
        onError={onError}
      />
    </div>
  );
}

/** 供 App centerTop 使用的面包屑文案 */
export function formatStageBreadcrumb(stages: OutlineStageNode[] | undefined, selectedId: string | null): string {
  if (!selectedId) return "阶段";
  const labels = collectStagePathLabels(stageRoots(stages), selectedId);
  if (!labels.length) return "阶段";
  return labels.join(" · ");
}
