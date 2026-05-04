import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChapterMeta,
  BookMeta,
  StoryFile,
  createChapter,
  createBook,
  createCharacter,
  deleteChapter,
  listChapters,
  listBooks,
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

type ThemeId =
  | "default"
  | "midnight"
  | "forest"
  | "sunset"
  | "ocean"
  | "paper"
  | "sepia"
  | "village"
  | "meadow"
  | "clay"
  | "loam";

const THEME_STORAGE_KEY = "novel-helper-theme";

/** 停止输入约多久后写入磁盘（毫秒） */
const AUTOSAVE_DEBOUNCE_MS = 900;

/** 允许在线改标题的文件名：`序号_任意标题.md` */
const CHAPTER_TITLE_RENAME_FILE_RE = /^(\d+)_.+\.md$/;

function formatBookCreatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const THEME_OPTIONS: Array<{ id: ThemeId; label: string }> = [
  { id: "default", label: "默认（极光暗色）" },
  { id: "midnight", label: "午夜（偏紫蓝）" },
  { id: "forest", label: "森林（偏绿色）" },
  { id: "sunset", label: "晚霞（偏玫瑰）" },
  { id: "ocean", label: "深海（偏青蓝）" },
  { id: "paper", label: "纸张（浅色护眼）" },
  { id: "sepia", label: "羊皮纸（浅色复古）" },
  { id: "village", label: "乡村·麻布（低渐变浅色）" },
  { id: "meadow", label: "乡村·稻田绿（低渐变浅色）" },
  { id: "clay", label: "乡村·陶土（低渐变浅色）" },
  { id: "loam", label: "乡村·沃土（低渐变深色）" }
];

function loadTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    const allowed = new Set(THEME_OPTIONS.map((t) => t.id));
    if (raw && allowed.has(raw as ThemeId)) return raw as ThemeId;
  } catch {
    // ignore
  }
  return "default";
}

