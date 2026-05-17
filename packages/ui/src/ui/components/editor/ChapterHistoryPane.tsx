import React, { useCallback, useMemo, useRef } from "react";
import type { ChapterVersionMeta } from "../../api";
import { approximateWordCount, formatBookCreatedAt } from "../../utils/chapterFormat";
import { diffChars } from "../../utils/auditDiff";

export const CHAPTER_HISTORY_CURRENT_ID = "__current__";

export type ChapterHistoryPaneProps = {
  versions: ChapterVersionMeta[];
  selectedVersionId: string | null;
  versionContentCache: Record<string, string>;
  currentChapterContent: string;
  busy: boolean;
  onClose: () => void;
};

function renderHistoryDiff(history: string, current: string) {
  return diffChars(history, current).map((seg, idx) => {
    if (seg.t === "del") {
      return (
        <span key={idx} className="polishDiffDel">
          {seg.s}
        </span>
      );
    }
    if (seg.t === "eq") return <span key={idx}>{seg.s}</span>;
    return null;
  });
}

function renderCurrentDiff(history: string, current: string) {
  return diffChars(history, current).map((seg, idx) => {
    if (seg.t === "ins") {
      return (
        <span key={idx} className="polishDiffIns">
          {seg.s}
        </span>
      );
    }
    if (seg.t === "eq") return <span key={idx}>{seg.s}</span>;
    return null;
  });
}

function syncScrollTop(source: HTMLElement, target: HTMLElement) {
  const sourceMax = source.scrollHeight - source.clientHeight;
  const targetMax = target.scrollHeight - target.clientHeight;
  if (sourceMax > 0 && targetMax > 0) {
    target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
  } else {
    target.scrollTop = source.scrollTop;
  }
}

export function ChapterHistoryPane({
  versions,
  selectedVersionId,
  versionContentCache,
  currentChapterContent,
  busy,
  onClose
}: ChapterHistoryPaneProps) {
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const currentScrollRef = useRef<HTMLDivElement>(null);
  const scrollSyncLockRef = useRef(false);

  const selectedMeta = versions.find((v) => v.id === selectedVersionId);
  const selectedHistoryContent =
    selectedVersionId && selectedVersionId !== CHAPTER_HISTORY_CURRENT_ID
      ? versionContentCache[selectedVersionId]
      : undefined;

  const canCompare =
    Boolean(selectedVersionId) &&
    selectedVersionId !== CHAPTER_HISTORY_CURRENT_ID &&
    selectedHistoryContent !== undefined;

  const syncScrollFrom = useCallback((from: "history" | "current") => {
    if (scrollSyncLockRef.current) return;
    const historyEl = historyScrollRef.current;
    const currentEl = currentScrollRef.current;
    if (!historyEl || !currentEl) return;
    scrollSyncLockRef.current = true;
    if (from === "history") syncScrollTop(historyEl, currentEl);
    else syncScrollTop(currentEl, historyEl);
    requestAnimationFrame(() => {
      scrollSyncLockRef.current = false;
    });
  }, []);

  const historyColTitle = useMemo(() => {
    if (!canCompare || !selectedMeta) return "历史存稿";
    const label = selectedMeta.label?.trim();
    return `历史存稿 · ${formatBookCreatedAt(selectedMeta.createdAt)}${label ? ` · ${label}` : ""}`;
  }, [canCompare, selectedMeta]);

  let historyBody: React.ReactNode = (
    <p className="muted chapterHistoryColPlaceholder">在右侧「内容整理」中选择一条历史存稿。</p>
  );
  if (selectedVersionId && selectedHistoryContent === undefined) {
    historyBody = <p className="muted chapterHistoryColPlaceholder">加载历史正文…</p>;
  } else if (canCompare) {
    historyBody = (
      <div className="polishDiffPreview chapterHistoryCompareBody" aria-label="历史存稿相对当前稿的差异">
        {renderHistoryDiff(selectedHistoryContent, currentChapterContent)}
      </div>
    );
  }

  let currentBody: React.ReactNode = (
    <p className="muted chapterHistoryColPlaceholder">选择历史存稿后，此处高亮相对历史的改动。</p>
  );
  if (canCompare) {
    currentBody = (
      <div className="polishDiffPreview chapterHistoryCompareBody" aria-label="当前稿相对历史存稿的差异">
        {renderCurrentDiff(selectedHistoryContent, currentChapterContent)}
      </div>
    );
  }

  const historyWordCount =
    selectedHistoryContent !== undefined ? approximateWordCount(selectedHistoryContent) : null;
  const currentWordCount = approximateWordCount(currentChapterContent);

  return (
    <div className="polishSplit chapterHistorySplit">
      <div className="polishHead">
        <div className="polishTitle">
          历史版本对照
          <span className="polishCounts muted">
            {historyWordCount != null ? `历史 ${historyWordCount} 字` : "未选历史"} · 当前 {currentWordCount} 字
          </span>
        </div>
        <div className="row">
          <button type="button" className="btnSort" disabled={busy} onClick={onClose} title="收起 (Esc)">
            收起
          </button>
        </div>
      </div>

      <div className="polishCols chapterHistoryCols">
        <div className="polishCol chapterHistoryCol">
          <div className="polishColTitle muted">
            {historyColTitle}
            {canCompare ? <span className="chapterHistoryDiffLegend chapterHistoryDiffLegendDel">红：历史中已删改</span> : null}
          </div>
          <div
            ref={historyScrollRef}
            className="chapterHistoryScrollSync"
            onScroll={() => syncScrollFrom("history")}
          >
            {historyBody}
          </div>
        </div>
        <div className="polishCol chapterHistoryCol">
          <div className="polishColTitle muted">
            当前稿
            {canCompare ? (
              <span className="chapterHistoryDiffLegend chapterHistoryDiffLegendIns">绿：相对历史新增</span>
            ) : null}
          </div>
          <div
            ref={currentScrollRef}
            className="chapterHistoryScrollSync"
            onScroll={() => syncScrollFrom("current")}
          >
            {currentBody}
          </div>
        </div>
      </div>
    </div>
  );
}
