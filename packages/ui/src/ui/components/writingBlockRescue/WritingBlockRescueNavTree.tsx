import { useMemo } from "react";
import type { ChapterMeta } from "../../api";
import type { RescuePrediction } from "./WritingBlockRescueOpsPanel";

export type RescueTreeStore = {
  version: 2;
  predictionsByChapter: Record<string, RescuePrediction[]>;
  expandedChapterIds: number[];
  selected: { chapterId: number; predictionId: string } | null;
};

export function WritingBlockRescueNavTree(props: {
  latestChapter: ChapterMeta | null;
  generating: boolean;
  onPredict: () => void;
  tree: RescueTreeStore;
  onToggleChapter: (chapterId: number) => void;
  onSelect: (chapterId: number, predictionId: string) => void;
  onDeletePrediction: (chapterId: number, predictionId: string) => void;
}) {
  const { latestChapter, generating, onPredict, tree, onToggleChapter, onSelect, onDeletePrediction } = props;

  const chapterLabel = useMemo(() => {
    if (!latestChapter) return "（未找到最新章节）";
    return `第${latestChapter.id}章后续剧情规划`;
  }, [latestChapter]);

  const chapterEntries = useMemo(() => {
    const ids = Object.keys(tree.predictionsByChapter)
      .map((x) => Number.parseInt(x, 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a);
    return ids.map((id) => ({ id, list: tree.predictionsByChapter[String(id)] ?? [] }));
  }, [tree.predictionsByChapter]);

  return (
    <div className="rescueNavTree rescueNavTreeScrollable" aria-label="卡文急救树状结构">
      <button type="button" className="primary rescueNavPredictBtn" disabled={!latestChapter || generating} onClick={onPredict}>
        {generating ? "推测中…" : "剧情推测"}
      </button>

      {!chapterEntries.length ? (
        <div className="muted rescueNavTreeEmpty">暂无剧情推测。点击上方「剧情推测」生成。</div>
      ) : (
        <div className="outlineStageTreeScroll" role="tree" aria-label="按章节组织的剧情推测树">
          {chapterEntries.map(({ id: chapterId, list }) => {
            const open = tree.expandedChapterIds.includes(chapterId);
            const chapterTitle = list.find((p) => p.chapterTitle)?.chapterTitle || "";
            return (
              <div key={chapterId} className="outlineStageTreeNode">
                <div
                  className="outlineStageTreeRow"
                  style={{ paddingLeft: `${8 + 0 * 14}px` }}
                  aria-expanded={open}
                >
                  <button
                    type="button"
                    className="outlineStageTreeToggle"
                    aria-label={open ? "收起" : "展开"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleChapter(chapterId);
                    }}
                  >
                    {open ? "▾" : "▸"}
                  </button>
                  <button
                    type="button"
                    className="outlineStageTreeLabelBtn"
                    onClick={() => onToggleChapter(chapterId)}
                    title={`第${chapterId}章后续剧情规划`}
                  >
                    {`第${chapterId}章后续剧情规划`}
                    {chapterTitle ? <span className="muted" style={{ marginLeft: 6 }}>{chapterTitle}</span> : null}
                  </button>
                </div>
                {open ? (
                  <div className="outlineStageTreeChildren" role="group" aria-label={`第${chapterId}章剧情推测`}>
                    {list.map((p, idx) => {
                      const active =
                        tree.selected?.chapterId === chapterId && tree.selected?.predictionId === p.id;
                      const title = p.title?.trim() ? p.title.trim() : `剧情推测${list.length - idx}`;
                      return (
                        <div key={p.id} className="outlineStageTreeNode" role="treeitem" aria-selected={active}>
                          <div
                            className={[
                              "outlineStageTreeRow",
                              active ? "outlineStageTreeRow--selected" : ""
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={{ paddingLeft: `${8 + 1 * 14}px` }}
                          >
                            <button
                              type="button"
                              className="outlineStageTreeToggle outlineStageTreeToggle--spacer"
                              disabled
                              aria-hidden
                            />
                            <button
                              type="button"
                              className="outlineStageTreeLabelBtn"
                              onClick={() => onSelect(chapterId, p.id)}
                              title={p.createdAt}
                            >
                              {title}
                              <span className="muted" style={{ marginLeft: 6 }}>
                                {new Date(p.createdAt).toLocaleString()}
                              </span>
                            </button>
                            <span className="outlineStageTreeActions">
                              <button
                                type="button"
                                className="outlineStageTreeAct outlineStageTreeAct--danger"
                                title="删除该推测"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeletePrediction(chapterId, p.id);
                                }}
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                  aria-hidden="true"
                                >
                                  <path d="M10 12V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M14 12V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M6 10V18C6 19.6569 7.34315 21 9 21H15C16.6569 21 18 19.6569 18 18V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

