import React, { memo, useEffect, useRef, useState } from "react";

type Props = {
  stageId: string;
  serverNote: string;
  disabled: boolean;
  onNoteChange: (note: string) => void;
};

/** 独立备注区：避免右侧 AI 流式更新导致整页重渲染抢焦点 */
export const OutlineStageNoteEditor = memo(function OutlineStageNoteEditor({
  stageId,
  serverNote,
  disabled,
  onNoteChange
}: Props) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const editingRef = useRef(false);
  const lastStageIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState(serverNote);

  useEffect(() => {
    if (lastStageIdRef.current === stageId) return;
    lastStageIdRef.current = stageId;
    setDraft(serverNote);
    requestAnimationFrame(() => noteRef.current?.focus({ preventScroll: true }));
  }, [stageId, serverNote]);

  useEffect(() => {
    if (editingRef.current) return;
    if (lastStageIdRef.current !== stageId) return;
    setDraft(serverNote);
  }, [serverNote, stageId]);

  return (
    <div className="outlineStageCol outlineStageColNote outlineStageColNoteOnly">
      <label className="outlineLabel" htmlFor="outline-stage-note">
        细纲 / 备注
      </label>
      <textarea
        id="outline-stage-note"
        ref={noteRef}
        className="outlineStageEditorNote"
        disabled={disabled}
        placeholder="在此写本阶段的细纲、情节点、注意事项…"
        value={draft}
        onFocus={() => {
          editingRef.current = true;
        }}
        onBlur={() => {
          editingRef.current = false;
        }}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          onNoteChange(v);
        }}
      />
    </div>
  );
});
