import React, { useEffect } from "react";
import { useOptionalOutlineBook } from "../../context/OutlineBookContext";
import { findStageNode, stageRoots, updateStageNode } from "../../utils/outlineStageTree";
import {
  OutlineStageEditorCenter,
  formatStageBreadcrumb
} from "./OutlineStageEditorCenter";

export function StageOutlineCenterTop({
  selectedId,
  busy,
  bookTitle
}: {
  selectedId: string | null;
  busy: boolean;
  bookTitle: string;
}) {
  const ctx = useOptionalOutlineBook();
  const outline = ctx?.outline;
  const saving = ctx?.saving ?? false;
  const disabled = busy || saving || (ctx?.aiBusy ?? false);
  const roots = stageRoots(outline?.book.mainlineStages);
  const found = selectedId ? findStageNode(roots, selectedId) : null;

  if (!selectedId) {
    return (
      <>
        <div className="centerTitle">《{bookTitle}》· 阶段细纲</div>
        <span className="titleAutosave autosaveHint" />
      </>
    );
  }

  const breadcrumb = formatStageBreadcrumb(outline?.book.mainlineStages, selectedId);

  return (
    <>
      <input
        type="text"
        className="renameChapterInput renameChapterInputInline"
        disabled={disabled || !found}
        value={found?.node.label ?? ""}
        placeholder="阶段标题"
        aria-label="阶段标题"
        onChange={(e) => {
          if (!ctx || !selectedId) return;
          ctx.updateOutline((prev) => ({
            ...prev,
            book: {
              ...prev.book,
              mainlineStages: updateStageNode(stageRoots(prev.book.mainlineStages), selectedId, {
                label: e.target.value
              })
            }
          }));
        }}
      />
      <span className="muted centerStageBreadcrumb" title={breadcrumb}>
        《{bookTitle}》· {breadcrumb}
      </span>
      {saving ? <span className="titleAutosave autosaveHint">保存中…</span> : null}
    </>
  );
}

export function StageOutlineCenterBody({
  bookId,
  selectedId,
  busy,
  activeModelId,
  modelOk,
  onClearSelection,
  onStatus
}: {
  bookId: string;
  selectedId: string | null;
  busy: boolean;
  activeModelId: string | null;
  modelOk: boolean;
  onClearSelection: () => void;
  onStatus: (msg: string) => void;
}) {
  const ctx = useOptionalOutlineBook();
  const outline = ctx?.outline;
  const saving = ctx?.saving ?? false;
  const noteDisabled = busy || (ctx?.aiBusy ?? false);
  const chatDisabled = busy || saving || (ctx?.aiBusy ?? false);

  useEffect(() => {
    if (!selectedId || !outline) return;
    if (!findStageNode(stageRoots(outline.book.mainlineStages), selectedId)) onClearSelection();
  }, [selectedId, outline?.updatedAt, outline, onClearSelection]);

  if (!ctx) {
    return (
      <div className="outlineStageEditorCenter outlineStageEditorCenter--empty">
        <p className="muted">加载大纲…</p>
      </div>
    );
  }

  return (
    <OutlineStageEditorCenter
      bookId={bookId}
      stages={outline?.book.mainlineStages}
      selectedId={selectedId}
      noteDisabled={noteDisabled}
      chatDisabled={chatDisabled}
      modelOk={modelOk}
      activeModelId={activeModelId}
      onUpdate={(id, patch) => {
        ctx.updateOutline((prev) => ({
          ...prev,
          book: {
            ...prev.book,
            mainlineStages: updateStageNode(stageRoots(prev.book.mainlineStages), id, patch)
          }
        }));
      }}
      flushBeforeSend={ctx.flushPendingSave}
      onOutlineFromServer={ctx.replaceOutlineFromServer}
      onError={onStatus}
    />
  );
}
