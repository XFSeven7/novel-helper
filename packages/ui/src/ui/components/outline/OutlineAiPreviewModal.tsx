import React from "react";
import type { OutlineIndex } from "../../api";

export type OutlineAiPreviewModalProps = {
  open: boolean;
  busy: boolean;
  preview: Partial<OutlineIndex> | { report: string } | null;
  warnings?: string[];
  onClose: () => void;
  onApply: (overwrite: boolean) => void | Promise<void>;
};

export function OutlineAiPreviewModal({
  open,
  busy,
  preview,
  warnings,
  onClose,
  onApply
}: OutlineAiPreviewModalProps) {
  if (!open || !preview) return null;

  const isReport = "report" in preview && typeof (preview as { report?: string }).report === "string";

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <OutlineAiDialog onClose={onClose} title={isReport ? "伏笔体检报告" : "AI 大纲预览"}>
        {warnings?.length ? <p className="muted outlineAiWarnings">{warnings.join("；")}</p> : null}
        {isReport ? (
          <pre className="outlineAiReport">{String((preview as { report: string }).report)}</pre>
        ) : (
          <pre className="outlineAiJson">{JSON.stringify(preview, null, 2)}</pre>
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
      <div className="modalBodyScroll">{children}</div>
    </div>
  );
}
