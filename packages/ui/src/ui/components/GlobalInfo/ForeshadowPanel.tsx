import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChapterMeta } from "../../api";
import { hideAuditForeshadow } from "../../api";

export type ForeshadowItem = {
  id: string;
  title: string;
  status?: string;
  firstChapter?: number | null;
  lastChapter?: number | null;
  lastProgress?: string;
  note?: string;
};

type StatusFilter = "all" | "open" | "progress" | "closed";

function statusLabel(s: string) {
  if (s === "closed") return "已回收";
  if (s === "progress") return "推进中";
  return "未回收";
}

function badgeClass(s: string) {
  if (s === "closed") return "foreshadowBadge foreshadowBadgeClosed";
  if (s === "progress") return "foreshadowBadge foreshadowBadgeProgress";
  return "foreshadowBadge foreshadowBadgeOpen";
}

function previewText(lastProgress: string, note: string) {
  if (lastProgress && note) return `${lastProgress} · ${note}`;
  return lastProgress || note;
}

export function ForeshadowPanel({
  busy,
  activeBook,
  chapters,
  auditForeshadowsIndex,
  setAuditForeshadowsIndex,
  foreshadowExpanded,
  setForeshadowExpanded,
  setForeshadowCreateOpen,
  setHiddenForeshadowPanelOpen,
  setStatus,
  openEditForeshadow,
  onOpenChapter
}: {
  busy: boolean;
  activeBook: string;
  chapters: ChapterMeta[];
  auditForeshadowsIndex: any;
  setAuditForeshadowsIndex: (index: any) => void;
  foreshadowExpanded: Record<string, boolean>;
  setForeshadowExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setForeshadowCreateOpen: (open: boolean) => void;
  setHiddenForeshadowPanelOpen: (open: boolean) => void;
  setStatus: (msg: string) => void;
  openEditForeshadow: (f: unknown) => void;
  onOpenChapter: (chapter: ChapterMeta) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const { all, visible, hidden } = useMemo(() => {
    const list: ForeshadowItem[] = Array.isArray(auditForeshadowsIndex?.foreshadows)
      ? (auditForeshadowsIndex.foreshadows as any[])
          .map((f) => ({
            ...f,
            id: String(f?.id || "").trim(),
            title: String(f?.title || "").trim(),
            status: String(f?.status || "open"),
            lastProgress: String(f?.lastProgress || "").trim(),
            note: String(f?.note || "").trim()
          }))
          .filter((f) => f.id && f.title)
      : [];
    const hiddenSet = new Set(
      Array.isArray(auditForeshadowsIndex?.hiddenIds)
        ? (auditForeshadowsIndex.hiddenIds as any[]).map((x) => String(x))
        : []
    );
    return {
      all: list,
      visible: list.filter((f) => !hiddenSet.has(f.id)),
      hidden: list.filter((f) => hiddenSet.has(f.id))
    };
  }, [auditForeshadowsIndex]);

  const counts = useMemo(() => {
    const c = { all: visible.length, open: 0, progress: 0, closed: 0 };
    for (const f of visible) {
      const st = String(f.status || "open");
      if (st === "closed") c.closed++;
      else if (st === "progress") c.progress++;
      else c.open++;
    }
    return c;
  }, [visible]);

  const filtered = useMemo(() => {
    let list = visible;
    if (statusFilter !== "all") {
      list = list.filter((f) => {
        const st = String(f.status || "open");
        if (statusFilter === "closed") return st === "closed";
        if (statusFilter === "progress") return st === "progress";
        return st !== "closed" && st !== "progress";
      });
    }
    return list.slice().sort((a, b) => {
      const la = Number(a.lastChapter) || Number(a.firstChapter) || 0;
      const lb = Number(b.lastChapter) || Number(b.firstChapter) || 0;
      if (lb !== la) return sortDesc ? lb - la : la - lb;
      return sortDesc ? b.title.localeCompare(a.title, "zh") : a.title.localeCompare(b.title, "zh");
    });
  }, [visible, statusFilter, sortDesc]);

  const menuItem = menuId ? visible.find((f) => f.id === menuId) : null;

  const closeMenu = useCallback(() => {
    setMenuId(null);
    setMenuPos(null);
  }, []);

  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId, closeMenu]);

  const openMenu = (id: string, anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    setMenuId(id);
    setMenuPos({ top: r.bottom + 4, left: r.right });
  };

  const toggleExpanded = (id: string) => {
    setForeshadowExpanded((prev) => ({ ...prev, [id]: !Boolean(prev[id]) }));
  };

  const openChapterByNo = (chapterNo: number | null) => {
    if (!chapterNo || !activeBook) return;
    const c = chapters.find((x) => x.id === String(chapterNo));
    if (c) void onOpenChapter(c);
  };

  const filterChips: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "全部", count: counts.all },
    { id: "open", label: "未收", count: counts.open },
    { id: "progress", label: "推进中", count: counts.progress },
    { id: "closed", label: "已收", count: counts.closed }
  ];

  return (
    <div className="foreshadowPanel">
      <div className="foreshadowToolbar">
        <div className="foreshadowToolbarRow">
          <button
            type="button"
            className="btnSort"
            disabled={busy || !activeBook}
            onClick={() => setForeshadowCreateOpen(true)}
          >
            新增伏笔
          </button>
          <button
            type="button"
            className="btnSort"
            disabled={busy}
            title={sortDesc ? "按最近章节降序" : "按最近章节升序"}
            onClick={() => setSortDesc((v) => !v)}
          >
            {sortDesc ? "⇩ 新→旧" : "⇧ 旧→新"}
          </button>
          <span className="foreshadowCount muted">
            {filtered.length}
            {statusFilter !== "all" ? ` / ${visible.length}` : ""} 条
          </span>
        </div>
        <div className="foreshadowFilterRow" role="tablist" aria-label="伏笔状态筛选">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === chip.id}
              className={`foreshadowFilterChip ${statusFilter === chip.id ? "active" : ""}`}
              disabled={busy}
              onClick={() => setStatusFilter(chip.id)}
            >
              {chip.label}
              <span className="foreshadowFilterCount">{chip.count}</span>
            </button>
          ))}
        </div>
        <p className="foreshadowHint muted">
          审计本章后会从 openLoops / closedLoops 自动写入；也可手动新增与编辑。
        </p>
      </div>

      {filtered.length ? (
        <div className="foreshadowList">
          {filtered.map((f) => {
            const st = String(f.status || "open");
            const first = Number.isFinite(Number(f.firstChapter)) ? Number(f.firstChapter) : null;
            const last = Number.isFinite(Number(f.lastChapter)) ? Number(f.lastChapter) : null;
            const expanded = Boolean(foreshadowExpanded[f.id]);
            const lastProgressText = String(f.lastProgress || "").trim();
            const noteText = String(f.note || "").trim();
            const preview = previewText(lastProgressText, noteText);

            return (
              <article
                key={f.id}
                className={`foreshadowCard ${expanded ? "expanded" : "collapsed"}`}
                data-foreshadow-id={f.id}
                onDoubleClick={() => toggleExpanded(f.id)}
              >
                <div className="foreshadowCardHead">
                  <button
                    type="button"
                    className="foreshadowExpandBtn"
                    disabled={busy}
                    aria-expanded={expanded}
                    title={expanded ? "收起" : "展开"}
                    onClick={() => toggleExpanded(f.id)}
                  >
                    {expanded ? "▼" : "▶"}
                  </button>
                  <div className="foreshadowCardMain">
                    <div className="foreshadowCardTitleLine">
                      <h3 className="foreshadowTitle">{f.title}</h3>
                      <span className={badgeClass(st)}>{statusLabel(st)}</span>
                    </div>
                    <div className="foreshadowCardMetaRow">
                      <div className="foreshadowMeta muted">
                        {first ? (
                          <button
                            type="button"
                            className="btnLinkMuted"
                            disabled={busy || !activeBook}
                            onClick={() => openChapterByNo(first)}
                          >
                            首次 第{first}章
                          </button>
                        ) : (
                          <span>首次 —</span>
                        )}
                        <span className="mutedDot">·</span>
                        {last ? (
                          <button
                            type="button"
                            className="btnLinkMuted"
                            disabled={busy || !activeBook}
                            onClick={() => openChapterByNo(last)}
                          >
                            最近 第{last}章
                          </button>
                        ) : (
                          <span>最近 —</span>
                        )}
                      </div>
                      <div className="foreshadowCardActions">
                        <button
                          type="button"
                          className={`foreshadowMoreBtn ${menuId === f.id ? "active" : ""}`}
                          disabled={busy || !activeBook}
                          aria-haspopup="menu"
                          aria-expanded={menuId === f.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (menuId === f.id) closeMenu();
                            else openMenu(f.id, e.currentTarget);
                          }}
                        >
                          ⋯
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {!expanded && preview ? <div className="foreshadowPreview muted">{preview}</div> : null}

                {expanded && (lastProgressText || noteText) ? (
                  <div className="foreshadowDetails">
                    {lastProgressText ? (
                      <div className="foreshadowRow">
                        <div className="foreshadowLabel">最近推进</div>
                        <div className="foreshadowValue">{lastProgressText}</div>
                      </div>
                    ) : null}
                    {noteText ? (
                      <div className="foreshadowRow">
                        <div className="foreshadowLabel">备注</div>
                        <div className="foreshadowValue">{noteText}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : visible.length && statusFilter !== "all" ? (
        <div className="foreshadowEmpty muted">当前筛选下暂无伏笔，可切换「全部」查看。</div>
      ) : (
        <div className="foreshadowEmpty muted">暂无伏笔。完成章节审计后会自动沉淀，也可点击「新增伏笔」。</div>
      )}

      {hidden.length ? (
        <div className="foreshadowFooter muted">
          <button
            type="button"
            className="btnLinkMuted"
            disabled={busy || !activeBook}
            onClick={() => setHiddenForeshadowPanelOpen(true)}
          >
            已隐藏 {hidden.length} / {all.length} 条 · 点击查看
          </button>
        </div>
      ) : null}

      {menuItem && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="foreshadowEntryMenu foreshadowEntryMenuFloating"
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
                  openEditForeshadow(menuItem);
                }}
              >
                编辑
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={async () => {
                  if (!activeBook) return;
                  closeMenu();
                  try {
                    const { index } = await hideAuditForeshadow(activeBook, {
                      id: menuItem.id,
                      hidden: true
                    });
                    setAuditForeshadowsIndex(index);
                  } catch (e: any) {
                    setStatus(e?.message || String(e));
                  }
                }}
              >
                隐藏
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
