import React, { useEffect, useRef } from "react";

export type ChapterFindReplaceBarProps = {
  open: boolean;
  busy: boolean;
  findQuery: string;
  replaceQuery: string;
  hasMatch: boolean;
  matchCountLabel: string | null;
  onFindQueryChange: (v: string) => void;
  onReplaceQueryChange: (v: string) => void;
  onFindNext: () => void;
  onFindPrev: () => void;
  onReplaceOne: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
};

export function ChapterFindReplaceBar({
  open,
  busy,
  findQuery,
  replaceQuery,
  hasMatch,
  matchCountLabel,
  onFindQueryChange,
  onReplaceQueryChange,
  onFindNext,
  onFindPrev,
  onReplaceOne,
  onReplaceAll,
  onClose
}: ChapterFindReplaceBarProps) {
  const findRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) queueMicrotask(() => findRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const canAct = Boolean(findQuery.trim()) && !busy;

  return (
    <div className="chapterFindReplaceBar" role="search" aria-label="查找替换">
      <input
        ref={findRef}
        className="chapterFindReplaceInput"
        value={findQuery}
        onChange={(e) => onFindQueryChange(e.target.value)}
        placeholder="查找"
        disabled={busy}
        aria-label="查找"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onFindNext();
          }
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            onFindPrev();
          }
        }}
      />
      <input
        className="chapterFindReplaceInput"
        value={replaceQuery}
        onChange={(e) => onReplaceQueryChange(e.target.value)}
        placeholder="替换为"
        disabled={busy}
        aria-label="替换为"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onFindNext();
          }
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            onFindPrev();
          }
        }}
      />
      <button type="button" className="btnMini" disabled={!canAct} onClick={onFindPrev}>
        上一个
      </button>
      <button type="button" className="btnMini" disabled={!canAct} onClick={onFindNext}>
        下一个
      </button>
      <button type="button" className="btnMini" disabled={!canAct || !hasMatch} onClick={onReplaceOne}>
        替换
      </button>
      <button type="button" className="btnMini" disabled={!canAct} onClick={onReplaceAll}>
        全部替换
      </button>
      <button type="button" className="btnMini" disabled={busy} onClick={onClose}>
        关闭
      </button>
      {matchCountLabel ? (
        <span className="chapterFindReplaceCount muted" aria-live="polite">
          {matchCountLabel}
        </span>
      ) : canAct ? (
        <span className="muted chapterFindReplaceHint">无匹配</span>
      ) : null}
    </div>
  );
}
