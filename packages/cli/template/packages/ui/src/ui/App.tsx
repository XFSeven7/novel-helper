import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BookMeta,
  ChapterMeta,
  StoryFile,
  createBook,
  createChapter,
  createCharacter,
  deleteChapter,
  listBooks,
  listChapters,
  listStory,
  readChapter,
  readStoryFile,
  renameChapter,
  updateChapter,
  updateStoryFile,
  patchBookSynopsis
} from "./api";

type SelectedChapter = { bookSlug: string; filename: string } | null;
type SelectedCard = { bookSlug: string; path: string } | null;

type MobilePresetId =
  | "iphone-se"
  | "iphone-14"
  | "iphone-14-pro-max"
  | "pixel-7"
  | "galaxy-s21"
  | "ipad-mini";

const MOBILE_PRESETS: Array<{ id: MobilePresetId; label: string; w: number; h: number }> = [
  { id: "iphone-se", label: "iPhone SE (375×667)", w: 375, h: 667 },
  { id: "iphone-14", label: "iPhone 14 (390×844)", w: 390, h: 844 },
  { id: "iphone-14-pro-max", label: "iPhone 14 Pro Max (430×932)", w: 430, h: 932 },
  { id: "pixel-7", label: "Pixel 7 (412×915)", w: 412, h: 915 },
  { id: "galaxy-s21", label: "Galaxy S21 (360×800)", w: 360, h: 800 },
  { id: "ipad-mini", label: "iPad mini (768×1024)", w: 768, h: 1024 }
];

type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "novel-helper-theme";
const NAV_COLLAPSED_STORAGE_KEY = "novel-helper-nav-collapsed";

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: "system", label: "跟随系统" },
  { id: "light", label: "白天" },
  { id: "dark", label: "黑夜" }
];

const CHARACTER_ROLE_OPTIONS = ["主角", "配角", "反派", "盟友", "路人", "其他"] as const;
type CharacterRole = (typeof CHARACTER_ROLE_OPTIONS)[number];

const CHARACTER_TAG_OPTIONS = ["盟友", "敌对", "家人", "同事", "组织", "阵营"] as const;
type CharacterTag = (typeof CHARACTER_TAG_OPTIONS)[number];

function migrateLegacyTheme(raw: string | null): ThemePreference {
  if (raw === "system" || raw === "light" || raw === "dark") return raw;
  if (!raw) return "system";
  const darkLegacy = new Set(["default", "midnight", "forest", "sunset", "ocean", "loam"]);
  const lightLegacy = new Set(["paper", "sepia", "village", "meadow", "clay"]);
  if (darkLegacy.has(raw)) return "dark";
  if (lightLegacy.has(raw)) return "light";
  return "system";
}

