import React, { useEffect, useRef, useState } from "react";

export type ChapterSaveDraftModalProps = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (label: string) => void | Promise<void>;
};

export function ChapterSaveDraftModal({ open, busy, onClose, onConfirm }: ChapterSaveDraftModalProps) {
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel("");
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
        aria-labelledby="modal-save-draft-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-save-draft-heading" className="modalHeading">
          存稿
        </h2>
        <p className="muted modalChapterGapMuted">将当前正文保存为一条历史存稿（备注可选）。</p>
        <div className="modalField">
          <label className="modalLabel" htmlFor="modal-save-draft-label">
            备注<span className="modalOptional">（可选）</span>
          </label>
          <input
            id="modal-save-draft-label"
            ref={inputRef}
            className="modalInput"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
            placeholder="例如：第三章改完开头"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!busy) void onConfirm(label.trim());
              }
            }}
          />
        </div>
        <div className="modalActions">
          <button type="button" className="btnModalSecondary" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btnModalPrimary"
            disabled={busy}
            onClick={() => void onConfirm(label.trim())}
          >
            {busy ? "存稿中..." : "确认存稿"}
          </button>
        </div>
      </div>
    </div>
  );
}
