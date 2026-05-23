import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BookNoteEntry, BookNotebook } from "../../api";
import { appAlert, appConfirm } from "../../dialog/dialog";
import { sortNoteEntries, useBookNotes } from "../../hooks/useBookNotes";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

const BUILT_IN_NOTEBOOK_ID = "planning";
const PREVIEW_LEN = 80;

function isCustomNotebook(nb: BookNotebook) {
  return !nb.builtIn && nb.id !== BUILT_IN_NOTEBOOK_ID;
}

function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

function previewText(content: string): string {
  const one = content.replace(/\s+/g, " ").trim();
  if (one.length <= PREVIEW_LEN) return one;
  return `${one.slice(0, PREVIEW_LEN)}…`;
}

export type BookNotesPanelProps = {
  bookId: string;
  busy: boolean;
  onStatus?: (msg: string) => void;
  /** 递增时聚焦底部输入框（如点击「备注」页签） */
  focusRequest?: number;
};

export function BookNotesPanel({ bookId, busy, onStatus, focusRequest = 0 }: BookNotesPanelProps) {
  const notes = useBookNotes(bookId);
  const [sortDesc, setSortDesc] = useLocalStorageState<boolean>({
    key: `novel-helper-notes-sort-${bookId}`,
    defaultValue: true,
    parse: (raw) => raw === "desc",
    serialize: (v) => (v ? "desc" : "asc")
  });
  const [collapsed, setCollapsed] = useLocalStorageState<Record<string, boolean>>({
    key: `novel-helper-notes-collapsed-${bookId}`,
    defaultValue: {}
  });
  const [activeNotebookId, setActiveNotebookId] = useLocalStorageState<string>({
    key: `novel-helper-notes-active-notebook-${bookId}`,
    defaultValue: BUILT_IN_NOTEBOOK_ID
  });

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [tabsEditMode, setTabsEditMode] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const editAreaRef = useRef<HTMLTextAreaElement>(null);
  const entryMenuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const notebooks = notes.index?.notebooks ?? [];

  useEffect(() => {
    if (!notebooks.length) return;
    if (!notebooks.some((n) => n.id === activeNotebookId)) {
      setActiveNotebookId(notebooks[0]!.id);
    }
  }, [notebooks, activeNotebookId, setActiveNotebookId]);

  useEffect(() => {
    if (busy || notes.loading) return;
    const id = requestAnimationFrame(() => draftRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [bookId, focusRequest, busy, notes.loading]);

  useLayoutEffect(() => {
    const el = editAreaRef.current;
    if (!el || !editingEntryId) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editDraft, editingEntryId]);

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId) ?? notebooks[0];
  const hasCustomNotebook = notebooks.some(isCustomNotebook);

  const closeEntryMenu = useCallback(() => {
    setMenuEntryId(null);
    setMenuPos(null);
    menuTriggerRef.current = null;
  }, []);

  const openEntryMenu = useCallback((entryId: string, btn: HTMLButtonElement) => {
    const rect = btn.getBoundingClientRect();
    menuTriggerRef.current = btn;
    setMenuEntryId(entryId);
    setMenuPos({ top: rect.bottom + 4, left: rect.right });
  }, []);

  const entries = useMemo(() => {
    if (!notes.index || !activeNotebook) return [];
    const filtered = notes.index.entries.filter((e) => e.notebookId === activeNotebook.id);
    return sortNoteEntries(filtered, sortDesc);
  }, [notes.index, activeNotebook, sortDesc]);

  const menuEntry = menuEntryId ? entries.find((e) => e.id === menuEntryId) : null;
  const menuOtherNotebooks = menuEntry
    ? notebooks.filter((n) => n.id !== menuEntry.notebookId)
    : [];

  useEffect(() => {
    if (!menuEntryId) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (entryMenuRef.current?.contains(t)) return;
      if (menuTriggerRef.current?.contains(t)) return;
      closeEntryMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeEntryMenu();
    };
    const onScroll = () => closeEntryMenu();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menuEntryId, closeEntryMenu]);

  const isCollapsed = (id: string) => collapsed[id] !== false;

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !isCollapsed(id) }));
  };

  const handleAddEntry = async () => {
    const text = draft.trim();
    if (!text || !activeNotebook || saving) return;
    setSaving(true);
    try {
      await notes.addEntry(activeNotebook.id, text);
      setDraft("");
      onStatus?.("备注已保存");
      draftRef.current?.focus();
    } catch {
      /* error in hook */
    } finally {
      setSaving(false);
    }
  };

  const startRenameNotebook = (nb: BookNotebook) => {
    if (!isCustomNotebook(nb)) return;
    setRenamingId(nb.id);
    setRenameDraft(nb.name);
  };

  const commitRenameNotebook = async () => {
    if (!renamingId) return;
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name) return;
    const nb = notebooks.find((n) => n.id === renamingId);
    if (!nb || nb.name === name) return;
    try {
      await notes.renameNotebook(renamingId, name);
      onStatus?.("笔记本已重命名");
    } catch {
      /* hook */
    }
  };

  const handleNewNotebook = async () => {
    try {
      const idx = await notes.addNotebook("新笔记本");
      const created = idx?.notebooks[idx.notebooks.length - 1];
      if (created) {
        setActiveNotebookId(created.id);
        startRenameNotebook(created);
      }
    } catch {
      /* hook */
    }
  };

  const handleDeleteNotebook = async (nb: BookNotebook) => {
    if (nb.builtIn || nb.id === BUILT_IN_NOTEBOOK_ID) return;
    const count = (notes.index?.entries ?? []).filter((e) => e.notebookId === nb.id).length;
    if (count > 0) {
      await appAlert({
        message: `该笔记本下有 ${count} 条备注，请先迁移或删除条目后再删除笔记本。`
      });
      return;
    }
    if (!(await appConfirm({ message: `确定删除笔记本「${nb.name}」？`, variant: "danger" }))) return;
    try {
      await notes.removeNotebook(nb.id);
      if (activeNotebookId === nb.id) {
        setActiveNotebookId(BUILT_IN_NOTEBOOK_ID);
      }
      onStatus?.("笔记本已删除");
    } catch {
      /* hook */
    }
  };

  const expandEntry = (entryId: string) => {
    setCollapsed((prev) => ({ ...prev, [entryId]: false }));
  };

  const startEditEntry = (entry: BookNoteEntry) => {
    setEditingEntryId(entry.id);
    setEditDraft(entry.content);
    closeEntryMenu();
    expandEntry(entry.id);
  };

  const commitEditEntry = async () => {
    if (!editingEntryId) return;
    const text = editDraft.trim();
    setEditingEntryId(null);
    if (!text) return;
    try {
      await notes.patchEntry(editingEntryId, { content: text });
      onStatus?.("备注已更新");
    } catch {
      /* hook */
    }
  };

  const handleTogglePin = async (entry: BookNoteEntry) => {
    try {
      await notes.patchEntry(entry.id, { pinned: !entry.pinned });
    } catch {
      /* hook */
    }
  };

  const handleDeleteEntry = async (entry: BookNoteEntry) => {
    closeEntryMenu();
    if (!(await appConfirm({ message: "确定删除这条备注？", variant: "danger" }))) return;
    try {
      await notes.removeEntry(entry.id);
      onStatus?.("备注已删除");
    } catch {
      /* hook */
    }
  };

  const handleMigrateEntry = async (entry: BookNoteEntry, targetId: string) => {
    closeEntryMenu();
    if (targetId === entry.notebookId) return;
    try {
      await notes.patchEntry(entry.id, { notebookId: targetId });
      onStatus?.("已迁移到其他笔记本");
    } catch {
      /* hook */
    }
  };

  const disabled = busy || notes.loading || saving;

  return (
    <div className="bookNotesPanel navGlobalScroll">
      <div className="bookNotesTabsRow">
        <div className="bookNotesNotebookTabs" role="tablist" aria-label="备注笔记本">
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
                  if (e.key === "Escape") setRenamingId(null);
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
                  title="删除笔记本（须先清空备注）"
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
                onDoubleClick={() => tabsEditMode && startRenameNotebook(nb)}
              >
                {nb.name}
              </button>
            )
          )}
          <button
            type="button"
            className="bookNotesTabAdd"
            title="新建笔记本"
            disabled={disabled || tabsEditMode}
            onClick={() => void handleNewNotebook()}
          >
            +
          </button>
        </div>
        {hasCustomNotebook ? (
          <button
            type="button"
            className={`btnSort bookNotesTabsEditBtn ${tabsEditMode ? "active" : ""}`}
            disabled={disabled}
            title={tabsEditMode ? "完成编辑" : "编辑笔记本：显示删除、可双击重命名"}
            onClick={() => {
              setTabsEditMode((v) => !v);
              setRenamingId(null);
            }}
          >
            {tabsEditMode ? "完成" : "编辑"}
          </button>
        ) : null}
      </div>

      <div className="bookNotesToolbar">
        <button
          type="button"
          className="btnSort"
          disabled={disabled}
          title={sortDesc ? "点击切换为升序" : "点击切换为降序"}
          onClick={() => setSortDesc((v) => !v)}
        >
          {sortDesc ? "⇩ 降序" : "⇧ 升序"}
        </button>
        <span className="bookNotesCount muted">{entries.length} 条</span>
      </div>

      {notes.error ? <div className="bookNotesErr">{notes.error}</div> : null}

      <div className="bookNotesList">
        {notes.loading && !notes.index ? (
          <div className="bookNotesEmpty muted">加载中…</div>
        ) : entries.length === 0 ? (
          <div className="bookNotesEmpty muted">暂无备注，在下方输入后按 Enter 保存</div>
        ) : (
          entries.map((entry) => {
            const collapsedRow = isCollapsed(entry.id);
            const editing = editingEntryId === entry.id;
            return (
              <div
                key={entry.id}
                className={`bookNotesEntry ${entry.pinned ? "pinned" : ""} ${collapsedRow ? "collapsed" : "expanded"}`}
                onDoubleClick={() => {
                  if (editing) return;
                  expandEntry(entry.id);
                }}
              >
                <div className="bookNotesEntryHead">
                  <button
                    type="button"
                    className="bookNotesExpandBtn"
                    title={collapsedRow ? "展开" : "收起"}
                    disabled={disabled}
                    onClick={() => toggleCollapsed(entry.id)}
                  >
                    {collapsedRow ? "▶" : "▼"}
                  </button>
                  <button
                    type="button"
                    className={`bookNotesPinBtn ${entry.pinned ? "on" : ""}`}
                    title={entry.pinned ? "取消置顶" : "置顶"}
                    disabled={disabled}
                    onClick={() => void handleTogglePin(entry)}
                  >
                    📌
                  </button>
                  <span className="bookNotesTime">{formatNoteTime(entry.createdAt)}</span>
                  <div className="bookNotesEntryActions">
                    <button
                      type="button"
                      className={`bookNotesMoreBtn ${menuEntryId === entry.id ? "active" : ""}`}
                      disabled={disabled}
                      onClick={(e) => {
                        if (menuEntryId === entry.id) {
                          closeEntryMenu();
                          return;
                        }
                        openEntryMenu(entry.id, e.currentTarget);
                      }}
                    >
                      ⋯
                    </button>
                  </div>
                </div>
                {editing ? (
                  <textarea
                    ref={editAreaRef}
                    className="bookNotesEditArea"
                    value={editDraft}
                    rows={1}
                    autoFocus
                    disabled={disabled}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={() => void commitEditEntry()}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingEntryId(null);
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void commitEditEntry();
                      }
                    }}
                  />
                ) : collapsedRow ? (
                  <div className="bookNotesPreview">{previewText(entry.content)}</div>
                ) : (
                  <div className="bookNotesBody">{entry.content}</div>
                )}
              </div>
            );
          })
        )}
      </div>

      {menuEntry && menuPos
        ? createPortal(
            <div
              ref={entryMenuRef}
              className="bookNotesEntryMenu bookNotesEntryMenuFloating"
              role="menu"
              style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
                transform: "translateX(-100%)"
              }}
            >
              <button type="button" role="menuitem" onClick={() => startEditEntry(menuEntry)}>
                编辑
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => void handleDeleteEntry(menuEntry)}
              >
                删除
              </button>
              {menuOtherNotebooks.length ? (
                <div className="bookNotesMigrate">
                  <span className="muted">迁移到</span>
                  {menuOtherNotebooks.map((nb) => (
                    <button
                      key={nb.id}
                      type="button"
                      role="menuitem"
                      onClick={() => void handleMigrateEntry(menuEntry, nb.id)}
                    >
                      {nb.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}

      <div className="bookNotesComposer">
        <textarea
          ref={draftRef}
          className="bookNotesInput"
          placeholder="输入备注… Enter 保存，Shift+Enter 换行"
          value={draft}
          rows={3}
          disabled={disabled || !activeNotebook}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleAddEntry();
            }
          }}
        />
      </div>
    </div>
  );
}
