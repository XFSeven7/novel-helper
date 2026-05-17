import React from "react";
import type { ChapterMeta } from "../../api";

export type ChapterNavProps = {
  chapters: ChapterMeta[];
  displayedChapters: ChapterMeta[];
  selectedChapterFilename: string | null;
  busy: boolean;
  chapterSortDesc: boolean;
  chapterTitle: string;
  auditedChapterFilenames: ReadonlySet<string>;
  onToggleSort: () => void;
  onChapterTitleChange: (title: string) => void;
  onOpenChapter: (chapter: ChapterMeta) => void;
  onCreateChapter: () => void;
};

export function ChapterNav({
  chapters,
  displayedChapters,
  selectedChapterFilename,
  busy,
  chapterSortDesc,
  chapterTitle,
  auditedChapterFilenames,
  onToggleSort,
  onChapterTitleChange,
  onOpenChapter,
  onCreateChapter
}: ChapterNavProps) {
  return (
    <>
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
      </div>
      <div className="navChapterBody">
        <div className="chapterNavScroll">
          <div className="tree navListDense chapterNavList">
            {chapters.length === 0 ? (
              <div className="empty">暂无章节,请在下方新建。</div>
            ) : (
              displayedChapters.map((c) => (
                <button
                  key={c.filename}
                  type="button"
                  className={`treeChild chapterNavItem ${selectedChapterFilename === c.filename ? "active" : ""}`}
                  onClick={() => void onOpenChapter(c)}
                  disabled={busy}
                >
                  <span className="chapterNavItemTitle">{c.id}</span>
                  <span className="chapterNavRightMeta">
                    <span
                      className={`chapterNavAuditStatus ${
                        auditedChapterFilenames.has(c.filename) ? "ok" : "miss"
                      }`}
                    >
                      {auditedChapterFilenames.has(c.filename) ? "已分析" : "未分析"}
                    </span>
                    <span className="chapterNavWordCount">{c.wordCount ?? 0} 字</span>
                  </span>
                </button>
              ))
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
    </>
  );
}
