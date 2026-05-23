import React, { useEffect, useId, useRef } from "react";
import type { ActiveAppDialog } from "./types";

export function AppDialogHost({
  dialog,
  onAlertClose,
  onConfirmClose
}: {
  dialog: ActiveAppDialog | null;
  onAlertClose: () => void;
  onConfirmClose: (ok: boolean) => void;
}) {
  const titleId = useId();
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (dialog.kind === "alert") onAlertClose();
      else onConfirmClose(false);
    };
    window.addEventListener("keydown", onKey);
    const t = requestAnimationFrame(() => confirmBtnRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(t);
    };
  }, [dialog, onAlertClose, onConfirmClose]);

  if (!dialog) return null;

  const title = dialog.opts.title ?? (dialog.kind === "alert" ? "提示" : "确认");
  const message = dialog.opts.message;

  const dismiss = () => {
    if (dialog.kind === "alert") onAlertClose();
    else onConfirmClose(false);
  };

  return (
    <div className="modalBackdrop appDialogBackdrop" role="presentation" onClick={dismiss}>
      <div
        className="modalPanel modalPanelOpaque"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="modalHeading">
          {title}
        </h2>
        <p className="modalChapterGapBody appDialogMessage">{message}</p>
        <div className="modalActions">
          {dialog.kind === "confirm" ? (
            <button type="button" className="btnModalSecondary" onClick={() => onConfirmClose(false)}>
              {dialog.opts.cancelLabel ?? "取消"}
            </button>
          ) : null}
          <button
            ref={confirmBtnRef}
            type="button"
            className={
              dialog.kind === "confirm" && dialog.opts.variant === "danger"
                ? "btnModalDanger"
                : "btnModalPrimary"
            }
            onClick={() => {
              if (dialog.kind === "alert") onAlertClose();
              else onConfirmClose(true);
            }}
          >
            {dialog.opts.confirmLabel ?? "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}
