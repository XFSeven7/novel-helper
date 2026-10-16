import React, { useMemo } from "react";
import type { ChapterMeta } from "../../api";
import { useOptionalOutlineBook } from "../../context/OutlineBookContext";
import { useVolumeTreeCollapsed } from "../../hooks/useVolumeTreeCollapsed";
import { groupChaptersByVolumes } from "../../utils/outlineVolumeGroups";

export type ChapterNavProps = {
  chapters: ChapterMeta[];
  displayedChapters: ChapterMeta[];
  selectedChapterFilename: string | null;
  busy: boolean;
  chapterSortDesc: boolean;
  chapterTitle: string;
  auditedChapterFilenames: ReadonlySet<string>;
  auditChangedChapterFilenames: ReadonlySet<string>;
  chaptersDraftOutOfSync: ReadonlySet<string>;
  onToggleSort: () => void;
  onChapterTitleChange: (title: string) => void;
  onOpenChapter: (chapter: ChapterMeta) => void;
  onCreateChapter: () => void;
  exportingTxt?: boolean;
  onExportTxt: () => void;
};

function ChapterNavItem({
  chapter,
  selected,
  busy,
  isAudited,
  hasChanges,
  draftOut,
  onOpen
}: {
  chapter: ChapterMeta;
  selected: boolean;
  busy: boolean;
  isAudited: boolean;
  hasChanges: boolean;
  draftOut: boolean;
  onOpen: (c: ChapterMeta) => void;
}) {
  return (
    <button
      type="button"
      className={`treeChild chapterNavItem ${selected ? "active" : ""}`}
      onClick={() => void onOpen(chapter)}
      disabled={busy}
    >
      <span className="chapterNavItemMain">
        <span className="chapterNavDraftMark" title={draftOut ? "相对最新存稿有变动或尚未存稿" : undefined}>
          {draftOut ? "*" : "\u00a0"}
        </span>
        <span className="chapterNavItemTitle">{chapter.id}</span>
      </span>
      <span className="chapterNavRightMeta">
        <span className={`chapterNavAuditStatus ${isAudited ? "ok" : "miss"}`}>
          {hasChanges ? <span className="chapterNavAuditChanged">有改动 </span> : null}
          {isAudited ? "已分析" : "未分析"}
        </span>
        <span className="chapterNavWordCount">{chapter.wordCount ?? 0} 字</span>
      </span>
    </button>
  );
}

export function ChapterNav({
  chapters,
  displayedChapters,
  selectedChapterFilename,
  busy,
  chapterSortDesc,
  chapterTitle,
  auditedChapterFilenames,
  auditChangedChapterFilenames,
  chaptersDraftOutOfSync,
  onToggleSort,
  onChapterTitleChange,
  onOpenChapter,
  onCreateChapter,
  exportingTxt,
  onExportTxt
}: ChapterNavProps) {
  const outlineCtx = useOptionalOutlineBook();
  const outline = outlineCtx?.outline;
  const { isExpanded, toggle } = useVolumeTreeCollapsed(outlineCtx?.bookId);

  const groups = useMemo(
    () => groupChaptersByVolumes(displayedChapters, outline),
    [displayedChapters, outline]
  );

  const renderChapter = (c: ChapterMeta) => (
    <ChapterNavItem
      key={c.filename}
      chapter={c}
      selected={selectedChapterFilename === c.filename}
      busy={busy}
      isAudited={auditedChapterFilenames.has(c.filename)}
      hasChanges={auditChangedChapterFilenames.has(c.filename)}
      draftOut={chaptersDraftOutOfSync.has(c.filename)}
      onOpen={onOpenChapter}
    />
  );

  return (
    <div className="chapterNavRoot">
      <div className="navSortBar">
        <button
          type="button"
          className="btnSort"
          disabled={busy || chapters.length < 2}
          title={chapterSortDesc ? "切换为正序" : "切换为倒序"}
          onClick={onToggleSort}
        >
          {chapterSortDesc ? "倒序" : "正序"}
        </button>
        <button
          type="button"
          className="btnSort"
          disabled={busy || exportingTxt || chapters.length === 0}
          title="导出合并正序 txt（通读校对）"
          onClick={() => onExportTxt()}
        >
          {exportingTxt ? "导出中…" : "导出 txt"}
        </button>
      </div>
      <div className="navChapterBody">
        <div className="chapterNavScroll">
          <div className="tree navListDense chapterNavList">
            {chapters.length === 0 ? (
              <div className="empty">暂无章节,请在下方新建。</div>
            ) : groups ? (
              groups.map((g) => {
                const open = isExpanded(g.key);
                return (
                  <div key={g.key} className="volumeTreeGroup">
                    <button
                      type="button"
                      className="volumeTreeHeader"
                      aria-expanded={open}
                      onClick={() => toggle(g.key)}
                    >
                      <span className="volumeTreeChevron" aria-hidden>
                        {open ? "▾" : "▸"}
                      </span>
                      <span className="volumeTreeTitle">{g.title}</span>
                      <span className="volumeTreeCount">{g.chapters.length}</span>
                    </button>
                    {open ? <div className="volumeTreeChildren">{g.chapters.map(renderChapter)}</div> : null}
                  </div>
                );
              })
            ) : (
              displayedChapters.map(renderChapter)
            )}
          </div>
        </div>
        <div className="row chapterQuickRow chapterQuickRowSticky">
          <input
            value={chapterTitle}
            onChange={(e) => onChapterTitleChange(e.target.value)}
            placeholder="新章节标题"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onCreateChapter();
              }
            }}
          />
          <button onClick={() => void onCreateChapter()} disabled={busy || !chapterTitle.trim()}>
            新建章节
          </button>
        </div>
      </div>
    </div>
  );
}
