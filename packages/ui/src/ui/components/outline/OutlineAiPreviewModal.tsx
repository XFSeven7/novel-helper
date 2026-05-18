import React, { useState } from "react";
import type { ChapterMeta, OutlineAiMode, OutlineIndex } from "../../api";
import { OutlineAiPreviewVisual } from "./OutlineAiPreviewVisual";

export type OutlineAiPreviewModalProps = {
  open: boolean;
  busy: boolean;
  preview: Partial<OutlineIndex> | { report: string } | null;
  chapters: ChapterMeta[];
  aiMode?: OutlineAiMode | null;
  chapterCount?: number;
  warnings?: string[];
  onClose: () => void;
  onApply: (overwrite: boolean) => void | Promise<void>;
};

function previewTitle(mode: OutlineAiMode | null | undefined, isReport: boolean): string {
  if (isReport) return "伏笔体检报告";
  if (mode === "fromChapters") return "从章节归纳 — 预览";
  if (mode === "snowflake") return "全书结构 — 预览";
  if (mode === "volumeChapterPlans") return "本卷章纲 — 预览";
  return "AI 大纲预览";
}

function fromChaptersContextSummary(chapterCount: number): string {
  return `将归纳 ${chapterCount} 章：每章读取标题与正文前约 800 字，并参考书籍简介、时间线压缩摘要、伏笔索引（非全书审计记忆）。`;
}

export function OutlineAiPreviewModal({
  open,
  busy,
  preview,
  chapters,
  aiMode,
  chapterCount = 0,
  warnings,
  onClose,
  onApply
}: OutlineAiPreviewModalProps) {
  const [showRaw, setShowRaw] = useState(false);

  if (!open || !preview) return null;

  const isReport = "report" in preview && typeof (preview as { report?: string }).report === "string";
  const outlinePreview = isReport ? null : (preview as Partial<OutlineIndex>);

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <OutlineAiDialog onClose={onClose} title={previewTitle(aiMode, isReport)}>
        {aiMode === "fromChapters" && chapterCount > 0 ? (
          <p className="muted outlineAiContextSummary">{fromChaptersContextSummary(chapterCount)}</p>
        ) : null}
        {warnings?.length ? <p className="muted outlineAiWarnings">{warnings.join("；")}</p> : null}
        {isReport ? (
          <pre className="outlineAiReport">{String((preview as { report: string }).report)}</pre>
        ) : (
          <>
            <OutlineAiPreviewVisual preview={outlinePreview!} chapters={chapters} />
            <button
              type="button"
              className="btnSort outlineAiRawToggle"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? "隐藏原始 JSON" : "查看原始 JSON"}
            </button>
            {showRaw ? <pre className="outlineAiJson">{JSON.stringify(preview, null, 2)}</pre> : null}
          </>
        )}
        <div className="modalActions">
          <button type="button" className="btnModalSecondary" disabled={busy} onClick={onClose}>
            关闭
          </button>
          {!isReport ? (
            <>
              <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => void onApply(false)}>
                应用（保留已有）
              </button>
              <button type="button" className="btnModalPrimary" disabled={busy} onClick={() => void onApply(true)}>
                应用（覆盖）
              </button>
            </>
          ) : null}
        </div>
      </OutlineAiDialog>
    </div>
  );
}

function OutlineAiDialog({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge outlineAiModal"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modalHeaderRow">
        <h2 className="modalHeading">{title}</h2>
        <button type="button" className="btnModalSecondary" onClick={onClose} aria-label="关闭">
          关闭
        </button>
      </div>
      <div className="modalBodyScroll outlineAiModalBody">{children}</div>
    </div>
  );
}
