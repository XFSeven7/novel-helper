import React, { useEffect, useRef } from "react";
import type { OutlineStageNode } from "../../api";
import { collectStagePathLabels, findStageNode, stageRoots } from "../../utils/outlineStageTree";

type Props = {
  stages: OutlineStageNode[] | undefined;
  selectedId: string | null;
  disabled: boolean;
  onUpdate: (id: string, patch: Partial<Pick<OutlineStageNode, "label" | "note">>) => void;
};

export function OutlineStageEditorCenter({ stages, selectedId, disabled, onUpdate }: Props) {
  const roots = stageRoots(stages);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const found = selectedId ? findStageNode(roots, selectedId) : null;

  useEffect(() => {
    if (found && noteRef.current) {
      noteRef.current.focus({ preventScroll: true });
    }
  }, [selectedId, found?.node.id]);

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

  return (
    <div className="outlineStageEditorCenter">
      <label className="outlineLabel" htmlFor="outline-stage-note">
        细纲 / 备注
      </label>
      <textarea
        id="outline-stage-note"
        ref={noteRef}
        className="outlineStageEditorNote"
        disabled={disabled}
        placeholder="在此写本阶段的细纲、情节点、注意事项…"
        value={node.note ?? ""}
        onChange={(e) => onUpdate(node.id, { note: e.target.value })}
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
