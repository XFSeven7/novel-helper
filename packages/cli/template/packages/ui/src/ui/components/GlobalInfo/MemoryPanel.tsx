import React from "react";

export type MemoryTabId = "chapters" | "ranges";

export function MemoryPanel(props: {
  busy: boolean;
  timelineBusy: boolean;
  activeBook: string | null;
  timelineIndex: any;

  memoryTab: MemoryTabId;
  setMemoryTab: (v: MemoryTabId) => void;
  memoryExpanded: Record<string, boolean>;
  setMemoryExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;

  memoryChaptersSortDesc: boolean;
  setMemoryChaptersSortDesc: (fn: (prev: boolean) => boolean) => void;
  memoryRangesSortDesc: boolean;
  setMemoryRangesSortDesc: (fn: (prev: boolean) => boolean) => void;

  timelineShowDoneEvents: boolean;
  setTimelineShowDoneEvents: (v: boolean) => void;

  timelineCompressStart: string;
  setTimelineCompressStart: (v: string) => void;
  timelineCompressEnd: string;
  setTimelineCompressEnd: (v: string) => void;

  onRefresh: () => void;
  onSetStatus: (msg: string) => void;
  onCompressRangeWithMerge: (a: number, b: number) => void;
  onDeleteRange: (a: number, b: number) => Promise<void>;
  onMarkTimelineEventStatus: (eventId: string, status: "open" | "done") => Promise<void>;
}) {
  const {
    busy,
    timelineBusy,
    activeBook,
    timelineIndex,
    memoryTab,
    setMemoryTab,
    memoryExpanded,
    setMemoryExpanded,
    memoryChaptersSortDesc,
    setMemoryChaptersSortDesc,
    memoryRangesSortDesc,
    setMemoryRangesSortDesc,
    timelineShowDoneEvents,
    setTimelineShowDoneEvents,
    timelineCompressStart,
    setTimelineCompressStart,
    timelineCompressEnd,
    setTimelineCompressEnd,
    onRefresh,
    onSetStatus,
    onCompressRangeWithMerge,
    onDeleteRange,
    onMarkTimelineEventStatus
  } = props;

  return (
    <div className="timelinePanel">
      <div className="timelineTopRow">
        <button type="button" className="btnSort" disabled={busy || timelineBusy || !activeBook} onClick={onRefresh}>
          刷新
        </button>
        <div className="row">
          <button
            type="button"
            className={`btnSort ${memoryTab === "chapters" ? "active" : ""}`}
            disabled={busy}
            onClick={() => setMemoryTab("chapters")}
          >
            章节概要
          </button>
          <button
            type="button"
            className={`btnSort ${memoryTab === "ranges" ? "active" : ""}`}
            disabled={busy}
            onClick={() => setMemoryTab("ranges")}
          >
            多章概要
          </button>
          <button
            type="button"
            className="btnSort"
            disabled={busy}
            onClick={() => setMemoryChaptersSortDesc((v) => (memoryTab === "chapters" ? !v : v))}
            style={{ display: memoryTab === "chapters" ? undefined : "none" }}
            title="切换章节概要排序"
          >
            {memoryChaptersSortDesc ? "降序" : "升序"}
          </button>
          <button
            type="button"
            className="btnSort"
            disabled={busy}
            onClick={() => setMemoryRangesSortDesc((v) => (memoryTab === "ranges" ? !v : v))}
            style={{ display: memoryTab === "ranges" ? undefined : "none" }}
            title="切换多章概要排序"
          >
            {memoryRangesSortDesc ? "降序" : "升序"}
          </button>
        </div>
      </div>

      {memoryTab === "ranges" ? (
        <>
          <label className="toggle timelineToggle">
            <input
              type="checkbox"
              checked={timelineShowDoneEvents}
              onChange={(e) => setTimelineShowDoneEvents(e.target.checked)}
              disabled={busy}
            />
            显示已完成事件
          </label>

          <div className="timelineSection">
            <div className="auditPanelTitle">推荐压缩区间</div>
            {timelineIndex?.compressionSuggestions?.length ? (
              <div className="timelineSuggestionList">
                {timelineIndex.compressionSuggestions.map((s: any, i: number) => (
                  <button
                    key={`${s.startChapter}-${s.endChapter}-${i}`}
                    type="button"
                    className="timelineSuggestion"
                    disabled={busy || timelineBusy || !activeBook}
                    onClick={() => {
                      setTimelineCompressStart(String(s.startChapter));
                      setTimelineCompressEnd(String(s.endChapter));
                      onCompressRangeWithMerge(s.startChapter, s.endChapter);
                    }}
                    title={s.why}
                  >
                    压缩 第 {s.startChapter}-{s.endChapter} 章
                    <span className="muted timelineSuggestionWhy">{s.why}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="muted auditPanelEmpty">暂无推荐。完成一次分析后会自动生成。</div>
            )}
          </div>

          <div className="timelineSection">
            <div className="auditPanelTitle">压缩章节</div>
            <div className="timelineCompressRow">
              <input
                className="timelineInput"
                value={timelineCompressStart}
                onChange={(e) => setTimelineCompressStart(e.target.value)}
                placeholder="起始章号"
                inputMode="numeric"
                disabled={busy || timelineBusy || !activeBook}
              />
              <span className="muted">到</span>
              <input
                className="timelineInput"
                value={timelineCompressEnd}
                onChange={(e) => setTimelineCompressEnd(e.target.value)}
                placeholder="结束章号"
                inputMode="numeric"
                disabled={busy || timelineBusy || !activeBook}
              />
              <button
                type="button"
                className="btnSort"
                disabled={busy || timelineBusy || !activeBook}
                onClick={() => {
                  const a = parseInt(timelineCompressStart, 10);
                  const b = parseInt(timelineCompressEnd, 10);
                  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1) {
                    onSetStatus("请输入有效的起止章号。");
                    return;
                  }
                  onCompressRangeWithMerge(a, b);
                }}
              >
                {timelineBusy ? "压缩中…" : "压缩"}
              </button>
            </div>
            <div className="muted timelineHint">已压缩的区间可再次压缩（会覆盖更新）。</div>
          </div>

          <div className="timelineSection">
            <div className="auditPanelTitle">区间压缩摘要</div>
            {timelineIndex?.compressedRanges?.length ? (
              <div className="timelineRangeList">
                {([...timelineIndex.compressedRanges] as any[])
                  .slice()
                  .sort((x: any, y: any) => {
                    const ax = Number(x?.startChapter);
                    const ay = Number(y?.startChapter);
                    const bx = Number(x?.endChapter);
                    const by = Number(y?.endChapter);
                    const dx = (Number.isFinite(ax) ? ax : 0) - (Number.isFinite(ay) ? ay : 0);
                    const dy = (Number.isFinite(bx) ? bx : 0) - (Number.isFinite(by) ? by : 0);
                    const v = dx || dy;
                    return memoryRangesSortDesc ? -v : v;
                  })
                  .map((r: any, i: number) => {
                    const key = `range:${r.startChapter}-${r.endChapter}`;
                    const expanded = Boolean(memoryExpanded[key]);
                    const txt = String(r.summary || "").trim();
                    const needToggle = txt.length >= 60;
                    return (
                      <div key={`${r.startChapter}-${r.endChapter}-${i}`} className="timelineRangeItem">
                        <div className="timelineRangeTop">
                          <div className="timelineRangeTitle">第 {r.startChapter}-{r.endChapter} 章</div>
                          <button
                            type="button"
                            className="btnSort"
                            disabled={busy || timelineBusy || !activeBook}
                            onClick={() => onCompressRangeWithMerge(r.startChapter, r.endChapter)}
                          >
                            再次压缩
                          </button>
                          <button
                            type="button"
                            className="btnSort"
                            disabled={busy || timelineBusy || !activeBook}
                            onClick={async () => {
                              if (!activeBook) return;
                              const ok = window.confirm(
                                `确认删除第 ${r.startChapter}-${r.endChapter} 章的多章概要？\n（不会影响章节概要）`
                              );
                              if (!ok) return;
                              await onDeleteRange(r.startChapter, r.endChapter);
                            }}
                          >
                            分解压缩
                          </button>
                        </div>
                        <div className={expanded ? "timelineRangeSummary" : "timelineRangeSummary memoryClamp2"}>{txt}</div>
                        {needToggle ? (
                          <button
                            type="button"
                            className="btnLinkMuted"
                            disabled={busy}
                            onClick={() =>
                              setMemoryExpanded((prev) => ({
                                ...prev,
                                [key]: !Boolean(prev[key])
                              }))
                            }
                          >
                            {expanded ? "收起" : "…展开"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="muted auditPanelEmpty">暂无压缩区间。</div>
            )}
          </div>

          <div className="timelineSection">
            <div className="auditPanelTitle">关键事件</div>
            {timelineIndex?.events?.length ? (
              <div className="timelineEventList">
                {timelineIndex.events
                  .filter((e: any) => (timelineShowDoneEvents ? true : e.status !== "done"))
                  .filter((e: any) =>
                    timelineShowDoneEvents ? true : !(timelineIndex.manual?.doneEventIds ?? []).includes(e.id)
                  )
                  .slice(0, 200)
                  .map((e: any) => {
                    const done = (timelineIndex.manual?.doneEventIds ?? []).includes(e.id) || e.status === "done";
                    return (
                      <div key={e.id} className={`timelineEventItem ${done ? "done" : ""}`} data-event-id={e.id}>
                        <div className="timelineEventTop">
                          <div className="timelineEventTitle">
                            第 {e.startChapter}
                            {e.endChapter !== e.startChapter ? `-${e.endChapter}` : ""} 章 · {e.title}
                          </div>
                          <button
                            type="button"
                            className="btnSort"
                            disabled={busy || timelineBusy || !activeBook}
                            onClick={() => void onMarkTimelineEventStatus(e.id, done ? "open" : "done")}
                          >
                            {done ? "取消完成" : "标记完成"}
                          </button>
                        </div>
                        <div className="timelineEventSummary muted">{e.summary}</div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="muted auditPanelEmpty">事件将在后续版本中逐步补全（目前以每章摘要为主）。</div>
            )}
          </div>
        </>
      ) : (
        <div className="timelineSection">
          <div className="auditPanelTitle">章节概要</div>
          {timelineIndex?.chapters?.length ? (
            <div className="timelineChapterList">
              {[...timelineIndex.chapters]
                .slice()
                .sort((a: any, b: any) => {
                  const va = Number(a?.chapter);
                  const vb = Number(b?.chapter);
                  const d = (Number.isFinite(va) ? va : 0) - (Number.isFinite(vb) ? vb : 0);
                  return memoryChaptersSortDesc ? -d : d;
                })
                .slice(0, 120)
                .map((c: any) => {
                  const key = `chapter:${c.filename}`;
                  const expanded = Boolean(memoryExpanded[key]);
                  const txt = String(c.gistL1 || "").trim();
                  const needToggle = txt.length >= 60;
                  return (
                    <div key={c.filename} className="timelineChapterItem">
                      <div className="timelineChapterTop">
                        <div className="timelineChapterTitle">
                          第 {c.chapter} 章 · {c.title}
                        </div>
                        <div className="muted timelineChapterMeta">{c.filename}</div>
                      </div>
                      <div className={expanded ? "timelineChapterGist" : "timelineChapterGist memoryClamp2"}>{txt}</div>
                      {needToggle ? (
                        <button
                          type="button"
                          className="btnLinkMuted"
                          disabled={busy}
                          onClick={() =>
                            setMemoryExpanded((prev) => ({
                              ...prev,
                              [key]: !Boolean(prev[key])
                            }))
                          }
                        >
                          {expanded ? "收起" : "…展开"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="muted auditPanelEmpty">还没有章节概要。对任意章节完成一次分析后，这里会出现。</div>
          )}
        </div>
      )}
    </div>
  );
}