export function App() {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [activeBook, setActiveBook] = useState<string>("");
  /** true：左侧显示书架；false：左侧显示当前书的章节 */
  const [navHome, setNavHome] = useState(true);
  /** false：与服务端一致（书按创建时间升序、章节按序号升序）；true：倒序展示 */
  const [bookShelfSortDesc, setBookShelfSortDesc] = useState(false);
  const [chapterSortDesc, setChapterSortDesc] = useState(false);
  const [chapters, setChapters] = useState<ChapterMeta[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<SelectedChapter>(null);
  const [selectedCard, setSelectedCard] = useState<SelectedCard>(null);

  const [bookTitle, setBookTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [characterName, setCharacterName] = useState("");

  const [chapterContent, setChapterContent] = useState("");
  const [cardContent, setCardContent] = useState("");
  const [storyFiles, setStoryFiles] = useState<StoryFile[]>([]);
  const [charFiles, setCharFiles] = useState<StoryFile[]>([]);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [mobileReading, setMobileReading] = useState(false);
  const [mobilePreset, setMobilePreset] = useState<MobilePresetId>("iphone-14");
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme());

  const [chapterAutosaveHint, setChapterAutosaveHint] = useState("");
  const [cardAutosaveHint, setCardAutosaveHint] = useState("");
  const [synopsisDraft, setSynopsisDraft] = useState("");
  const [bookOverviewAutosaveHint, setBookOverviewAutosaveHint] = useState("");
  const [chapterRenameDraft, setChapterRenameDraft] = useState("");
  const [chapterTitleEditing, setChapterTitleEditing] = useState(false);

  const chapterTitleInputRef = useRef<HTMLInputElement>(null);
  const chapterTitleSkipBlurRef = useRef(false);

  const selectedChapterRef = useRef<SelectedChapter>(null);
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

  const displayedBooks = useMemo(() => {
    if (!bookShelfSortDesc) return books;
    return [...books].reverse();
  }, [books, bookShelfSortDesc]);

  const displayedChapters = useMemo(() => {
    if (!chapterSortDesc) return chapters;
    return [...chapters].reverse();
  }, [chapters, chapterSortDesc]);

  const canRenameChapterFilename = useMemo(() => {
    if (!selectedChapter?.filename) return false;
    return CHAPTER_TITLE_RENAME_FILE_RE.test(selectedChapter.filename);
  }, [selectedChapter?.filename]);

  const chapterWordCount = useMemo(() => {
    const s = chapterContent || "";
    // 近似字数：中文按字符计，英文按单词计，取二者相加的粗略值
    const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    const en = (s.replace(/[\u4e00-\u9fa5]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
    return zh + en;
  }, [chapterContent]);

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
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

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

  async function onCreateBook() {
    if (!bookTitle.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const { book } = await createBook({ title: bookTitle.trim() });
      setBookTitle("");
      await refreshBooks();
      setActiveBook(book.slug);
      setNavHome(false);
      setStatus(`已创建书籍：${book.title}`);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
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
      setStatus("已删除章节。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateChapter() {
    if (!activeBook) return;
    if (!chapterTitle.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      await flushSynopsisSave();
      await flushChapterSave();
      const { chapter } = await createChapter(activeBook, { title: chapterTitle.trim() });
      setChapterTitle("");
      await refreshChapters(activeBook);
      setSelectedChapter({ bookSlug: activeBook, filename: chapter.filename });
      const { content } = await readChapter(activeBook, chapter.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      setStatus("已新建章节，并写入本地文件。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
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
    if (!characterName.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      await createCharacter(activeBook, characterName.trim());
      setCharacterName("");
      await refreshStory(activeBook);
      setStatus("已创建角色卡文件。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`app ${theme === "default" ? "" : `theme-${theme}`}`}>
      <header className="topbar">
        <button type="button" className="brand brandButton" onClick={() => void goNavHome()} title="返回书架">
          novel-helper
        </button>
        <div className="hint">
          默认写入 <code>book/</code>（可用 <code>NOVEL_HELPER_DATA_DIR</code> 指定根目录）
        </div>
        <div className="topbarRight">
          <div className="themeLabel">主题</div>
          <select className="select" value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)} disabled={busy}>
            {THEME_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="layout3">
        <aside className="nav">
          <div className="navSection navSectionMain">
            {navHome ? (
              <>
                <div className="navTitle">书架</div>
                <div className="row">
                  <input
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                    placeholder="新书标题"
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void onCreateBook();
                      }
                    }}
                  />
                  <button onClick={() => void onCreateBook()} disabled={busy || !bookTitle.trim()}>
                    新建
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
                    displayedBooks.map((b) => (
                      <button
                        key={b.slug}
                        type="button"
                        className="treeChild bookShelfRow"
                        onClick={() => void openBookFromShelf(b)}
                        disabled={busy}
                        title={`${b.slug}\n创建：${formatBookCreatedAt(b.createdAt)}\n${b.status} · ${b.chapterCount}章`}
                      >
                        <span className="bookShelfTitle">《{b.title}》</span>
                        <span className="bookShelfMeta">
                          {formatBookCreatedAt(b.createdAt)} · {b.status} · {b.chapterCount}章
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="navChapterHeader">
                  <div className="navTitle">{activeBookMeta?.title ?? activeBook}</div>
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
                <div className="tree navListDense chapterNavList">
                  {chapters.length === 0 ? (
                    <div className="empty">暂无章节，请在下方新建。</div>
                  ) : (
                    displayedChapters.map((c) => (
                      <button
                        key={c.filename}
                        type="button"
                        className={`treeChild ${selectedChapter?.filename === c.filename ? "active" : ""}`}
                        onClick={() => void onOpenChapter(c)}
                        disabled={busy}
                      >
                        {c.id}
                      </button>
                    ))
                  )}
                </div>
                <div className="row chapterQuickRow">
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
              </>
            )}
          </div>

          <div className="navSection">
            <div className="navTitle">AI 代理设置</div>
            <div className="empty">先预留位置：后续可放模型、提示词、工具等配置。</div>
          </div>
        </aside>

        <main className="center">
          <div className="centerTop">
            <div className="centerTitleBlock">
              <div className="centerTitleRow">
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
                {mobileReading ? (
                  <div className="centerDeviceMeta" title={mobileViewport.label}>
                    视口：{mobileViewport.w}×{mobileViewport.h}
                  </div>
                ) : null}
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
                  value={chapterContent}
                  onChange={(e) => setChapterContent(e.target.value)}
                  disabled={busy || !selectedChapter}
                  placeholder="在左侧选择章节或新建章节后开始写作…"
                />
              </div>
            </div>
          ) : (
            <textarea
              value={chapterContent}
              onChange={(e) => setChapterContent(e.target.value)}
              disabled={busy || !selectedChapter}
              placeholder="在左侧选择章节或新建章节后开始写作…"
            />
          )}
          {status ? <div className="status">{status}</div> : null}
        </main>

        <aside className="right">
          <section className="panel">
            <div className="panelTitle">状态卡 / 角色卡</div>
            <div className="row">
              <input
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="新增角色名"
                disabled={busy || !activeBook}
              />
              <button onClick={onCreateCharacter} disabled={busy || !activeBook || !characterName.trim()}>
                添加
              </button>
            </div>
            <div className="cards">
              <div className="cardsCol">
                <div className="cardsTitle">资料</div>
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
              </div>
              <div className="cardsCol">
                <div className="cardsTitle">角色</div>
                <div className="list">
                  {charFiles.map((f) => (
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
              </div>
            </div>
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
          </section>
        </aside>
      </div>
    </div>
  );
}

