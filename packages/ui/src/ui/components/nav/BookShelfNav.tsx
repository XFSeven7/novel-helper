import React from "react";
import type { BookMeta } from "../../api";
import { formatBookCreatedAt, normalizeChapterGapList } from "../../utils/chapterFormat";

export type BookShelfNavProps = {
  books: BookMeta[];
  displayedBooks: BookMeta[];
  busy: boolean;
  bookShelfSortDesc: boolean;
  onToggleSort: () => void;
  onPlanBook: () => void;
  onCreateBook: () => void;
  onOpenBook: (book: BookMeta) => void;
};

export function BookShelfNav({
  books,
  displayedBooks,
  busy,
  bookShelfSortDesc,
  onToggleSort,
  onPlanBook,
  onCreateBook,
  onOpenBook
}: BookShelfNavProps) {
  return (
    <>
      <div className="navTitle">书架</div>
      <div className="navShelfHint muted">点击书名进入全书；可用「规划新书」搭架子，或「快速创建」只填书名。</div>
      <div className="navNewBookRow navNewBookRowSplit">
        <button type="button" className="btnNewBookFull btnNewBookPlan" onClick={onPlanBook} disabled={busy}>
          规划新书
        </button>
        <button type="button" className="btnNewBookFull btnNewBookQuick" onClick={onCreateBook} disabled={busy}>
          快速创建
        </button>
      </div>
      <div className="navSortBar">
        <button
          type="button"
          className="btnSort"
          disabled={busy || books.length < 2}
          title={bookShelfSortDesc ? "切换为正序" : "切换为倒序"}
          onClick={onToggleSort}
        >
          {bookShelfSortDesc ? "倒序" : "正序"}
        </button>
      </div>
      <div className="tree navListDense bookShelfList">
        {books.length === 0 ? (
          <div className="empty">还没有书,先新建一本。</div>
        ) : (
          displayedBooks.map((b) => {
            const gapCount = normalizeChapterGapList(b.missingChapterIndexes ?? []).length;
            return (
              <div key={b.slug} className="bookShelfItem">
                <div
                  role="button"
                  tabIndex={busy ? -1 : 0}
                  className="treeChild bookShelfRow"
                  onClick={() => {
                    if (busy) return;
                    void onOpenBook(b);
                  }}
                  onKeyDown={(e) => {
                    if (busy) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void onOpenBook(b);
                    }
                  }}
                  title={`打开全书 · ${b.slug}\n创建:${formatBookCreatedAt(b.createdAt)}\n${b.status} · ${b.chapterCount}章${
                    gapCount ? `\n缺失序号 ${gapCount} 处(进入该书后在左侧书名下处理)` : ""
                  }`}
                >
                  <span className="bookShelfTitle">《{b.title}》</span>
                  {gapCount > 0 ? <span className="bookShelfGapCount">缺 {gapCount} 章</span> : null}
                  <span className="bookShelfMeta">
                    {formatBookCreatedAt(b.createdAt)} · {b.status} · {b.chapterCount}章
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
