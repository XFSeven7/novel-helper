import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChapterMeta } from "../../api";
import { hideAuditPlace } from "../../api";

export type PlaceItem = {
  name: string;
  group?: string;
  description?: string;
  lastNote?: string;
  lastChapter?: number | null;
};

export function inferPlaceGroup(name: string) {
  const n = String(name || "").trim();
  if (!n) return "未分组";
  const parts = n.split(/[·•\-\/\s]+/).map((s) => s.trim()).filter(Boolean);
  return parts[0] || "未分组";
}

function previewText(desc: string, note: string) {
  const d = desc && desc !== "-" ? desc : "";
  const n = note && note !== "-" ? note : "";
  if (d && n) return `${d} · ${n}`;
  return d || n;
}

export function PlacePanel({
  busy,
  activeBook,
  chapters,
  auditPlacesIndex,
  setAuditPlacesIndex,
  setHiddenPlacePanelOpen,
  setStatus,
  openEditPlace,
  onOpenChapter,
  revealTarget,
  onRevealHandled
}: {
  busy: boolean;
  activeBook: string;
  chapters: ChapterMeta[];
  auditPlacesIndex: any;
  setAuditPlacesIndex: (index: any) => void;
  setHiddenPlacePanelOpen: (open: boolean) => void;
  setStatus: (msg: string) => void;
  openEditPlace: (p: unknown) => void;
  onOpenChapter: (chapter: ChapterMeta) => void;
  revealTarget?: { group: string; name: string } | null;
  onRevealHandled?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>({});
  const [cardExpanded, setCardExpanded] = useState<Record<string, boolean>>({});
  const [menuName, setMenuName] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const { all, visible, hidden, grouped } = useMemo(() => {
    const list: PlaceItem[] = Array.isArray(auditPlacesIndex?.places)
      ? (auditPlacesIndex.places as any[])
          .map((p) => ({
            ...p,
            name: String(p?.name || "").trim(),
            description: String(p?.description || "").trim(),
            lastNote: String(p?.lastNote || "").trim(),
            group: String((p as any)?.group || "").trim() || inferPlaceGroup(String(p?.name || ""))
          }))
          .filter((p) => p.name)
      : [];
    const hiddenSet = new Set(
      Array.isArray(auditPlacesIndex?.hiddenNames)
        ? (auditPlacesIndex.hiddenNames as any[]).map((x) => String(x))
        : []
    );
    const vis = list.filter((p) => !hiddenSet.has(p.name));
    const q = search.trim().toLowerCase();
    const filtered = q
      ? vis.filter((p) => {
          const hay = [p.name, p.group, p.description, p.lastNote].join(" ").toLowerCase();
          return hay.includes(q);
        })
      : vis;

    const groups = new Map<string, PlaceItem[]>();
    for (const p of filtered) {
      const g = p.group || "未分组";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p);
    }
    for (const [, items] of groups) {
      items.sort((a, b) => {
        const la = Number(a.lastChapter) || 0;
        const lb = Number(b.lastChapter) || 0;
        if (lb !== la) return lb - la;
        return a.name.localeCompare(b.name, "zh");
      });
    }
    const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    return {
      all: list,
      visible: vis,
      hidden: list.filter((p) => hiddenSet.has(p.name)),
      grouped: groupNames.map((g) => ({ name: g, items: groups.get(g) || [] }))
    };
  }, [auditPlacesIndex, search]);

  const menuPlace = menuName ? visible.find((p) => p.name === menuName) : null;
  const allGroupsCollapsed = grouped.length > 0 && grouped.every((g) => groupCollapsed[g.name]);

  const closeMenu = useCallback(() => {
    setMenuName(null);
    setMenuPos(null);
  }, []);

  useEffect(() => {
    if (!revealTarget?.name) return;
    setGroupCollapsed((prev) => ({ ...prev, [revealTarget.group]: false }));
    setCardExpanded((prev) => ({ ...prev, [revealTarget.name]: true }));
    onRevealHandled?.();
  }, [revealTarget, onRevealHandled]);

  useEffect(() => {
    if (!menuName) return;
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
  }, [menuName, closeMenu]);

  const openMenu = (name: string, anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    setMenuName(name);
    setMenuPos({ top: r.bottom + 4, left: r.right });
  };

  const toggleGroup = (g: string) => {
    setGroupCollapsed((prev) => ({ ...prev, [g]: !prev[g] }));
  };

  const toggleCard = (name: string) => {
    setCardExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleAllGroups = () => {
    if (allGroupsCollapsed) {
      setGroupCollapsed({});
    } else {
      const next: Record<string, boolean> = {};
      for (const g of grouped) next[g.name] = true;
      setGroupCollapsed(next);
    }
  };

  const openChapterByNo = (chapterNo: number | null) => {
    if (!chapterNo || !activeBook) return;
    const c = chapters.find((x) => x.id === String(chapterNo));
    if (c) void onOpenChapter(c);
  };

  if (!all.length) {
    return (
      <div className="placePanel">
        <p className="placeEmpty muted">暂无地点。完成章节分析后会自动收集地点卡。</p>
      </div>
    );
  }

  return (
    <div className="placePanel">
      <div className="placeToolbar">
        <div className="placeToolbarRow">
          <input
            type="search"
            className="placeSearchInput"
            placeholder="搜索地点名、分组、简述…"
            value={search}
            disabled={busy}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="btnSort"
            disabled={busy || !grouped.length}
            onClick={toggleAllGroups}
          >
            {allGroupsCollapsed ? "展开全部分组" : "收起全部分组"}
          </button>
          <span className="placeCount muted">
            {visible.filter((p) => {
              const q = search.trim().toLowerCase();
              if (!q) return true;
              return [p.name, p.group, p.description, p.lastNote].join(" ").toLowerCase().includes(q);
            }).length}
            {search.trim() ? ` / ${visible.length}` : ""} 个
          </span>
        </div>
        <p className="placeHint muted">分析章节后自动写入；按名称前缀（如「青石村·晒谷场」）自动分组，可在编辑中修改。</p>
      </div>

      {grouped.length ? (
        <div className="placeGroups">
          {grouped.map(({ name: groupName, items }) => {
            const collapsed = !!groupCollapsed[groupName];
            return (
              <section key={groupName} className={`placeGroup ${collapsed ? "collapsed" : ""}`}>
                <button
                  type="button"
                  className="placeGroupHead"
                  disabled={busy}
                  aria-expanded={!collapsed}
                  onClick={() => toggleGroup(groupName)}
                >
                  <span className="placeGroupChevron" aria-hidden>
                    {collapsed ? "▶" : "▼"}
                  </span>
                  <span className="placeGroupTitle">{groupName}</span>
                  <span className="placeGroupCount">{items.length}</span>
                </button>
                {!collapsed ? (
                  <div className="placeGroupBody">
                    {items.map((p) => {
                      const expanded = !!cardExpanded[p.name];
                      const descText = p.description || "-";
                      const noteText = p.lastNote || "-";
                      const preview = previewText(descText, noteText);
                      const lastCh = Number.isFinite(Number(p.lastChapter)) ? Number(p.lastChapter) : null;

                      return (
                        <article
                          key={p.name}
                          className={`placeCard ${expanded ? "expanded" : "collapsed"}`}
                          data-place-name={p.name}
                          onDoubleClick={() => toggleCard(p.name)}
                        >
                          <div className="placeCardHead">
                            <button
                              type="button"
                              className="placeExpandBtn"
                              disabled={busy}
                              aria-expanded={expanded}
                              title={expanded ? "收起详情" : "展开详情"}
                              onClick={() => toggleCard(p.name)}
                            >
                              {expanded ? "▼" : "▶"}
                            </button>
                            <div className="placeCardMain">
                              <div className="placeCardTitleLine">
                                <h3 className="placeName">{p.name}</h3>
                                {lastCh ? (
                                  <button
                                    type="button"
                                    className="placeChapterBadge"
                                    disabled={busy || !activeBook}
                                    onClick={() => openChapterByNo(lastCh)}
                                  >
                                    第{lastCh}章
                                  </button>
                                ) : null}
                              </div>
                              <div className="placeCardMetaRow">
                                {p.group && p.group !== groupName ? (
                                  <span className="placeSubGroup muted">{p.group}</span>
                                ) : (
                                  <span />
                                )}
                                <div className="placeCardActions">
                                  <button
                                    type="button"
                                    className={`placeMoreBtn ${menuName === p.name ? "active" : ""}`}
                                    disabled={busy || !activeBook}
                                    aria-haspopup="menu"
                                    aria-expanded={menuName === p.name}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (menuName === p.name) closeMenu();
                                      else openMenu(p.name, e.currentTarget);
                                    }}
                                  >
                                    ⋯
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {!expanded && preview ? (
                            <div className="placePreview muted">{preview}</div>
                          ) : null}

                          {expanded ? (
                            <div className="placeDetails">
                              <div className="placeRow">
                                <div className="placeLabel">简述</div>
                                <div className="placeValue">{descText}</div>
                              </div>
                              <div className="placeRow">
                                <div className="placeLabel">本地发生</div>
                                <div className="placeValue">{noteText}</div>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="placeEmpty muted">没有匹配的地点，请调整搜索词。</div>
      )}

      {hidden.length ? (
        <div className="placeFooter muted">
          <button
            type="button"
            className="btnLinkMuted"
            disabled={busy || !activeBook}
            onClick={() => setHiddenPlacePanelOpen(true)}
          >
            已隐藏 {hidden.length} / {all.length} 个 · 点击查看
          </button>
        </div>
      ) : null}

      {menuPlace && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="placeEntryMenu placeEntryMenuFloating"
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
                  openEditPlace(menuPlace);
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
                    const { index } = await hideAuditPlace(activeBook, {
                      name: menuPlace.name,
                      hidden: true
                    });
                    setAuditPlacesIndex(index);
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
