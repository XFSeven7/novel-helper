import React from "react";
import type { ChapterVersionMeta } from "../../api";
import { approximateWordCount, formatBookCreatedAt } from "../../utils/chapterFormat";
import { CHAPTER_HISTORY_CURRENT_ID } from "../editor/ChapterHistoryPane";
import { appConfirm } from "../../dialog/dialog";

export type ChapterHistoryVersionListProps = {
  versions: ChapterVersionMeta[];
  selectedVersionId: string | null;
  versionContentCache: Record<string, string>;
  currentChapterContent: string;
  busy: boolean;
  onSelectVersion: (versionId: string) => void;
  onRestore: (versionId: string) => void | Promise<void>;
};

export function ChapterHistoryVersionList({
  versions,
  selectedVersionId,
  versionContentCache,
  currentChapterContent,
  busy,
  onSelectVersion,
  onRestore
}: ChapterHistoryVersionListProps) {
  const selectedHistoryContent =
    selectedVersionId && selectedVersionId !== CHAPTER_HISTORY_CURRENT_ID
      ? versionContentCache[selectedVersionId]
      : undefined;

  const canRestore =
    Boolean(selectedVersionId) &&
    selectedVersionId !== CHAPTER_HISTORY_CURRENT_ID &&
    selectedHistoryContent !== undefined;

  const currentWordCount = approximateWordCount(currentChapterContent);

  return (
    <div className="chapterHistorySidePanel">
      <div className="chapterHistorySideIntro muted">
        当前稿 {currentWordCount} 字 · 选择一条存稿与中间编辑区对照
      </div>

      <div className="chapterHistorySideListScroll">
        <ul className="tree navListDense chapterHistorySideList" role="listbox" aria-label="章节历史存稿">
          {versions.length === 0 ? (
            <li className="chapterHistorySideEmpty muted">尚无历史存稿，请使用顶栏「存稿」。</li>
          ) : (
            versions.map((v) => {
              const active = selectedVersionId === v.id;
              const label = v.label?.trim();
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`treeChild chapterHistorySideItem ${active ? "active" : ""}`}
                    disabled={busy}
                    onClick={() => onSelectVersion(v.id)}
                  >
                    <span className="chapterHistorySideItemMain">
                      <span className="chapterHistorySideItemTime">{formatBookCreatedAt(v.createdAt)}</span>
                      {label ? <span className="chapterHistorySideItemLabel">{label}</span> : null}
                    </span>
                    <span className="chapterHistorySideItemMeta muted">{v.wordCount} 字</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className="chapterHistorySideFooter">
        <button
          type="button"
          className="btnSquare"
          disabled={busy || !canRestore}
          onClick={() => {
            void (async () => {
              if (!selectedVersionId || !canRestore) return;
              const ok = await appConfirm({
                message: "将磁盘正文还原为该历史存稿，当前未保存的编辑会丢失。是否继续？",
                variant: "danger"
              });
              if (ok) void onRestore(selectedVersionId);
            })();
          }}
        >
          还原到此版本
        </button>
      </div>
    </div>
  );
}