function loadThemePreference(): ThemePreference {
  try {
    return migrateLegacyTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function formatBookCreatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function SidebarToggleIcon({ mirrored }: { mirrored: boolean }) {
  return (
    <svg
      className={`sidebarToggleSvg ${mirrored ? "sidebarToggleSvgMirrored" : ""}`}
      viewBox="0 0 1024 1024"
      width={20}
      height={20}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M109.632 673.664h519.68c25.152 0 45.568-22.016 45.568-48.896 0-26.88-20.416-48.896-45.568-48.896h-519.68c-25.216 0-45.632 22.016-45.632 48.896 0 26.88 20.48 48.896 45.632 48.896z m0-228.096h519.68c25.152 0 45.568-21.952 45.568-48.896 0-26.88-20.416-48.896-45.568-48.896h-519.68c-25.216 0-45.632 22.016-45.632 48.896 0 26.88 20.48 48.896 45.632 48.896z m3.264-219.904h795.776c26.88 0 50.56-20.352 51.328-47.168A48.896 48.896 0 0 0 911.104 128H115.328c-26.88 0-50.56 20.416-51.328 47.168a48.896 48.896 0 0 0 48.896 50.56z m619.776 447.232V348.672L960 510.784l-227.328 162.112c0 0.768 0 0.768 0 0z m178.432 122.944H115.328c-26.88 0-50.56 20.48-51.328 47.232a48.896 48.896 0 0 0 48.896 50.496h795.776c26.88 0 50.56-20.416 51.328-47.232a48.896 48.896 0 0 0-48.896-50.496z"
      />
    </svg>
  );
}

const AUTOSAVE_DEBOUNCE_MS = 900;

const CHAPTER_TITLE_RENAME_FILE_RE = /^(\d+)_.+\.md$/;

function approximateWordCount(s: string): number {
  const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (s.replace(/[\u4e00-\u9fa5]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return zh + en;
}

function normalizeChapterGapList(raw: number[]): number[] {
  return [...new Set(raw)].filter((n) => Number.isFinite(n) && n >= 1).sort((a, b) => a - b);
}

function formatMissingChapterList(gaps: number[]): string {
  return normalizeChapterGapList(gaps)
    .map((n) => `第 ${n} 章`)
    .join("、");
}

export function App() {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [activeBook, setActiveBook] = useState("");
  const [navHome, setNavHome] = useState(true);
  const [bookShelfSortDesc, setBookShelfSortDesc] = useState(false);
  const [chapterSortDesc, setChapterSortDesc] = useState(false);
  const [chapters, setChapters] = useState<ChapterMeta[]>([]);
  const [storyFiles, setStoryFiles] = useState<StoryFile[]>([]);
  const [charFiles, setCharFiles] = useState<StoryFile[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<SelectedChapter>(null);
  const [selectedCard, setSelectedCard] = useState<SelectedCard>(null);

  const [createBookModalOpen, setCreateBookModalOpen] = useState(false);
  const [chapterGapModalOpen, setChapterGapModalOpen] = useState(false);
  const [chapterGapModalBookSlug, setChapterGapModalBookSlug] = useState("");
  const [chapterGapModalIndexes, setChapterGapModalIndexes] = useState<number[]>([]);
  const [chapterGapModalDraftTitle, setChapterGapModalDraftTitle] = useState("");
  const [modalNewTitle, setModalNewTitle] = useState("");
  const [modalNewSynopsis, setModalNewSynopsis] = useState("");
  const [shelfPeekSlug, setShelfPeekSlug] = useState<string | null>(null);
  const [shelfPeekDraft, setShelfPeekDraft] = useState("");
  const [shelfPeekSaving, setShelfPeekSaving] = useState(false);

  const [chapterTitle, setChapterTitle] = useState("");
  const [createCharacterModalOpen, setCreateCharacterModalOpen] = useState(false);
  const [modalCharacterName, setModalCharacterName] = useState("");
  const [modalCharacterRole, setModalCharacterRole] = useState<CharacterRole>("配角");
  const [modalCharacterTags, setModalCharacterTags] = useState<string[]>([]);
  const [modalCharacterTagDraft, setModalCharacterTagDraft] = useState("");
  const [chapterContent, setChapterContent] = useState("");
  const [cardContent, setCardContent] = useState("");
  const [rightTab, setRightTab] = useState<"characters" | "story" | "places" | "orgs" | "timeline">(
    "characters"
  );
  const [characterRoleFilter, setCharacterRoleFilter] = useState<"全部" | CharacterRole>("全部");
  const [characterTagFilter, setCharacterTagFilter] = useState<CharacterTag[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [mobileReading, setMobileReading] = useState(false);
  const [mobilePreset, setMobilePreset] = useState<MobilePresetId>("iphone-14");
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => loadThemePreference());
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [chapterAutosaveHint, setChapterAutosaveHint] = useState("");
  const [cardAutosaveHint, setCardAutosaveHint] = useState("");
  const [synopsisDraft, setSynopsisDraft] = useState("");
  const [bookOverviewAutosaveHint, setBookOverviewAutosaveHint] = useState("");
  const [chapterRenameDraft, setChapterRenameDraft] = useState("");
  const [chapterTitleEditing, setChapterTitleEditing] = useState(false);

  const chapterTitleInputRef = useRef<HTMLInputElement>(null);
  const chapterGapTitleInputRef = useRef<HTMLInputElement>(null);
  const createBookTitleInputRef = useRef<HTMLInputElement>(null);
  const chapterTitleSkipBlurRef = useRef(false);

  const selectedChapterRef = useRef<SelectedChapter>(null);
  const chapterTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chapterContentRef = useRef("");
  const chapterBaselineRef = useRef("");
  const chapterTimerRef = useRef<number | null>(null);

  const selectedCardRef = useRef<SelectedCard>(null);
  const cardContentRef = useRef("");
  const cardBaselineRef = useRef("");
  const cardTimerRef = useRef<number | null>(null);

  const flushChapterSaveRef = useRef<() => Promise<void>>(async () => {});
  const flushCardSaveRef = useRef<() => Promise<void>>(async () => {});
  const flushSynopsisSaveRef = useRef<() => Promise<void>>(async () => {});

  const activeBookRef = useRef("");
  const synopsisBaselineRef = useRef("");
  const synopsisDraftRef = useRef("");
  const synopsisTimerRef = useRef<number | null>(null);
  const prevBookSlugRef = useRef("");

  selectedChapterRef.current = selectedChapter;
  function scrollChapterToTop() {
    const el = chapterTextareaRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }

  chapterContentRef.current = chapterContent;
  selectedCardRef.current = selectedCard;
  cardContentRef.current = cardContent;
  activeBookRef.current = activeBook;
  synopsisDraftRef.current = synopsisDraft;

  const selectedChapterMeta = useMemo(() => {
    if (!selectedChapter) return null;
    return chapters.find((c) => c.filename === selectedChapter.filename) || null;
  }, [chapters, selectedChapter]);

  const activeBookMeta = useMemo(() => books.find((b) => b.slug === activeBook) ?? null, [books, activeBook]);

  const sortedActiveMissingChapterIndexes = useMemo(
    () => normalizeChapterGapList(activeBookMeta?.missingChapterIndexes ?? []),
    [activeBookMeta?.missingChapterIndexes]
  );

  const displayedBooks = useMemo(() => {
    if (!bookShelfSortDesc) return books;
    return [...books].reverse();
  }, [books, bookShelfSortDesc]);

  const displayedChapters = useMemo(() => {
    if (!chapterSortDesc) return chapters;
    return [...chapters].reverse();
  }, [chapters, chapterSortDesc]);

  const adjacentChapters = useMemo(() => {
    const filename = selectedChapter?.filename;
    if (!filename) return { prev: null as ChapterMeta | null, next: null as ChapterMeta | null };
    const i = displayedChapters.findIndex((c) => c.filename === filename);
    if (i < 0) return { prev: null as ChapterMeta | null, next: null as ChapterMeta | null };
    return {
      prev: i > 0 ? displayedChapters[i - 1] : null,
      next: i + 1 < displayedChapters.length ? displayedChapters[i + 1] : null
    };
  }, [displayedChapters, selectedChapter?.filename]);

  const filteredCharFiles = useMemo(() => {
    const roleFiltered = charFiles.filter((f) => {
      const r = (f.role || "配角") as CharacterRole;
      if (characterRoleFilter === "全部") return true;
      return r === characterRoleFilter;
    });
    if (characterTagFilter.length === 0) return roleFiltered;
    return roleFiltered.filter((f) => {
      const tags = new Set((f.tags ?? []) as string[]);
      return characterTagFilter.every((t) => tags.has(t));
    });
  }, [charFiles, characterRoleFilter, characterTagFilter]);

  const groupedCharFiles = useMemo(() => {
    const groups = new Map<CharacterRole, StoryFile[]>();
    for (const r of CHARACTER_ROLE_OPTIONS) groups.set(r, []);
    groups.set("其他", []);
    for (const f of filteredCharFiles) {
      const r = (f.role || "配角") as CharacterRole;
      const key = CHARACTER_ROLE_OPTIONS.includes(r) ? r : "其他";
      groups.get(key)!.push(f);
    }
    for (const [k, arr] of groups) {
      arr.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
      if (arr.length === 0) groups.delete(k);
    }
    return [...groups.entries()];
  }, [filteredCharFiles]);

  const canRenameChapterFilename = useMemo(() => {
    if (!selectedChapter?.filename) return false;
    return CHAPTER_TITLE_RENAME_FILE_RE.test(selectedChapter.filename);
  }, [selectedChapter?.filename]);

  const chapterWordCount = useMemo(() => approximateWordCount(chapterContent || ""), [chapterContent]);

  const mobileViewport = useMemo(() => {
    const preset = MOBILE_PRESETS.find((p) => p.id === mobilePreset) || MOBILE_PRESETS[1];
    return { w: preset.w, h: preset.h, label: preset.label };
  }, [mobilePreset]);

  const showBookOverview = Boolean(activeBook && !selectedChapter);

  function clearChapterTimer() {
    if (chapterTimerRef.current !== null) {
      window.clearTimeout(chapterTimerRef.current);
      chapterTimerRef.current = null;
    }
  }

  function clearCardTimer() {
    if (cardTimerRef.current !== null) {
      window.clearTimeout(cardTimerRef.current);
      cardTimerRef.current = null;
    }
  }

  function clearSynopsisTimer() {
    if (synopsisTimerRef.current !== null) {
      window.clearTimeout(synopsisTimerRef.current);
      synopsisTimerRef.current = null;
    }
  }

  async function persistChapterNow(): Promise<boolean> {
    const sel = selectedChapterRef.current;
    const content = chapterContentRef.current;
    const baseline = chapterBaselineRef.current;
    if (!sel || content === baseline) return true;
    setChapterAutosaveHint("保存中");
    try {
      await updateChapter(sel.bookSlug, sel.filename, content);
      chapterBaselineRef.current = content;
      const w = approximateWordCount(content);
      setChapters((prev) => prev.map((c) => (c.filename === sel.filename ? { ...c, wordCount: w } : c)));
      setChapterAutosaveHint("已保存");
      window.setTimeout(() => {
        setChapterAutosaveHint((s) => (s === "已保存" ? "" : s));
      }, 2000);
      return true;
    } catch (e: any) {
      const msg = e?.message || String(e);
      setChapterAutosaveHint("保存失败");
      setStatus(msg);
      return false;
    }
  }

  async function flushChapterSave() {
    clearChapterTimer();
    await persistChapterNow();
  }

  async function persistCardNow(): Promise<boolean> {
    const sel = selectedCardRef.current;
    const content = cardContentRef.current;
    const baseline = cardBaselineRef.current;
    if (!sel || content === baseline) return true;
    setCardAutosaveHint("保存中");
    try {
      await updateStoryFile(sel.bookSlug, sel.path, content);
      cardBaselineRef.current = content;
      setCardAutosaveHint("已保存");
      window.setTimeout(() => {
        setCardAutosaveHint((s) => (s === "已保存" ? "" : s));
      }, 2000);
      return true;
    } catch (e: any) {
      const msg = e?.message || String(e);
      setCardAutosaveHint("保存失败");
      setStatus(msg);
      return false;
    }
  }

  async function flushCardSave() {
    clearCardTimer();
    await persistCardNow();
  }

  async function persistSynopsisNow(): Promise<void> {
    const slug = activeBookRef.current;
    const draft = synopsisDraftRef.current;
    const baseline = synopsisBaselineRef.current;
    if (!slug || selectedChapterRef.current !== null) return;
    if (draft === baseline) return;
    setBookOverviewAutosaveHint("保存中");
    try {
      const { book } = await patchBookSynopsis(slug, draft);
      synopsisBaselineRef.current = draft;
      setBooks((prev) => prev.map((b) => (b.slug === slug ? book : b)));
      setBookOverviewAutosaveHint("已保存");
      window.setTimeout(() => {
        setBookOverviewAutosaveHint((s) => (s === "已保存" ? "" : s));
      }, 2000);
    } catch (e: any) {
      setBookOverviewAutosaveHint("保存失败");
      setStatus(e?.message || String(e));
    }
  }

  async function flushSynopsisSave() {
    clearSynopsisTimer();
    await persistSynopsisNow();
  }

  flushChapterSaveRef.current = flushChapterSave;
  flushCardSaveRef.current = flushCardSave;
  flushSynopsisSaveRef.current = flushSynopsisSave;

  async function refreshBooks() {
    const { books } = await listBooks();
    setBooks(books);
  }

  async function refreshChapters(bookSlug: string) {
    const { chapters } = await listChapters(bookSlug);
    setChapters(chapters);
  }

  async function refreshStory(bookSlug: string) {
    const { storyFiles, charFiles } = await listStory(bookSlug);
    setStoryFiles(storyFiles);
    setCharFiles(charFiles);
  }

  useEffect(() => {
    refreshBooks().catch((e) => setStatus(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!shelfPeekSlug) {
      setShelfPeekDraft("");
      return;
    }
    const m = books.find((b) => b.slug === shelfPeekSlug);
    setShelfPeekDraft(m?.synopsis ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfPeekSlug]);

  useEffect(() => {
    if (!createBookModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) setCreateBookModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createBookModalOpen, busy]);

  const closeChapterGapModal = useCallback(() => {
    setChapterGapModalOpen(false);
    setChapterGapModalBookSlug("");
    setChapterGapModalIndexes([]);
    setChapterGapModalDraftTitle("");
  }, []);

  useEffect(() => {
    if (!chapterGapModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) closeChapterGapModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chapterGapModalOpen, busy, closeChapterGapModal]);

  useEffect(() => {
    if (!chapterGapModalOpen) return;
    queueMicrotask(() => chapterGapTitleInputRef.current?.focus());
  }, [chapterGapModalOpen]);

  useEffect(() => {
    if (!createBookModalOpen) return;
    queueMicrotask(() => createBookTitleInputRef.current?.focus());
  }, [createBookModalOpen]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-system", "theme-light", "theme-dark");
    root.classList.add(`theme-${themePreference}`);
  }, [themePreference]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      // ignore
    }
  }, [themePreference]);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, navCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [navCollapsed]);

  useEffect(() => {
    if (!activeBook) return;
    refreshChapters(activeBook).catch((e) => setStatus(String(e?.message || e)));
    refreshStory(activeBook).catch((e) => setStatus(String(e?.message || e)));
  }, [activeBook]);

  useEffect(() => {
    if (!activeBook) {
      prevBookSlugRef.current = "";
      return;
    }
    const m = books.find((b) => b.slug === activeBook);
    if (!m) return;
    if (prevBookSlugRef.current !== activeBook) {
      prevBookSlugRef.current = activeBook;
      const s = m.synopsis ?? "";
      setSynopsisDraft(s);
      synopsisBaselineRef.current = s;
    }
  }, [activeBook, books]);

  useEffect(() => {
    setChapterRenameDraft(selectedChapterMeta?.title ?? "");
  }, [selectedChapter?.filename, selectedChapterMeta?.title]);

  useEffect(() => {
    setChapterTitleEditing(false);
  }, [selectedChapter?.filename]);

  useEffect(() => {
    if (!selectedChapter) return;
    if (chapterContent === chapterBaselineRef.current) return;

    clearChapterTimer();
    chapterTimerRef.current = window.setTimeout(() => {
      chapterTimerRef.current = null;
      void persistChapterNow();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearChapterTimer();
  }, [chapterContent, selectedChapter]);

  useEffect(() => {
    if (!selectedCard) return;
    if (cardContent === cardBaselineRef.current) return;

    clearCardTimer();
    cardTimerRef.current = window.setTimeout(() => {
      cardTimerRef.current = null;
      void persistCardNow();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearCardTimer();
  }, [cardContent, selectedCard]);

  useEffect(() => {
    if (!activeBook || selectedChapter !== null) return;
    if (synopsisDraft === synopsisBaselineRef.current) return;
    clearSynopsisTimer();
    synopsisTimerRef.current = window.setTimeout(() => {
      synopsisTimerRef.current = null;
      void persistSynopsisNow();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearSynopsisTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistSynopsisNow 依赖 ref，避免重复挂载定时器
  }, [synopsisDraft, activeBook, selectedChapter]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      void flushChapterSaveRef.current();
      void flushCardSaveRef.current();
      void flushSynopsisSaveRef.current();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  async function goNavHome() {
    await flushChapterSave();
    await flushCardSave();
    await flushSynopsisSave();
    setNavHome(true);
    setActiveBook("");
    setSelectedChapter(null);
    setSelectedCard(null);
    setChapterContent("");
    setCardContent("");
    chapterBaselineRef.current = "";
    cardBaselineRef.current = "";
    setChapterAutosaveHint("");
    setCardAutosaveHint("");
    setChapterTitleEditing(false);
    await refreshBooks().catch((e: any) => setStatus(String(e?.message || e)));
  }

  async function openBookFromShelf(b: BookMeta) {
    await flushChapterSave();
    await flushCardSave();
    await flushSynopsisSave();
    setActiveBook(b.slug);
    setNavHome(false);
    setSelectedChapter(null);
    setSelectedCard(null);
    setChapterContent("");
    setCardContent("");
    chapterBaselineRef.current = "";
    cardBaselineRef.current = "";
    setChapterAutosaveHint("");
    setCardAutosaveHint("");
    setChapterTitleEditing(false);
  }

  function openCreateBookModal() {
    setModalNewTitle("");
    setModalNewSynopsis("");
    setCreateBookModalOpen(true);
  }

  async function submitCreateBookModal() {
    const t = modalNewTitle.trim();
    if (!t) return;
    setBusy(true);
    setStatus("");
    try {
      const syn = modalNewSynopsis.trim();
      const { book } = await createBook({ title: t, synopsis: syn || undefined });
      setCreateBookModalOpen(false);
      setModalNewTitle("");
      setModalNewSynopsis("");
      await refreshBooks();
      setActiveBook(book.slug);
      setNavHome(false);
      setShelfPeekSlug(null);
      setStatus(`已创建书籍：${book.title}`);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveShelfPeekSynopsis(slug: string) {
    setShelfPeekSaving(true);
    setStatus("");
    try {
      const { book } = await patchBookSynopsis(slug, shelfPeekDraft.trim());
      setBooks((prev) => prev.map((b) => (b.slug === slug ? book : b)));
      setStatus("简介已保存。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setShelfPeekSaving(false);
    }
  }

  async function onDeleteChapter() {
    if (!activeBook || !selectedChapter || !selectedChapterMeta) return;
    const label = selectedChapterMeta.id;
    if (!window.confirm(`确定删除章节「${label}」？本地 Markdown 文件将永久删除。`)) return;
    clearChapterTimer();
    setBusy(true);
    setStatus("");
    try {
      await deleteChapter(activeBook, selectedChapter.filename);
      setSelectedChapter(null);
      setChapterContent("");
      chapterBaselineRef.current = "";
      setChapterAutosaveHint("");
      setChapterTitleEditing(false);
      await refreshChapters(activeBook);
      await refreshBooks();
      setStatus("已删除章节。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function performCreateChapter(bookSlug: string, title: string, chapterIndex?: number) {
    const t = title.trim();
    if (!bookSlug || !t) return;
    setBusy(true);
    setStatus("");
    try {
      await flushSynopsisSave();
      await flushChapterSave();
      const body: { title: string; chapterIndex?: number } = { title: t };
      if (chapterIndex !== undefined) body.chapterIndex = chapterIndex;
      const { chapter } = await createChapter(bookSlug, body);

      if (bookSlug === activeBook) setChapterTitle("");

      if (bookSlug !== activeBook) {
        setActiveBook(bookSlug);
        setNavHome(false);
        setSelectedCard(null);
        setCardContent("");
        cardBaselineRef.current = "";
      }

      await refreshChapters(bookSlug);
      await refreshStory(bookSlug);
      await refreshBooks();

      setSelectedChapter({ bookSlug, filename: chapter.filename });
      const { content } = await readChapter(bookSlug, chapter.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      setChapterTitleEditing(false);
      setStatus("已新建章节，并写入本地文件。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openShelfChapterGapModal(b: BookMeta) {
    const gaps = normalizeChapterGapList(b.missingChapterIndexes ?? []);
    if (gaps.length === 0) return;
    setChapterGapModalBookSlug(b.slug);
    setChapterGapModalIndexes(gaps);
    setChapterGapModalDraftTitle("");
    setChapterGapModalOpen(true);
  }

  async function onCreateChapter() {
    if (!activeBook || !chapterTitle.trim()) return;
    const gaps = normalizeChapterGapList(books.find((b) => b.slug === activeBook)?.missingChapterIndexes ?? []);
    if (gaps.length > 0) {
      setChapterGapModalBookSlug(activeBook);
      setChapterGapModalIndexes(gaps);
      setChapterGapModalDraftTitle(chapterTitle.trim());
      setChapterGapModalOpen(true);
      return;
    }
    await performCreateChapter(activeBook, chapterTitle.trim(), undefined);
  }

  async function confirmChapterGapFill() {
    const t = chapterGapModalDraftTitle.trim();
    const slug = chapterGapModalBookSlug;
    if (!t) {
      setStatus("请先填写章节标题。");
      return;
    }
    if (!slug) return;
    const next = chapterGapModalIndexes[0];
    if (next === undefined) return;
    closeChapterGapModal();
    await performCreateChapter(slug, t, next);
  }

  async function confirmChapterGapSkip() {
    const t = chapterGapModalDraftTitle.trim();
    const slug = chapterGapModalBookSlug;
    if (!t) {
      setStatus("请先填写章节标题。");
      return;
    }
    if (!slug) return;
    closeChapterGapModal();
    await performCreateChapter(slug, t, undefined);
  }

  async function goBookOverview() {
    await flushChapterSave();
    const slug = activeBookRef.current;
    const m = books.find((bk) => bk.slug === slug);
    const s = m?.synopsis ?? "";
    setSynopsisDraft(s);
    synopsisBaselineRef.current = s;
    setSelectedChapter(null);
  }

  async function onOpenChapter(c: ChapterMeta) {
    if (!activeBook) return;
    setBusy(true);
    setStatus("");
    try {
      await flushSynopsisSave();
      await flushChapterSave();
      setSelectedChapter({ bookSlug: activeBook, filename: c.filename });
      const { content } = await readChapter(activeBook, c.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      queueMicrotask(() => scrollChapterToTop());
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRenameChapter(): Promise<boolean> {
    if (!activeBook || !selectedChapter || !chapterRenameDraft.trim()) return false;
    setBusy(true);
    setStatus("");
    try {
      await flushChapterSave();
      const { chapter } = await renameChapter(activeBook, selectedChapter.filename, chapterRenameDraft.trim());
      await refreshChapters(activeBook);
      setSelectedChapter({ bookSlug: activeBook, filename: chapter.filename });
      const { content } = await readChapter(activeBook, chapter.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      setChapterRenameDraft(chapter.title);
      return true;
    } catch (e: any) {
      setStatus(e?.message || String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function commitChapterTitleRename() {
    if (!selectedChapterMeta || !canRenameChapterFilename) return;
    const t = chapterRenameDraft.trim();
    if (!t) {
      setChapterRenameDraft(selectedChapterMeta.title);
      setChapterTitleEditing(false);
      return;
    }
    if (t === selectedChapterMeta.title) {
      setChapterTitleEditing(false);
      return;
    }
    chapterTitleSkipBlurRef.current = true;
    const ok = await onRenameChapter();
    chapterTitleSkipBlurRef.current = false;
    if (ok) setChapterTitleEditing(false);
  }

  async function onOpenCard(f: StoryFile) {
    if (!activeBook) return;
    setBusy(true);
    setStatus("");
    try {
      await flushCardSave();
      setSelectedCard({ bookSlug: activeBook, path: f.path });
      const { content } = await readStoryFile(activeBook, f.path);
      setCardContent(content);
      cardBaselineRef.current = content;
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCharacter() {
    if (!activeBook) return;
    const name = modalCharacterName.trim();
    if (!name) return;
    setBusy(true);
    setStatus("");
    try {
      const tags = [...new Set(modalCharacterTags.map((t) => t.trim()).filter(Boolean))].slice(0, 30);
      const { character } = await createCharacter(activeBook, {
        name,
        role: modalCharacterRole,
        tags
      });
      setCreateCharacterModalOpen(false);
      setModalCharacterName("");
      setModalCharacterRole("配角");
      setModalCharacterTags([]);
      setModalCharacterTagDraft("");
      await refreshStory(activeBook);
      const f: StoryFile = { kind: "character", path: character.relPath, title: name, role: modalCharacterRole, tags };
      await onOpenCard(f);
      setStatus("已创建角色卡文件。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand brandButton" onClick={() => void goNavHome()} title="返回书架">
          novel-helper
        </button>
        <div className="hint">
          默认写入 <code>book/</code>（可用 <code>NOVEL_HELPER_DATA_DIR</code> 指定根目录）
        </div>
        <div className="topbarRight">
          <div className="themeLabel">外观</div>
          <select
            className="select"
            value={themePreference}
            onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
            disabled={busy}
            title="跟随系统：随操作系统浅色/深色自动切换"
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className={`layout3 ${navCollapsed ? "layout3NavCollapsed" : ""}`}>
        <aside className="nav">
          {navCollapsed ? null : (
          <div className="panel navSectionMain">
            {navHome ? (
              <>
                <div className="navTitle">书架</div>
                <div className="navShelfHint muted">点击书名展开简介；书名下方显示缺失章节数量；点此新建书籍。</div>
                <div className="navNewBookRow">
                  <button type="button" className="btnNewBookFull" onClick={() => openCreateBookModal()} disabled={busy}>
                    新建书籍
                  </button>
                </div>
                <div className="navSortBar">
                  <button
                    type="button"
                    className="btnSort"
                    disabled={busy || books.length < 2}
                    title={bookShelfSortDesc ? "切换为正序" : "切换为倒序"}
                    onClick={() => setBookShelfSortDesc((v) => !v)}
                  >
                    {bookShelfSortDesc ? "倒序" : "正序"}
                  </button>
                </div>
                <div className="tree navListDense bookShelfList">
                  {books.length === 0 ? (
                    <div className="empty">还没有书，先新建一本。</div>
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
                            void openBookFromShelf(b);
                          }}
                          onKeyDown={(e) => {
                            if (busy) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              void openBookFromShelf(b);
                            }
                          }}
                          title={`打开全书 · ${b.slug}\n创建：${formatBookCreatedAt(b.createdAt)}\n${b.status} · ${b.chapterCount}章${
                            gapCount ? `\n缺失序号 ${gapCount} 处（进入该书后在左侧书名下处理）` : ""
                          }`}
                        >
                          <span
                            className="bookShelfTitle bookShelfTitleToggle"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShelfPeekSlug((prev) => (prev === b.slug ? null : b.slug));
                            }}
                            title="展开或收起简介"
                          >
                            《{b.title}》
                          </span>
                          {gapCount > 0 ? (
                            <span className="bookShelfGapCount">缺 {gapCount} 章</span>
                          ) : null}
                          <span className="bookShelfMeta">
                            {formatBookCreatedAt(b.createdAt)} · {b.status} · {b.chapterCount}章
                          </span>
                        </div>
                        {shelfPeekSlug === b.slug ? (
                          <div className="bookShelfPeek">
                            {b.synopsis?.trim() ? (
                              <p className="bookShelfPeekText">{b.synopsis}</p>
                            ) : (
                              <div className="bookShelfPeekEdit">
                                <textarea
                                  className="bookShelfPeekInput"
                                  value={shelfPeekDraft}
                                  onChange={(e) => setShelfPeekDraft(e.target.value)}
                                  placeholder="暂无简介，在此输入…"
                                  disabled={shelfPeekSaving}
                                  rows={3}
                                  aria-label="书籍简介"
                                />
                                <button
                                  type="button"
                                  className="btnPeekSave"
                                  disabled={shelfPeekSaving || busy}
                                  onClick={() => void saveShelfPeekSynopsis(b.slug)}
                                >
                                  {shelfPeekSaving ? "保存中…" : "保存简介"}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                    })
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="navChapterHeader">
                  <div className="navTitle">{activeBookMeta?.title ?? activeBook}</div>
                  {sortedActiveMissingChapterIndexes.length > 0 && activeBookMeta ? (
                    <button
                      type="button"
                      className="navBookGapHint"
                      disabled={busy}
                      onClick={() => openShelfChapterGapModal(activeBookMeta)}
                      title="选择补齐空缺或接在最大序号之后新建"
                    >
                      空缺：{formatMissingChapterList(sortedActiveMissingChapterIndexes)} · 点此新建
                    </button>
                  ) : null}
                  <div className="navSubtitle">{activeBookMeta?.slug ?? activeBook}</div>
                  <div className="navHint">点击左上角 novel-helper 返回书架</div>
                </div>
                <div className="navOverviewBar">
                  <button
                    type="button"
                    className="btnSort btnOverview"
                    disabled={busy || !selectedChapter}
                    title={selectedChapter ? "在中间查看本书信息与简介" : "当前已在书籍概览"}
                    onClick={() => void goBookOverview()}
                  >
                    书籍概览
                  </button>
                </div>
                <div className="navSortBar">
                  <button
                    type="button"
                    className="btnSort"
                    disabled={busy || chapters.length < 2}
                    title={chapterSortDesc ? "切换为正序" : "切换为倒序"}
                    onClick={() => setChapterSortDesc((v) => !v)}
                  >
                    {chapterSortDesc ? "倒序" : "正序"}
                  </button>
                </div>
                <div className="navChapterBody">
                  <div className="chapterNavScroll">
                    <div className="tree navListDense chapterNavList">
                      {chapters.length === 0 ? (
                        <div className="empty">暂无章节，请在下方新建。</div>
                      ) : (
                        displayedChapters.map((c) => (
                          <button
                            key={c.filename}
                            type="button"
                            className={`treeChild chapterNavItem ${selectedChapter?.filename === c.filename ? "active" : ""}`}
                            onClick={() => void onOpenChapter(c)}
                            disabled={busy}
                          >
                            <span className="chapterNavItemTitle">{c.id}</span>
                            <span className="chapterNavWordCount">{c.wordCount ?? 0} 字</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="row chapterQuickRow chapterQuickRowSticky">
                    <input
                      value={chapterTitle}
                      onChange={(e) => setChapterTitle(e.target.value)}
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
            )}
          </div>
          )}

          <div className="panel">
            <div className="navTitle">AI 代理设置</div>
            <div className="empty">先预留位置：后续可放模型、提示词、工具等配置。</div>
          </div>
        </aside>

        <main className="center">
          <div className="centerTop">
            <div className="centerTitleBlock">
              <div className="centerTitleRow">
                {activeBook || navHome ? (
                  <button
                    type="button"
                    className="btnSidebarToggle"
                    onClick={() => setNavCollapsed((v) => !v)}
                    disabled={busy}
                    aria-label={navCollapsed ? "展开左侧栏" : "收起左侧栏"}
                    aria-pressed={navCollapsed}
                    title={navCollapsed ? "展开左侧栏" : "收起左侧栏"}
                  >
                    <SidebarToggleIcon mirrored={!navCollapsed} />
                  </button>
                ) : null}
                {!activeBook ? (
                  <>
                    <div className="centerTitle">请从书架打开一本书</div>
                    <span className="titleAutosave autosaveHint" />
                  </>
                ) : showBookOverview ? (
                  <>
                    <div className="centerTitle">
                      《{activeBookMeta?.title ?? activeBook}》· 书籍概览
                    </div>
                    <span
                      className={`titleAutosave autosaveHint ${
                        bookOverviewAutosaveHint === "保存失败" ? "autosaveErr" : ""
                      }`}
                      title="简介停顿约 1 秒后写入 meta.json"
                    >
                      {bookOverviewAutosaveHint}
                    </span>
                  </>
                ) : !selectedChapterMeta ? (
                  <>
                    <div className="centerTitle">章节加载中…</div>
                    <span className="titleAutosave autosaveHint" />
                  </>
                ) : chapterTitleEditing && canRenameChapterFilename ? (
                  <>
                    <input
                      ref={chapterTitleInputRef}
                      className="renameChapterInput renameChapterInputInline"
                      value={chapterRenameDraft}
                      onChange={(e) => setChapterRenameDraft(e.target.value)}
                      disabled={busy}
                      aria-label="章节标题"
                      placeholder="章节标题"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setChapterRenameDraft(selectedChapterMeta.title);
                          setChapterTitleEditing(false);
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitChapterTitleRename();
                        }
                      }}
                      onBlur={() => {
                        if (chapterTitleSkipBlurRef.current) return;
                        setChapterRenameDraft(selectedChapterMeta.title);
                        setChapterTitleEditing(false);
                      }}
                    />
                    <span
                      className={`titleAutosave autosaveHint ${
                        chapterAutosaveHint === "保存失败" ? "autosaveErr" : ""
                      }`}
                      title="编辑停顿约 1 秒后写入磁盘"
                    >
                      {chapterAutosaveHint}
                    </span>
                  </>
                ) : (
                  <>
                    <div
                      className={`centerTitle ${canRenameChapterFilename ? "centerTitleEditable" : ""}`}
                      onDoubleClick={() => {
                        if (!canRenameChapterFilename || !selectedChapterMeta || busy) return;
                        setChapterRenameDraft(selectedChapterMeta.title);
                        setChapterTitleEditing(true);
                        queueMicrotask(() => {
                          chapterTitleInputRef.current?.focus();
                          chapterTitleInputRef.current?.select();
                        });
                      }}
                      title={
                        canRenameChapterFilename ? "双击修改标题（回车确认，Esc 取消）" : undefined
                      }
                    >
                      {selectedChapterMeta.id}
                    </div>
                    <span
                      className={`titleAutosave autosaveHint ${
                        chapterAutosaveHint === "保存失败" ? "autosaveErr" : ""
                      }`}
                      title="编辑停顿约 1 秒后写入磁盘"
                    >
                      {chapterAutosaveHint}
                    </span>
                  </>
                )}
              </div>
              {selectedChapterMeta && !showBookOverview && !canRenameChapterFilename ? (
                <div className="renameHint">当前文件名需在文件夹中手动改名。</div>
              ) : null}
            </div>
            {!activeBook ? (
              <div className="centerMeta muted">打开一本书后可查看书籍信息、简介与章节正文。</div>
            ) : showBookOverview && activeBookMeta ? (
              <div className="centerMeta centerMetaOverview">
                <span title={activeBookMeta.createdAt}>
                  创建时间：{formatBookCreatedAt(activeBookMeta.createdAt)}
                </span>
                <span className="centerMetaSep">·</span>
                <span>{activeBookMeta.status}</span>
                <span className="centerMetaSep">·</span>
                <span>{activeBookMeta.chapterCount} 章</span>
                <span className="centerMetaSep">·</span>
                <span className="muted">标识 {activeBookMeta.slug}</span>
              </div>
            ) : (
              <div className="centerMeta">字数：{chapterWordCount}</div>
            )}
            {selectedChapter ? (
              <div className="centerReading">
                <button
                  type="button"
                  className="btnReadingNav"
                  disabled={busy || !adjacentChapters.prev}
                  onClick={() => adjacentChapters.prev && void onOpenChapter(adjacentChapters.prev)}
                  title={adjacentChapters.prev ? `上一章：${adjacentChapters.prev.id}` : "没有上一章"}
                >
                  上一章
                </button>
                <button
                  type="button"
                  className="btnReadingNav"
                  disabled={busy || !adjacentChapters.next}
                  onClick={() => adjacentChapters.next && void onOpenChapter(adjacentChapters.next)}
                  title={adjacentChapters.next ? `下一章：${adjacentChapters.next.id}` : "没有下一章"}
                >
                  下一章
                </button>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={mobileReading}
                    onChange={(e) => setMobileReading(e.target.checked)}
                    disabled={busy}
                  />
                  移动端阅读
                </label>
                <select
                  className="select"
                  value={mobilePreset}
                  onChange={(e) => setMobilePreset(e.target.value as MobilePresetId)}
                  disabled={busy || !mobileReading}
                  title="常见机型尺寸预设"
                >
                  {MOBILE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {selectedChapter ? (
              <button
                type="button"
                className="btnDeleteChapter"
                disabled={busy}
                onClick={() => void onDeleteChapter()}
              >
                删除章节
              </button>
            ) : null}
          </div>
          {!activeBook ? (
            <div className="empty centerBodyHint">从左侧书架选择一本书开始。</div>
          ) : showBookOverview ? (
            <div className="bookOverview">
              <div className="bookOverviewSynopsisLabel">简介</div>
              <textarea
                className="bookOverviewSynopsis"
                value={synopsisDraft}
                onChange={(e) => setSynopsisDraft(e.target.value)}
                disabled={busy}
                placeholder="写一句简介或内容简介…（保存到书籍 meta.json）"
                aria-label="书籍简介"
              />
            </div>
          ) : mobileReading ? (
            <div className="mobileStage">
              <div
                className="mobilePhone"
                style={{ width: `${mobileViewport.w}px`, height: `${mobileViewport.h}px` }}
              >
                <textarea
                  className="mobileTextarea"
                  ref={chapterTextareaRef}
                  value={chapterContent}
                  onChange={(e) => setChapterContent(e.target.value)}
                  disabled={busy || !selectedChapter}
                  placeholder="在左侧选择章节或新建章节后开始写作…"
                />
              </div>
            </div>
          ) : (
            <textarea
              ref={chapterTextareaRef}
              value={chapterContent}
              onChange={(e) => setChapterContent(e.target.value)}
              disabled={busy || !selectedChapter}
              placeholder="在左侧选择章节或新建章节后开始写作…"
            />
          )}
          {status ? <div className="status">{status}</div> : null}
        </main>

        <aside className="right">
          <div className="panel">
            <div className="panelTitle">卡片</div>
            <div className="rightTabs" role="tablist" aria-label="右侧卡片页签">
              <button
                type="button"
                role="tab"
                className={`rightTab ${rightTab === "characters" ? "active" : ""}`}
                aria-selected={rightTab === "characters"}
                onClick={() => setRightTab("characters")}
                disabled={busy}
              >
                角色
              </button>
              <button
                type="button"
                role="tab"
                className={`rightTab ${rightTab === "story" ? "active" : ""}`}
                aria-selected={rightTab === "story"}
                onClick={() => setRightTab("story")}
                disabled={busy}
              >
                资料
              </button>
              <button
                type="button"
                role="tab"
                className={`rightTab ${rightTab === "places" ? "active" : ""}`}
                aria-selected={rightTab === "places"}
                onClick={() => setRightTab("places")}
                disabled={busy}
              >
                地点
              </button>
              <button
                type="button"
                role="tab"
                className={`rightTab ${rightTab === "orgs" ? "active" : ""}`}
                aria-selected={rightTab === "orgs"}
                onClick={() => setRightTab("orgs")}
                disabled={busy}
              >
                组织
              </button>
              <button
                type="button"
                role="tab"
                className={`rightTab ${rightTab === "timeline" ? "active" : ""}`}
                aria-selected={rightTab === "timeline"}
                onClick={() => setRightTab("timeline")}
                disabled={busy}
              >
                时间线
              </button>
            </div>

            {rightTab === "characters" ? (
              <>
                <div className="row">
                  <button
                    type="button"
                    className="btnNewCharacter"
                    onClick={() => {
                      if (busy || !activeBook) return;
                      setCreateCharacterModalOpen(true);
                      setModalCharacterName("");
                      setModalCharacterRole("配角");
                      setModalCharacterTags([]);
                      setModalCharacterTagDraft("");
                    }}
                    disabled={busy || !activeBook}
                  >
                    新增角色
                  </button>
                </div>

                <div className="characterFilters">
                  <div className="filterRow">
                    <div className="filterLabel muted">身份</div>
                    <div className="chips">
                      <button
                        type="button"
                        className={`chip ${characterRoleFilter === "全部" ? "active" : ""}`}
                        onClick={() => setCharacterRoleFilter("全部")}
                        disabled={busy}
                      >
                        全部
                      </button>
                      {CHARACTER_ROLE_OPTIONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`chip ${characterRoleFilter === r ? "active" : ""}`}
                          onClick={() => setCharacterRoleFilter(r)}
                          disabled={busy}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filterRow">
                    <div className="filterLabel muted">标签</div>
                    <div className="chips">
                      {CHARACTER_TAG_OPTIONS.map((t) => {
                        const active = characterTagFilter.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            className={`chip ${active ? "active" : ""}`}
                            onClick={() =>
                              setCharacterTagFilter((prev) =>
                                active ? prev.filter((x) => x !== t) : [...prev, t]
                              )
                            }
                            disabled={busy}
                            aria-pressed={active}
                          >
                            {t}
                          </button>
                        );
                      })}
                      {characterTagFilter.length > 0 ? (
                        <button
                          type="button"
                          className="chip chipClear"
                          onClick={() => setCharacterTagFilter([])}
                          disabled={busy}
                          title="清空标签筛选"
                        >
                          清空
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="characterGroups">
                  {groupedCharFiles.length === 0 ? (
                    <div className="empty">没有匹配的角色。</div>
                  ) : (
                    groupedCharFiles.map(([role, files]) => (
                      <div key={role} className="characterGroup">
                        <div className="characterGroupTitle">
                          {role} <span className="muted">({files.length})</span>
                        </div>
                        <div className="list">
                          {files.map((f) => (
                            <button
                              key={f.path}
                              className={`item ${selectedCard?.path === f.path ? "active" : ""}`}
                              onClick={() => onOpenCard(f)}
                              disabled={busy}
                              title={[
                                f.role ? `身份：${f.role}` : null,
                                f.tags && f.tags.length ? `标签：${f.tags.join("、")}` : null
                              ]
                                .filter(Boolean)
                                .join("\n")}
                            >
                              <span className="itemMain">
                                <span className="itemTitle">{f.title}</span>
                                <span className="itemBadges">
                                  {f.role ? <span className="badge badgeRole">{f.role}</span> : null}
                                  {(f.tags ?? []).slice(0, 3).map((tg) => (
                                    <span key={tg} className="badge">
                                      {tg}
                                    </span>
                                  ))}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : rightTab === "story" ? (
              <div className="list">
                {storyFiles.map((f) => (
                  <button
                    key={f.path}
                    className={`item ${selectedCard?.path === f.path ? "active" : ""}`}
                    onClick={() => onOpenCard(f)}
                    disabled={busy}
                  >
                    {f.title}
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty">该页签后续完善。</div>
            )}
            <div className="cardEditorTop">
              <div className="muted">{selectedCard ? selectedCard.path : "未选择卡片"}</div>
              <div
                className={`autosaveHint ${cardAutosaveHint === "保存失败" ? "autosaveErr" : ""}`}
                title="编辑停顿约 1 秒后写入磁盘"
              >
                {cardAutosaveHint}
              </div>
            </div>
            <textarea
              className="cardEditor"
              value={cardContent}
              onChange={(e) => setCardContent(e.target.value)}
              disabled={busy || !selectedCard}
              placeholder="选择一张卡片进行编辑…"
            />
          </div>
        </aside>
      </div>

      {createBookModalOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setCreateBookModalOpen(false);
          }}
        >
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-create-book-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-create-book-heading" className="modalHeading">
              新建书籍
            </h2>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-book-title">
                书名<span className="modalReq">*</span>
              </label>
              <input
                id="modal-book-title"
                ref={createBookTitleInputRef}
                className="modalInput"
                value={modalNewTitle}
                onChange={(e) => setModalNewTitle(e.target.value)}
                placeholder="必填"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && modalNewTitle.trim() && !busy) {
                    e.preventDefault();
                    void submitCreateBookModal();
                  }
                }}
              />
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-book-synopsis">
                简介<span className="modalOptional">（选填）</span>
              </label>
              <textarea
                id="modal-book-synopsis"
                className="modalTextarea"
                value={modalNewSynopsis}
                onChange={(e) => setModalNewSynopsis(e.target.value)}
                placeholder="可留空，创建后再补充"
                disabled={busy}
                rows={4}
              />
            </div>
            <div className="modalActions">
              <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => setCreateBookModalOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btnModalPrimary"
                disabled={busy || !modalNewTitle.trim()}
                onClick={() => void submitCreateBookModal()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {chapterGapModalOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) closeChapterGapModal();
          }}
        >
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-chapter-gap-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-chapter-gap-heading" className="modalHeading">
              检测到章节序号空缺
            </h2>
            <p className="modalChapterGapMuted">
              {(() => {
                const m = books.find((bk) => bk.slug === chapterGapModalBookSlug);
                return m ? `《${m.title}》` : chapterGapModalBookSlug;
              })()}
            </p>
            <p className="modalChapterGapBody">
              当前空缺：{formatMissingChapterList(chapterGapModalIndexes)}。填写章节标题后，选择补齐最先空缺或跳过空缺接续在最大序号之后。
            </p>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-chapter-gap-title">
                章节标题<span className="modalReq">*</span>
              </label>
              <input
                id="modal-chapter-gap-title"
                ref={chapterGapTitleInputRef}
                className="modalInput"
                value={chapterGapModalDraftTitle}
                onChange={(e) => setChapterGapModalDraftTitle(e.target.value)}
                placeholder="将写入文件名中的标题部分"
                disabled={busy}
              />
            </div>
            <div className="modalActions modalActionsWrap">
              <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => closeChapterGapModal()}>
                取消
              </button>
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy || !chapterGapModalDraftTitle.trim()}
                onClick={() => void confirmChapterGapSkip()}
              >
                跳过空缺
              </button>
              <button
                type="button"
                className="btnModalPrimary"
                disabled={busy || chapterGapModalIndexes.length === 0 || !chapterGapModalDraftTitle.trim()}
                onClick={() => void confirmChapterGapFill()}
              >
                补齐第 {chapterGapModalIndexes[0]} 章
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createCharacterModalOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setCreateCharacterModalOpen(false);
          }}
        >
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-create-character-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-create-character-heading" className="modalHeading">
              新增角色
            </h2>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-character-name">
                角色名<span className="modalReq">*</span>
              </label>
              <input
                id="modal-character-name"
                className="modalInput"
                value={modalCharacterName}
                onChange={(e) => setModalCharacterName(e.target.value)}
                placeholder="必填"
                disabled={busy || !activeBook}
              />
            </div>
            <div className="modalField">
              <label className="modalLabel" htmlFor="modal-character-role">
                身份
              </label>
              <select
                id="modal-character-role"
                className="select"
                value={modalCharacterRole}
                onChange={(e) => setModalCharacterRole(e.target.value as CharacterRole)}
                disabled={busy || !activeBook}
              >
                {CHARACTER_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="modalField">
              <div className="modalLabel">标签</div>
              <div className="chips">
                {CHARACTER_TAG_OPTIONS.map((t) => {
                  const active = modalCharacterTags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`chip ${active ? "active" : ""}`}
                      onClick={() =>
                        setModalCharacterTags((prev) =>
                          active ? prev.filter((x) => x !== t) : [...prev, t]
                        )
                      }
                      disabled={busy || !activeBook}
                      aria-pressed={active}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <input
                  value={modalCharacterTagDraft}
                  onChange={(e) => setModalCharacterTagDraft(e.target.value)}
                  placeholder="输入自定义标签，回车添加"
                  disabled={busy || !activeBook}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const t = modalCharacterTagDraft.trim();
                    if (!t) return;
                    setModalCharacterTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
                    setModalCharacterTagDraft("");
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !activeBook || !modalCharacterTagDraft.trim()}
                  onClick={() => {
                    const t = modalCharacterTagDraft.trim();
                    if (!t) return;
                    setModalCharacterTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
                    setModalCharacterTagDraft("");
                  }}
                >
                  添加标签
                </button>
              </div>
              {modalCharacterTags.length ? (
                <div className="chips" style={{ marginTop: 10 }}>
                  {modalCharacterTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="chip active"
                      onClick={() => setModalCharacterTags((prev) => prev.filter((x) => x !== t))}
                      disabled={busy || !activeBook}
                      title="点击移除"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="modalActions">
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy}
                onClick={() => setCreateCharacterModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btnModalPrimary"
                disabled={busy || !activeBook || !modalCharacterName.trim()}
                onClick={() => void onCreateCharacter()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

