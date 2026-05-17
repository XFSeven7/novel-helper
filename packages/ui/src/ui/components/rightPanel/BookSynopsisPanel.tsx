import React from "react";
import type { BookMeta } from "../../api";

export type BookSynopsisPanelProps = {
  busy: boolean;
  activeBook: string;
  activeBookMeta: BookMeta | null;
  synopsisDraft: string;
  setSynopsisDraft: (v: string) => void;
  bookOverviewAutosaveHint: string;
  onToggleCompleted: () => void | Promise<void>;
  onDeleteBook: () => void;
};

export function BookSynopsisPanel({
  busy,
  activeBook,
  activeBookMeta,
  synopsisDraft,
  setSynopsisDraft,
  bookOverviewAutosaveHint,
  onToggleCompleted,
  onDeleteBook
}: BookSynopsisPanelProps) {
  return (
    <aside className="right">
      <section className="panel bookSynopsisPanel">
        <div className="contentOrganizeHeader">
          <div className="panelTitle contentOrganizeTitle">书籍简介</div>
        </div>
        <div className="bookOverviewTopRow">
          <div className="bookOverviewSynopsisLabel">简介</div>
          {activeBookMeta ? (
            <div className="row bookOverviewActions">
              <button
                type="button"
                className="btnSort btnSuccess"
                disabled={busy || !activeBook}
                onClick={() => void onToggleCompleted()}
              >
                {activeBookMeta.completed ? "取消完结" : "完结书籍"}
              </button>
              <button
                type="button"
                className="btnSort btnDanger"
                disabled={busy || !activeBook}
                onClick={onDeleteBook}
                title="软删除:书籍目录仍保留在本地"
              >
                废弃书籍
              </button>
            </div>
          ) : null}
        </div>
        <textarea
          className="bookOverviewSynopsis"
          value={synopsisDraft}
          onChange={(e) => setSynopsisDraft(e.target.value)}
          disabled={busy}
          placeholder="写一句简介或内容简介...(保存到书籍 meta.json)"
          aria-label="书籍简介"
          rows={4}
        />
        <div
          className={`titleAutosave autosaveHint ${
            bookOverviewAutosaveHint === "保存失败" ? "autosaveErr" : ""
          }`}
          title="简介停顿约 1 秒后写入 meta.json"
        >
          {bookOverviewAutosaveHint}
        </div>
      </section>
    </aside>
  );
}
