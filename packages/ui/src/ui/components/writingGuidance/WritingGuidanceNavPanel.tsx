import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GuidanceSession, GuidanceTurn } from "../../api";
import {
  sessionHasStarredTurn,
  sortGuidanceSessions,
  turnLabel
} from "../../hooks/useWritingGuidance";
import { useWritingGuidanceContext } from "./WritingGuidanceContext";

const BUILT_IN_NOTEBOOK_ID = "default";
const LONG_PRESS_MS = 480;

function isCustomNotebook(nb: { builtIn?: boolean; id: string }) {
  return !nb.builtIn && nb.id !== BUILT_IN_NOTEBOOK_ID;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

function moveBefore(ids: string[], activeId: string, targetId: string): string[] {
  if (activeId === targetId) return ids;
  const without = ids.filter((id) => id !== activeId);
  const idx = without.indexOf(targetId);
  if (idx < 0) return ids;
  const next = [...without];
  next.splice(idx, 0, activeId);
  return next;
}

export function WritingGuidanceNavPanel() {
  const ctx = useWritingGuidanceContext();
  const {
    guidance,
    sortDesc,
    setSortDesc,
    activeNotebookId,
    setActiveNotebookId,
    selectedSessionId,
    setSelectedSessionId,
    sessions,
    disabled,
    handleNewSession,
    handleNewNotebook,
    handleDeleteNotebook,
    handleDeleteSession,
    renamingId,
    renameDraft,
    setRenameDraft,
    tabsEditMode,
    setTabsEditMode,
    renamingSessionId,
    sessionRenameDraft,
    setSessionRenameDraft,
    commitRenameNotebook,
    commitRenameSession,
    startRenameNotebook,
    expandedSessionIds,
    toggleSessionExpanded,
    applyExpandedToSessions,
    showStarredOnly,
    setShowStarredOnly,
    revealAllTurnsSessionId,
    hiddenBucketOpen,
    toggleHiddenBucket,
    scrollToTurn
  } = ctx;

  const notebooks = guidance.index?.notebooks ?? [];
  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId) ?? notebooks[0];
  const hasCustomNotebook = notebooks.some(isCustomNotebook);

  const [reorderDragId, setReorderDragId] = useState<string | null>(null);
  const [draftOrderIds, setDraftOrderIds] = useState<string[] | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [menuSession, setMenuSession] = useState<GuidanceSession | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const sortedSessions = useMemo(
    () => sortGuidanceSessions(sessions, sortDesc),
    [sessions, sortDesc]
  );

  const displaySessions = useMemo(() => {
    const ids = draftOrderIds ?? sortedSessions.map((s) => s.id);
    const map = new Map(sessions.map((s) => [s.id, s]));
    return ids.map((id) => map.get(id)).filter((s): s is GuidanceSession => Boolean(s));
  }, [draftOrderIds, sortedSessions, sessions]);

  const visibleSessions = useMemo(() => {
    if (!showStarredOnly) return displaySessions;
    return displaySessions.filter((s) => sessionHasStarredTurn(s));
  }, [displaySessions, showStarredOnly]);

  const visibleSessionIds = useMemo(
    () => visibleSessions.map((s) => s.id),
    [visibleSessions]
  );

  const allVisibleExpanded = useMemo(
    () =>
      visibleSessionIds.length > 0 &&
      visibleSessionIds.every((id) => expandedSessionIds.has(id)),
    [visibleSessionIds, expandedSessionIds]
  );

  const toggleExpandAllVisible = useCallback(() => {
    applyExpandedToSessions(visibleSessionIds, !allVisibleExpanded);
  }, [applyExpandedToSessions, visibleSessionIds, allVisibleExpanded]);

  const menuOtherNotebooks = useMemo(
    () => notebooks.filter((n) => n.id !== menuSession?.notebookId),
    [notebooks, menuSession?.notebookId]
  );

  const closeMenu = useCallback(() => {
    setMenuSession(null);
    setMenuPos(null);
    menuTriggerRef.current = null;
  }, []);

  const openMenu = useCallback((session: GuidanceSession, el: HTMLButtonElement) => {
    const r = el.getBoundingClientRect();
    setMenuSession(session);
    setMenuPos({ top: r.bottom + 4, left: r.right });
    menuTriggerRef.current = el;
  }, []);

  useLayoutEffect(() => {
    if (!menuSession || !menuPos || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    let top = menuPos.top;
    let left = menuPos.left;
    if (rect.bottom > window.innerHeight - pad) top = Math.max(pad, menuPos.top - rect.height - 8);
    if (rect.left > window.innerWidth - pad) left = window.innerWidth - pad;
    if (left !== menuPos.left || top !== menuPos.top) setMenuPos({ top, left });
  }, [menuSession, menuPos]);

  useEffect(() => {
    if (!menuSession) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuTriggerRef.current?.contains(t)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuSession, closeMenu]);

  const handleMigrateSession = async (session: GuidanceSession, targetNotebookId: string) => {
    closeMenu();
    if (targetNotebookId === session.notebookId) return;
    try {
      await guidance.patchSession(session.id, { notebookId: targetNotebookId });
      if (selectedSessionId === session.id && targetNotebookId !== activeNotebookId) {
        setSelectedSessionId(null);
      }
    } catch {
      /* hook */
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const finishingReorderRef = useRef(false);

  const finishReorder = useCallback(async () => {
    if (finishingReorderRef.current) return;
    const nbId = activeNotebook?.id;
    if (!reorderDragId || !draftOrderIds?.length || !nbId) {
      setReorderDragId(null);
      setDraftOrderIds(null);
      setDropTargetId(null);
      return;
    }
    finishingReorderRef.current = true;
    try {
      await guidance.reorderSessions(nbId, draftOrderIds);
    } catch {
      /* hook */
    } finally {
      finishingReorderRef.current = false;
      setReorderDragId(null);
      setDraftOrderIds(null);
      setDropTargetId(null);
    }
  }, [activeNotebook?.id, reorderDragId, draftOrderIds, guidance]);

  const findRowIdAtY = useCallback(
    (clientY: number) => {
      for (const s of visibleSessions) {
        const el = rowRefs.current.get(s.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) return s.id;
      }
      return null;
    },
    [visibleSessions]
  );

  useEffect(() => {
    if (!reorderDragId) return;
    const onMove = (e: PointerEvent) => {
      const targetId = findRowIdAtY(e.clientY);
      setDropTargetId(targetId);
      if (targetId && targetId !== reorderDragId) {
        setDraftOrderIds((ids) => (ids ? moveBefore(ids, reorderDragId, targetId) : ids));
      }
    };
    const onUp = () => {
      void finishReorder();
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 300);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
    };
  }, [reorderDragId, findRowIdAtY, finishReorder]);

  const getNavTurnGroups = (session: GuidanceSession) => {
    if (showStarredOnly) {
      const starred = session.turns.filter((t) => t.starred);
      return { main: starred, hidden: [] as GuidanceTurn[], showBucket: false };
    }
    const revealAll = revealAllTurnsSessionId === session.id;
    const turns = session.turns;
    if (revealAll) return { main: turns, hidden: [] as GuidanceTurn[], showBucket: false };
    const main = turns.filter((t) => !t.hidden);
    const hidden = turns.filter((t) => t.hidden);
    return { main, hidden, showBucket: hidden.length > 0 };
  };

  const onRowPointerDown = (sessionId: string, e: React.PointerEvent) => {
    if (disabled || renamingSessionId) return;
    clearLongPressTimer();
    const target = e.currentTarget as HTMLDivElement;
    longPressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      setReorderDragId(sessionId);
      setDraftOrderIds(sortedSessions.map((s) => s.id));
      setDropTargetId(sessionId);
      target.setPointerCapture(e.pointerId);
    }, LONG_PRESS_MS);
  };

  const onRowPointerUp = () => {
    clearLongPressTimer();
    if (!reorderDragId) return;
    void finishReorder();
  };

  return (
    <div className="writingGuidanceNavPanel navGlobalScroll">
      <p className="writingGuidanceDisclaimer muted">
        指导与示例仅供写法参考，请自行创作；示例不使用本书角色名。
      </p>

      <div className="bookNotesTabsRow">
        <div className="bookNotesNotebookTabs" role="tablist" aria-label="指导笔记本">
          {notebooks.map((nb) =>
            renamingId === nb.id ? (
              <input
                key={nb.id}
                className="bookNotesTabRenameInput"
                value={renameDraft}
                autoFocus
                disabled={disabled}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => void commitRenameNotebook()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRenameNotebook();
                  if (e.key === "Escape") ctx.setRenamingId(null);
                }}
              />
            ) : tabsEditMode && isCustomNotebook(nb) ? (
              <span
                key={nb.id}
                className={`bookNotesTabWrap ${activeNotebook?.id === nb.id ? "active" : ""}`}
              >
                <button
                  type="button"
                  role="tab"
                  className="bookNotesTab"
                  aria-selected={activeNotebook?.id === nb.id}
                  disabled={disabled}
                  onClick={() => setActiveNotebookId(nb.id)}
                  onDoubleClick={() => startRenameNotebook(nb)}
                >
                  {nb.name}
                </button>
                <button
                  type="button"
                  className="bookNotesTabDel"
                  title="删除笔记本（须先清空会话）"
                  disabled={disabled}
                  aria-label={`删除「${nb.name}」`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteNotebook(nb);
                  }}
                >
                  ×
                </button>
              </span>
            ) : (
              <button
                key={nb.id}
                type="button"
                role="tab"
                className={`bookNotesTab ${activeNotebook?.id === nb.id ? "active" : ""}`}
                aria-selected={activeNotebook?.id === nb.id}
                disabled={disabled}
                onClick={() => setActiveNotebookId(nb.id)}
                onDoubleClick={() => {
                  if (tabsEditMode) startRenameNotebook(nb);
                }}
                title={tabsEditMode ? "双击重命名" : undefined}
              >
                {nb.name}
              </button>
            )
          )}
          <button
            type="button"
            className="bookNotesTabAdd"
            title="新建笔记本"
            disabled={disabled}
            onClick={() => {
              if (tabsEditMode) setTabsEditMode(false);
              void handleNewNotebook();
            }}
          >
            +
          </button>
        </div>
        {hasCustomNotebook ? (
          <button
            type="button"
            className={`btnSort bookNotesTabsEditBtn ${tabsEditMode ? "active" : ""}`}
            disabled={disabled}
            onClick={() => {
              setTabsEditMode((v) => !v);
              ctx.setRenamingId(null);
            }}
          >
            {tabsEditMode ? "完成" : "编辑"}
          </button>
        ) : null}
      </div>

      <div className="bookNotesToolbar writingGuidanceToolbar">
        <div className="writingGuidanceToolbarMain">
          <div className="writingGuidanceToolbarGroup" role="group" aria-label="列表视图">
            <button
              type="button"
              className="btnSort"
              disabled={disabled}
              title={sortDesc ? "切换为升序" : "切换为降序"}
              onClick={() => setSortDesc((v) => !v)}
            >
              {sortDesc ? "⇩ 倒序" : "⇧ 正序"}
            </button>
            <button
              type="button"
              className="btnSort"
              disabled={disabled || visibleSessionIds.length === 0}
              title={allVisibleExpanded ? "收起当前列表中的分组" : "展开当前列表中的分组"}
              onClick={toggleExpandAllVisible}
            >
              {allVisibleExpanded ? "收起" : "展开"}
            </button>
            <button
              type="button"
              className={`btnSort ${showStarredOnly ? "active" : ""}`}
              disabled={disabled}
              title="只显示含收藏子项的分组"
              onClick={() => setShowStarredOnly((v) => !v)}
            >
              ★ 收藏
            </button>
          </div>
          <button
            type="button"
            className="btnSort writingGuidanceToolbarNew"
            disabled={disabled || !activeNotebook}
            onClick={() => void handleNewSession()}
          >
            + 新指导
          </button>
        </div>
        <span className="bookNotesCount writingGuidanceToolbarCount muted">
          {showStarredOnly ? `${visibleSessions.length}/${displaySessions.length}` : visibleSessions.length} 条
        </span>
      </div>
      <p className="writingGuidanceListHint muted">
        点击分组展开/收起 · 子项右侧 ★ 收藏 · 双击子项可隐藏 · 长按排序
      </p>

      {guidance.error ? <div className="bookNotesErr">{guidance.error}</div> : null}

      <div className="writingGuidanceSessionList writingGuidanceSessionListNav">
        {guidance.loading && !guidance.index ? (
          <div className="bookNotesEmpty muted">加载中…</div>
        ) : displaySessions.length === 0 ? (
          <div className="bookNotesEmpty muted">暂无指导，点「+ 新指导」开始</div>
        ) : visibleSessions.length === 0 ? (
          <div className="bookNotesEmpty muted">暂无收藏，在子项右侧点 ★ 标记</div>
        ) : (
          visibleSessions.map((session) => {
            const hasStarred = sessionHasStarredTurn(session);
            const active = session.id === selectedSessionId;
            const dragging = reorderDragId === session.id;
            const dropTarget = dropTargetId === session.id && reorderDragId && !dragging;
            const expanded = expandedSessionIds.has(session.id);
            const { main: mainTurns, hidden: hiddenTurns, showBucket } = getNavTurnGroups(session);
            const bucketOpen = hiddenBucketOpen.has(session.id);
            return (
              <div
                key={session.id}
                className={`writingGuidanceSessionTreeItem ${hasStarred ? "hasStarredTurns" : ""}`}
                ref={(el) => {
                  if (el) rowRefs.current.set(session.id, el);
                  else rowRefs.current.delete(session.id);
                }}
              >
                <div
                  className={`writingGuidanceSessionRow ${active ? "active" : ""} ${dragging ? "reorderDragging" : ""} ${dropTarget ? "reorderDropTarget" : ""}`}
                  onPointerDown={(e) => onRowPointerDown(session.id, e)}
                  onPointerUp={onRowPointerUp}
                  onPointerCancel={onRowPointerUp}
                >
                  <div
                    className="writingGuidanceSessionMain"
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => {
                      if (suppressClickRef.current || reorderDragId) return;
                      setSelectedSessionId(session.id);
                      toggleSessionExpanded(session.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !reorderDragId) {
                        setSelectedSessionId(session.id);
                        toggleSessionExpanded(session.id);
                      }
                    }}
                  >
                    {renamingSessionId === session.id ? (
                      <input
                        className="writingGuidanceSessionRename"
                        value={sessionRenameDraft}
                        autoFocus
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setSessionRenameDraft(e.target.value)}
                        onBlur={() => void commitRenameSession()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRenameSession();
                          if (e.key === "Escape") ctx.setRenamingSessionId(null);
                        }}
                      />
                    ) : (
                      <div
                        className="writingGuidanceSessionTitle"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          ctx.setRenamingSessionId(session.id);
                          setSessionRenameDraft(session.title);
                        }}
                      >
                        <span className="writingGuidanceSessionChevron" aria-hidden>
                          {expanded ? "▼" : "▶"}
                        </span>
                        {session.title}
                      </div>
                    )}
                    <div className="writingGuidanceSessionMeta muted">
                      <span>{formatTime(session.updatedAt)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`bookNotesMoreBtn writingGuidanceSessionMore ${menuSession?.id === session.id ? "active" : ""}`}
                    disabled={disabled || Boolean(reorderDragId)}
                    title="重命名、迁移、删除"
                    aria-label={`「${session.title}」更多操作`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (menuSession?.id === session.id) {
                        closeMenu();
                        return;
                      }
                      openMenu(session, e.currentTarget);
                    }}
                  >
                    ⋯
                  </button>
                </div>
                {expanded ? (
                  <div className="writingGuidanceTurnList">
                    {mainTurns.map((turn) => (
                      <div
                        key={turn.id}
                        className={`writingGuidanceTurnRow ${turn.hidden ? "isHidden" : ""} ${turn.starred ? "starred" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (reorderDragId) return;
                          setSelectedSessionId(session.id);
                          scrollToTurn(turn.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setSelectedSessionId(session.id);
                            scrollToTurn(turn.id);
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (reorderDragId || disabled) return;
                          void guidance.patchTurn(session.id, turn.id, { hidden: !turn.hidden });
                        }}
                        title="双击隐藏/恢复此轮"
                      >
                        <span className="writingGuidanceTurnLabel">
                          {turn.hidden ? "（已隐藏）" : ""}
                          {turnLabel(turn)}
                        </span>
                        <div className="writingGuidanceTurnActions">
                          <button
                            type="button"
                            className={`writingGuidanceStarBtn sm ${turn.starred ? "on" : ""}`}
                            title={turn.starred ? "取消标记" : "标记重要"}
                            disabled={disabled}
                            onClick={(e) => {
                              e.stopPropagation();
                              void guidance.patchTurn(session.id, turn.id, {
                                starred: !turn.starred
                              });
                            }}
                          >
                            ★
                          </button>
                        </div>
                      </div>
                    ))}
                    {showBucket ? (
                      <>
                        <button
                          type="button"
                          className="writingGuidanceHiddenBucket muted"
                          onClick={() => toggleHiddenBucket(session.id)}
                        >
                          已隐藏 {hiddenTurns.length} 条 {bucketOpen ? "▲" : "▼"}
                        </button>
                        {bucketOpen
                          ? hiddenTurns.map((turn) => (
                              <div
                                key={turn.id}
                                className="writingGuidanceTurnRow isHidden"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setSelectedSessionId(session.id);
                                  scrollToTurn(turn.id);
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (disabled) return;
                                  void guidance.patchTurn(session.id, turn.id, { hidden: false });
                                }}
                                title="双击恢复显示"
                              >
                                <span className="writingGuidanceTurnLabel">（已隐藏）{turnLabel(turn)}</span>
                                <div className="writingGuidanceTurnActions">
                                  <button
                                    type="button"
                                    className={`writingGuidanceStarBtn sm ${turn.starred ? "on" : ""}`}
                                    title={turn.starred ? "取消标记" : "标记重要"}
                                    disabled={disabled}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void guidance.patchTurn(session.id, turn.id, {
                                        starred: !turn.starred
                                      });
                                    }}
                                  >
                                    ★
                                  </button>
                                </div>
                              </div>
                            ))
                          : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {menuSession && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="bookNotesEntryMenu bookNotesEntryMenuFloating"
              role="menu"
              style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
                transform: "translateX(-100%)"
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  ctx.setRenamingSessionId(menuSession.id);
                  setSessionRenameDraft(menuSession.title);
                }}
              >
                重命名
              </button>
              {menuOtherNotebooks.length ? (
                <div className="bookNotesMigrate">
                  <span className="muted">迁移到</span>
                  {menuOtherNotebooks.map((nb) => (
                    <button
                      key={nb.id}
                      type="button"
                      role="menuitem"
                      onClick={() => void handleMigrateSession(menuSession, nb.id)}
                    >
                      {nb.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => void handleDeleteSession(menuSession)}
              >
                删除
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
