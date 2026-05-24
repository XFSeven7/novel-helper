import React, { useEffect, useRef } from "react";
import { CLEAR_BOOK_AUDIT_CONFIRM_PHRASE } from "../../constants/clearBookAudit";

export type ClearBookAuditModalProps = {
  open: boolean;
  busy: boolean;
  bookTitle: string;
  confirmDraft: string;
  onConfirmDraftChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ClearBookAuditModal({
  open,
  busy,
  bookTitle,
  confirmDraft,
  onConfirmDraftChange,
  onClose,
  onConfirm
}: ClearBookAuditModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canConfirm = confirmDraft === CLEAR_BOOK_AUDIT_CONFIRM_PHRASE && !busy;

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="modalPanel modalPanelOpaque"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-clear-book-audit-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-clear-book-audit-heading" className="modalHeading">
          清空本书分析数据
        </h2>
        <p className="modalChapterGapBody">
          将删除《{bookTitle}》下全部分析数据（各章分析、人物/地点/时间线/伏笔等内容整理），<strong>不可恢复</strong>
          。不会删除章节正文、书籍大纲、设定与备注。
        </p>
        <p className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
          请输入以下文字以确认：
        </p>
        <p className="clearBookAuditPhraseHint">{CLEAR_BOOK_AUDIT_CONFIRM_PHRASE}</p>
        <input
          ref={inputRef}
          className="modalInput"
          value={confirmDraft}
          onChange={(e) => onConfirmDraftChange(e.target.value)}
          disabled={busy}
          aria-label="确认文字"
          placeholder={CLEAR_BOOK_AUDIT_CONFIRM_PHRASE}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canConfirm) {
              e.preventDefault();
              void onConfirm();
            }
          }}
        />
        <div className="modalActions">
          <button type="button" className="btnModalSecondary" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btnModalPrimary"
            disabled={!canConfirm}
            onClick={() => void onConfirm()}
          >
            确定清空
          </button>
        </div>
      </div>
    </div>
  );
}
