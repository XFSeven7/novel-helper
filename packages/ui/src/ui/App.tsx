import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CHARACTER_ROLE_OPTIONS,
  type CharacterRole,
  MODEL_ACTIVE_ID_STORAGE_KEY,
  MODEL_CONFIGS_STORAGE_KEY,
  NAV_COLLAPSED_STORAGE_KEY,
  RIGHT_COLLAPSED_STORAGE_KEY,
  type ThemeId
} from "./constants";
import { auditCharacterNewBadgeClass, auditCharacterRoleClass } from "./utils/auditCharacters";
import { type AuditLinkTarget } from "./utils/auditDiff";
import {
  AUTOSAVE_DEBOUNCE_MS,
  CHAPTER_TITLE_RENAME_FILE_RE,
  approximateWordCount,
  formatBookCreatedAt,
  formatMissingChapterList,
  normalizeChapterGapList
} from "./utils/chapterFormat";
import {
  emptyInspGenSlice,
  type InspGenSlice,
  type InspTypeKey
} from "./utils/inspirationParse";
import {
  BUILTIN_MODEL_PROVIDERS,
  defaultConfigFor,
  loadModelConfigs
} from "./utils/modelConfigStorage";
import { applyThemeToDocument, loadThemeId, saveThemeId } from "./utils/themeStorage";
import { clamp } from "./utils/math";
import {
  auditDirtyIgnoreKey,
  clearAuditDirtyIgnoreEntry,
  filterStaleChaptersWithIgnore,
  readAuditDirtyIgnoreStore,
  setAuditDirtyIgnoreEntry
} from "./utils/auditDirtyIgnore";
import { mergeDraftOutOfSyncSet, isDraftOutOfSync } from "./utils/chapterDraftSync";
import {
  ChapterHistoryPane,
  CHAPTER_HISTORY_CURRENT_ID
} from "./components/editor/ChapterHistoryPane";
import { ChapterSaveDraftModal } from "./components/modals/ChapterSaveDraftModal";
import { ChapterEditorPanel } from "./components/editor/ChapterEditorPanel";
import { BookSynopsisPanel } from "./components/rightPanel/BookSynopsisPanel";
import { ClearBookAuditModal } from "./components/modals/ClearBookAuditModal";
import { RightPanel, type RightTabId } from "./components/rightPanel/RightPanel";
import { StatsPanel } from "./components/StatsPanel";
import { AppModals } from "./components/modals/AppModals";
import { GlobalInfoPanel, type GlobalTabId } from "./components/GlobalInfo/GlobalInfoPanel";
import { RelationsCenter } from "./components/GlobalInfo/RelationsCenter";
import { inferPlaceGroup } from "./components/GlobalInfo/PlacePanel";
import {
  chapterStreamUrl,
  consumeChapterSseStream,
  stripAiPlainTextOutput
} from "./utils/chapterSseStream";
import { InspirationTab } from "./components/inspiration/InspirationTab";
import { getFullscreenElement, isAltEnter, toggleDocumentFullscreen } from "./components/layout/fullscreen";
import { TopBar } from "./components/layout/TopBar";
import { SettingsPage, type SettingsTabId } from "./components/settings/SettingsPage";
import { SettingsShortcutsPanel } from "./components/settings/SettingsShortcutsPanel";
import { SettingsModelsPanel } from "./components/settings/SettingsModelsPanel";
import { SettingsDataDirPanel } from "./components/settings/SettingsDataDirPanel";
import { BookShelfNav } from "./components/nav/BookShelfNav";
import { BookShelfTabs, type BookShelfTabId } from "./components/nav/BookShelfTabs";
import { BookPlanningNav } from "./components/nav/BookPlanningNav";
import { BookSetupWizard } from "./components/bookSetup/BookSetupWizard";
import { ChapterNav } from "./components/nav/ChapterNav";
import { OutlineWorkspace, type OutlineSubTab } from "./components/outline/OutlineWorkspace";
import { OutlineBookProvider } from "./context/OutlineBookContext";
import {
  StageOutlineCenterBody,
  StageOutlineCenterTop
} from "./components/outline/StageOutlineCenter";
import { BookNotesPanel } from "./components/notes/BookNotesPanel";
import { appConfirm } from "./dialog/dialog";
import { useLayout3Splitters } from "./hooks/useLayout3Splitters";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import {
  ChapterMeta,
  BookMeta,
  StoryFile,
  createChapter,
  createBook,
  createCharacter,
  mergeCharacterCards,
  listChapters,
  listBooks,
  listBookSetupPlans,
  discardBookSetupPlan,
  suggestBookSetupTitle,
  type BookSetupPlanEntry,
  listStory,
  readChapter,
  readStoryFile,
  renameChapter,
  updateChapter,
  updateStoryFile,
  patchBookSynopsis,
  patchBookCompleted,
  deleteBook,
  clearBookAudit,
  restoreBook,
  putModelConfigs,
  auditChapter,
  getAuditLatest,
  getAuditChapterStale,
  getAuditAnalysis,
  saveAuditAnalysis,
  getAuditLedger,
  getAuditCharacters,
  hideAuditCharacter,
  mergeAuditCharacters,
  previewMergeAuditCharacters,
  applyMergeAuditCharacters,
  updateAuditCharacter,
  getAuditPlaces,
  hideAuditPlace,
  previewMergeAuditPlaces,
  applyMergeAuditPlaces,
  updateAuditPlace,
  getAuditOrgs,
  hideAuditOrg,
  updateAuditOrg,
  getAuditForeshadows,
  createAuditForeshadow,
  updateAuditForeshadow,
  hideAuditForeshadow,
  getAuditProgress,
  suggestChapterTitlesBatch,
  getWritingPack,
  generateWritingPack,
  searchBook,
  getTimelineIndex,
  compressTimelineRange,
  deleteTimelineRange,
  markTimelineEvent,
  TimelineIndex,
  WritingPack,
  getInspirationIndex,
  upsertInspirationItem,
  setInspirationItemStatus,
  purgeInspirationDeleted,
  generateInspiration,
  generateInspirationPreview,
  generateInspirationVariants,
  type InspirationIndex,
  type IdeaItem,
  getBookStats,
  type BookStats,
  type ModelConfig,
  type ModelProviderId,
  getChapterDraftStatus,
  listChapterVersions,
  createChapterVersion,
  getChapterVersion,
  restoreChapterVersion,
  type ChapterVersionMeta
} from "./api";
import type { BookSearchGroup, BookSearchHit } from "./api";

type SelectedChapter = { bookSlug: string; filename: string } | null;
type SelectedCard = { bookSlug: string; path: string } | null;


const CHARACTER_TAG_OPTIONS = ["盟友", "敌对", "家人", "同事", "组织", "阵营"] as const;


export function App() {
  const [leftTab, setLeftTab] = useState<
    "chapters" | "outline" | "global" | "progress" | "inspiration" | "notes"
  >("chapters");
  const [notesFocusRequest, setNotesFocusRequest] = useState(0);
  const [globalTab, setGlobalTab] = useState<GlobalTabId>("auditCharacters");

  useEffect(() => {
    if ((globalTab as string) === "stats") setGlobalTab("auditCharacters");
  }, [globalTab]);
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [activeBook, setActiveBook] = useState<string>("");
  /** true:左侧显示书架;false:左侧显示当前书的章节 */
  const [navHome, setNavHome] = useState(true);
  /** false:与服务端一致(书按创建时间升序、章节按序号升序);true:倒序展示 */
  const [bookShelfSortDesc, setBookShelfSortDesc] = useState(false);
  const [chapterSortDesc, setChapterSortDesc] = useState(false);
  const [chapters, setChapters] = useState<ChapterMeta[]>([]);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [selectedChapter, setSelectedChapter] = useState<SelectedChapter>(null);
  const [selectedCard, setSelectedCard] = useState<SelectedCard>(null);

  const [createBookModalOpen, setCreateBookModalOpen] = useState(false);
  const [bookSetupWizardOpen, setBookSetupWizardOpen] = useState(false);
  const [shelfTab, setShelfTab] = useLocalStorageState<BookShelfTabId>({
    key: "novel-helper-shelf-tab",
    defaultValue: "books"
  });
  const [bookSetupPlans, setBookSetupPlans] = useState<BookSetupPlanEntry[]>([]);
  const [bookSetupSessionId, setBookSetupSessionId] = useState<string | null>(null);
  const [outlineRefreshKey, setOutlineRefreshKey] = useState(0);
  const [outlineSubTab, setOutlineSubTab] = useState<OutlineSubTab>("book");
  const [selectedStageNodeId, setSelectedStageNodeId] = useState<string | null>(null);
  const [chapterGapModalOpen, setChapterGapModalOpen] = useState(false);
  const [chapterGapModalBookSlug, setChapterGapModalBookSlug] = useState("");
  const [chapterGapModalIndexes, setChapterGapModalIndexes] = useState<number[]>([]);
  const [chapterGapModalDraftTitle, setChapterGapModalDraftTitle] = useState("");
  const [modalNewTitle, setModalNewTitle] = useState("");
  const [modalNewSynopsis, setModalNewSynopsis] = useState("");
  const [deleteBookModalOpen, setDeleteBookModalOpen] = useState(false);
  const [deleteBookTarget, setDeleteBookTarget] = useState<BookMeta | null>(null);
  const [clearBookAuditModalOpen, setClearBookAuditModalOpen] = useState(false);
  const [clearBookAuditConfirmDraft, setClearBookAuditConfirmDraft] = useState("");
  // 书架不再"展开简介",点击直接进入书籍概览

  const [chapterTitle, setChapterTitle] = useState("");
  const [createCharacterModalOpen, setCreateCharacterModalOpen] = useState(false);
  const [modalCharacterName, setModalCharacterName] = useState("");
  const [modalCharacterRole, setModalCharacterRole] = useState<CharacterRole>("配角");
  const [modalCharacterTags, setModalCharacterTags] = useState<string[]>([]);
  const [modalCharacterTagDraft, setModalCharacterTagDraft] = useState("");

  const [chapterContent, setChapterContent] = useState("");
  const [cardContent, setCardContent] = useState("");
  const [storyFiles, setStoryFiles] = useState<StoryFile[]>([]);
  const [charFiles, setCharFiles] = useState<StoryFile[]>([]);
  const [rightTab, setRightTab] = useState<RightTabId>("chapterAnalysis");
  const [inspirationTypeTab, setInspirationTypeTab] = useState<InspTypeKey>("character");
  const [inspirationFuncByType, setInspirationFuncByType] = useState<
    Record<InspTypeKey, "generate" | "list" | "recycle">
  >({
    character: "generate",
    place: "generate",
    org: "generate",
    item: "generate",
    event: "generate",
    lore: "generate",
    technique: "generate"
  });
  const inspirationFuncTab = inspirationFuncByType[inspirationTypeTab];
  const [inspirationIndex, setInspirationIndex] = useState<InspirationIndex | null>(null);
  const [inspirationBusy, setInspirationBusy] = useState(false);
  const [inspirationErr, setInspirationErr] = useState("");
  const [inspirationFilter, setInspirationFilter] = useState<"all" | "pinned">("all");
  // 搜索框已按需求移除(减少占用空间)
  // const [inspirationSearch, setInspirationSearch] = useState("");

  /** 按「角色/地点/组织/道具」分桶:生成预览、表单与编辑状态互不串台 */
  const [inspGenByType, setInspGenByType] = useState<Record<InspTypeKey, InspGenSlice>>(() => ({
    character: emptyInspGenSlice(),
    place: emptyInspGenSlice(),
    org: emptyInspGenSlice(),
    item: emptyInspGenSlice(),
    event: emptyInspGenSlice(),
    lore: emptyInspGenSlice(),
    technique: emptyInspGenSlice()
  }));

  /** 列表/回收站条目展开(与生成预览的 expanded 分离) */
  const [inspirationListExpanded, setInspirationListExpanded] = useState<Record<string, boolean>>({});
  const [expandedAuditCharIds, setExpandedAuditCharIds] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [searchGroups, setSearchGroups] = useState<BookSearchGroup[]>([]);
  const [searchSort, setSearchSort] = useState<"asc" | "desc">("asc");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const searchPickBookFirstBtnRef = useRef<HTMLButtonElement | null>(null);

  // 仅搜索章节正文:不再需要 story/audit 的命中预览

  const [mergeFromEditOpen, setMergeFromEditOpen] = useState(false);
  const [mergeFromEditSelected, setMergeFromEditSelected] = useState<Record<string, boolean>>({});
  const [mergeFromEditDraft, setMergeFromEditDraft] = useState<any | null>(null);
  const [mergeFromEditDraftText, setMergeFromEditDraftText] = useState<string>("");
  const [mergeFromEditDraftBusy, setMergeFromEditDraftBusy] = useState(false);

  const [mobileReading, setMobileReading] = useState(false);
  const [auditReadModeOn, setAuditReadModeOn] = useState(false);
  const [polishModeOn, setPolishModeOn] = useState(false);
  const [expandModeOn, setExpandModeOn] = useState(false);
  const [historyPaneOpen, setHistoryPaneOpen] = useState(false);
  const [chapterVersions, setChapterVersions] = useState<ChapterVersionMeta[]>([]);
  const [selectedHistoryVersionId, setSelectedHistoryVersionId] = useState<string | null>(null);
  const [versionContentCache, setVersionContentCache] = useState<Record<string, string>>({});
  const [chaptersDraftOutOfSync, setChaptersDraftOutOfSync] = useState<ReadonlySet<string>>(() => new Set());
  const [latestHistoryHashByChapter, setLatestHistoryHashByChapter] = useState<Record<string, string | null>>({});
  const [chapterSaveDraftModalOpen, setChapterSaveDraftModalOpen] = useState(false);
  const [chapterSaveDraftBusy, setChapterSaveDraftBusy] = useState(false);
  const [currentChapterEditorHash, setCurrentChapterEditorHash] = useState<string | null>(null);
  const serverDraftOutOfSyncRef = useRef<string[]>([]);
  const latestHistoryHashByChapterRef = useRef<Record<string, string | null>>({});
  const currentChapterEditorHashRef = useRef<string | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>(() => loadThemeId());
  const [fullscreenOn, setFullscreenOn] = useState(false);
  const [{ configs: modelConfigs, activeId: activeModelId }, setModelState] = useState(() =>
    loadModelConfigs()
  );
  const [modelConfigEditorId, setModelConfigEditorId] = useState<string | null>(null);
  const [modelEditorDraft, setModelEditorDraft] = useState<ModelConfig | null>(null);
  const [modelTestStatus, setModelTestStatus] = useState<string>("");
  const [homeCenterTab, setHomeCenterTab] = useState<"welcome" | "settings">("welcome");
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("models");
  const [navCollapsed, setNavCollapsed] = useLocalStorageState<boolean>({
    key: NAV_COLLAPSED_STORAGE_KEY,
    defaultValue: false,
    parse: (raw) => raw === "1",
    serialize: (v) => (v ? "1" : "0")
  });
  const [rightCollapsed, setRightCollapsed] = useLocalStorageState<boolean>({
    key: RIGHT_COLLAPSED_STORAGE_KEY,
    defaultValue: false,
    parse: (raw) => raw === "1",
    serialize: (v) => (v ? "1" : "0")
  });

  const { navW: layout3NavW, rightW: layout3RightW, dragging: layout3Dragging, setDragging: setLayout3Dragging, dragStartRef: layout3DragStartRef } =
    useLayout3Splitters();

  const [chapterAutosaveHint, setChapterAutosaveHint] = useState("");
  const [cardAutosaveHint, setCardAutosaveHint] = useState("");
  const [synopsisDraft, setSynopsisDraft] = useState("");
  const [bookOverviewAutosaveHint, setBookOverviewAutosaveHint] = useState("");
  const [chapterRenameDraft, setChapterRenameDraft] = useState("");
  const [chapterTitleEditing, setChapterTitleEditing] = useState(false);
  const [chapterTitleSuggestOpen, setChapterTitleSuggestOpen] = useState(false);
  const [chapterTitleSuggestBusy, setChapterTitleSuggestBusy] = useState(false);
  const [chapterTitleSuggestErr, setChapterTitleSuggestErr] = useState("");
  const [chapterTitleSuggestList, setChapterTitleSuggestList] = useState<string[]>([]);
  const [chapterTitleSuggestByStyle, setChapterTitleSuggestByStyle] = useState<Record<string, string[]>>({});
  const [chapterTitleSuggestPicked, setChapterTitleSuggestPicked] = useState("");
  const [chapterTitleSuggestStyle, setChapterTitleSuggestStyle] = useState<
    "boom" | "suspense" | "hotblood" | "funny" | "poetic" | "minimal" | "normal"
  >("boom");

  const chapterTitleInputRef = useRef<HTMLInputElement>(null);

  const loadInspiration = useCallback(
    async (bookSlug: string) => {
      if (!bookSlug) return;
      setInspirationBusy(true);
      setInspirationErr("");
      try {
        const { index } = await getInspirationIndex(bookSlug);
        if (activeBookRef.current !== bookSlug) return;
        setInspirationIndex(index);
      } catch (e: any) {
        setInspirationErr(e?.message || String(e));
      } finally {
        setInspirationBusy(false);
      }
    },
    []
  );
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

  function scrollChapterToLine(lineNo: number) {
    const el = chapterTextareaRef.current;
    if (!el) return;
    const n = Math.max(1, Math.floor(Number(lineNo) || 1));
    const text = String(el.value || "").replace(/\r/g, "");
    let idx = 0;
    let line = 1;
    while (line < n) {
      const next = text.indexOf("\n", idx);
      if (next < 0) break;
      idx = next + 1;
      line++;
    }
    try {
      el.focus();
      el.setSelectionRange(idx, idx);
      // 尽量把目标行滚到可视区域中间
      const lines = text.slice(0, idx).split("\n").length;
      const approxLineHeight = 20;
      el.scrollTop = Math.max(0, (lines - 3) * approxLineHeight);
    } catch {
      // ignore
    }
  }

  function highlightChapterHit(lineNo: number, q: string) {
    const el = chapterTextareaRef.current;
    if (!el) return;
    const needleRaw = String(q || "").trim();
    if (!needleRaw) {
      scrollChapterToLine(lineNo);
      return;
    }
    const n = Math.max(1, Math.floor(Number(lineNo) || 1));
    const text = String(el.value || "").replace(/\r/g, "");

    // 找到目标行起始索引
    let idx = 0;
    let line = 1;
    while (line < n) {
      const next = text.indexOf("\n", idx);
      if (next < 0) break;
      idx = next + 1;
      line++;
    }
    const lineEnd = text.indexOf("\n", idx);
    const lineText = lineEnd >= 0 ? text.slice(idx, lineEnd) : text.slice(idx);

    const hay = lineText.toLowerCase();
    const needle = needleRaw.toLowerCase();
    const localPos = hay.indexOf(needle);
    const start = idx + (localPos >= 0 ? localPos : 0);
    const end = idx + (localPos >= 0 ? localPos + needleRaw.length : 0);

    try {
      el.focus();
      if (localPos >= 0) el.setSelectionRange(start, end);
      else el.setSelectionRange(idx, idx);
      const approxLineHeight = 20;
      el.scrollTop = Math.max(0, (n - 3) * approxLineHeight);
    } catch {
      // ignore
    }
  }

  // highlightTextareaHit 已不再需要(只搜索章节正文)

  chapterContentRef.current = chapterContent;
  selectedCardRef.current = selectedCard;
  cardContentRef.current = cardContent;
  activeBookRef.current = activeBook;
  synopsisDraftRef.current = synopsisDraft;

  const selectedChapterMeta = useMemo(() => {
    if (!selectedChapter) return null;
    return chapters.find((c) => c.filename === selectedChapter.filename) || null;
  }, [chapters, selectedChapter]);

  const activeBookMeta = useMemo(() => books.find((b) => b.bookId === activeBook) ?? null, [books, activeBook]);

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

  const canRenameChapterFilename = useMemo(() => {
    if (!selectedChapter?.filename) return false;
    return CHAPTER_TITLE_RENAME_FILE_RE.test(selectedChapter.filename);
  }, [selectedChapter?.filename]);

  const chapterWordCount = useMemo(() => approximateWordCount(chapterContent || ""), [chapterContent]);

  const currentChapterDraftOutOfSync = useMemo(() => {
    if (!selectedChapter) return false;
    const fn = selectedChapter.filename;
    const latestKnown = Object.prototype.hasOwnProperty.call(latestHistoryHashByChapter, fn);
    const latest = latestHistoryHashByChapter[fn];
    if (!latestKnown || !currentChapterEditorHash) {
      return chaptersDraftOutOfSync.has(fn);
    }
    return isDraftOutOfSync(latest, currentChapterEditorHash);
  }, [selectedChapter, latestHistoryHashByChapter, currentChapterEditorHash, chaptersDraftOutOfSync]);

  const bookTotalWordCount = useMemo(() => {
    const list = Array.isArray(chapters) ? chapters : [];
    return list.reduce((sum, c) => sum + (Number(c?.wordCount) || 0), 0);
  }, [chapters]);

  const mobileViewport = useMemo(() => {
    const preset = { w: 390, h: 844, label: "iPhone 14 (390×844)" };
    return { w: preset.w, h: preset.h, label: preset.label };
  }, []);

  const showBookOverview = Boolean(activeBook && !selectedChapter);
  const showRelationsCenter = Boolean(activeBook && leftTab === "global" && globalTab === "relations");
  const showStageOutlineCenter = Boolean(activeBook && leftTab === "outline" && outlineSubTab === "stages");

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
    try {
      await updateChapter(sel.bookSlug, sel.filename, content);
      chapterBaselineRef.current = content;
      const w = approximateWordCount(content);
      setChapters((prev) => prev.map((c) => (c.filename === sel.filename ? { ...c, wordCount: w } : c)));
      setStatsRefreshKey((k) => k + 1);
      setChapterAutosaveHint("");
      void refreshAuditChapterStale(sel.bookSlug);
      void refreshChapterDraftStatus(sel.bookSlug);
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
    try {
      await updateStoryFile(sel.bookSlug, sel.path, content);
      cardBaselineRef.current = content;
      setCardAutosaveHint("");
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
    try {
      const { book } = await patchBookSynopsis(slug, draft);
      synopsisBaselineRef.current = draft;
      setBooks((prev) => prev.map((b) => (b.bookId === slug ? book : b)));
      setBookOverviewAutosaveHint("");
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

  // 书架不再展开简介

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
    if (!searchOpen) return;
    queueMicrotask(() => {
      if (activeBookRef.current) searchInputRef.current?.focus();
      else searchPickBookFirstBtnRef.current?.focus();
    });
  }, [searchOpen, activeBook]);

  useEffect(() => {
    const isMac = () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");
    const shouldIgnoreTarget = (t: any) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = String((el as any).tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if ((el as any).isContentEditable) return true;
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      const key = String(e.key || "").toLowerCase();
      const mac = isMac();
      const openKey = key === "i" && !e.shiftKey && !e.altKey && (mac ? e.metaKey : e.ctrlKey);
      if (openKey) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // 不抢输入框快捷键:除非已经打开搜索浮层;但全局搜索快捷键始终生效
      if (!searchOpen && shouldIgnoreTarget(e.target)) return;
      if (searchOpen && e.key === "Escape") {
        e.preventDefault();
        setSearchOpen(false);
        return;
      }
      const mod = mac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && !e.altKey && key === "s" && selectedChapterRef.current) {
        if (!searchOpen && shouldIgnoreTarget(e.target)) return;
        e.preventDefault();
        setChapterSaveDraftModalOpen(true);
        return;
      }
      if (mod && e.shiftKey && !e.altKey && key === "h" && selectedChapterRef.current) {
        if (!searchOpen && shouldIgnoreTarget(e.target)) return;
        e.preventDefault();
        toggleHistoryPane();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, searchOpen, historyPaneOpen]);

  useEffect(() => {
    if (!createBookModalOpen) return;
    queueMicrotask(() => createBookTitleInputRef.current?.focus());
  }, [createBookModalOpen]);

  useLayoutEffect(() => {
    applyThemeToDocument(themeId);
  }, [themeId]);

  useEffect(() => {
    saveThemeId(themeId);
  }, [themeId]);

  useEffect(() => {
    const sync = () => setFullscreenOn(Boolean(getFullscreenElement()));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync as EventListener);
    document.addEventListener("mozfullscreenchange", sync);
    document.addEventListener("MSFullscreenChange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync as EventListener);
      document.removeEventListener("mozfullscreenchange", sync);
      document.removeEventListener("MSFullscreenChange", sync);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isAltEnter(e)) return;
      e.preventDefault();
      void toggleDocumentFullscreen().catch(() =>
        setStatus("无法切换全屏:浏览器不支持或权限被拒绝。")
      );
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // 布局拖拽与持久化由 useLayout3Splitters 负责

  useEffect(() => {
    try {
      localStorage.setItem(MODEL_CONFIGS_STORAGE_KEY, JSON.stringify(modelConfigs));
      if (activeModelId) localStorage.setItem(MODEL_ACTIVE_ID_STORAGE_KEY, activeModelId);
    } catch {
      // ignore
    }
  }, [modelConfigs, activeModelId]);

  useEffect(() => {
    // 同步到服务端供审计调用(失败不影响前端使用)
    void putModelConfigs({ configs: modelConfigs as any, activeId: activeModelId ?? null }).catch(() => {});
  }, [modelConfigs, activeModelId]);

  const [auditRun, setAuditRun] = useState<any | null>(null);
  const [auditDirty, setAuditDirty] = useState(false);
  const [auditDirtyDelta, setAuditDirtyDelta] = useState<{ abs: number; ratio: number } | null>(null);
  /** 用户点击「忽略」：按书+章节记录当时正文 hash，切换章节再回来仍有效 */
  const auditDirtyIgnoreRef = useRef<Record<string, string>>(readAuditDirtyIgnoreStore());
  const [auditLedger, setAuditLedger] = useState<any | null>(null);
  const [auditCharactersIndex, setAuditCharactersIndex] = useState<any | null>(null);
  const [auditPlacesIndex, setAuditPlacesIndex] = useState<any | null>(null);
  const [auditOrgsIndex, setAuditOrgsIndex] = useState<any | null>(null);
  const [auditForeshadowsIndex, setAuditForeshadowsIndex] = useState<any | null>(null);
  const [auditProgressIndex, setAuditProgressIndex] = useState<any | null>(null);
  /** 进入灵感库时拉取审核角色索引,供道具/功法「持有人」下拉(不依赖是否已打开某一章) */
  // 切书后由 reloadActiveBookData / loadGlobalArtifacts 统一加载
  const [writingPack, setWritingPack] = useState<WritingPack | null>(null);
  const [writingPackBusy, setWritingPackBusy] = useState(false);
  const [writingPackErr, setWritingPackErr] = useState("");
  const [writingPackListsOpen, setWritingPackListsOpen] = useState(false);

  async function sha1Hex(text: string): Promise<string> {
    const normalized = String(text || "").replace(/\r/g, "");
    const buf = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest("SHA-1", buf);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  useEffect(() => {
    latestHistoryHashByChapterRef.current = latestHistoryHashByChapter;
  }, [latestHistoryHashByChapter]);

  useEffect(() => {
    currentChapterEditorHashRef.current = currentChapterEditorHash;
  }, [currentChapterEditorHash]);

  const applyChapterDraftOutOfSyncMerge = useCallback(() => {
    const slug = activeBookRef.current;
    const sel = selectedChapterRef.current;
    const fn = sel?.bookSlug === slug ? sel.filename : null;
    const latestMap = latestHistoryHashByChapterRef.current;
    const latestHistoryHash =
      fn && Object.prototype.hasOwnProperty.call(latestMap, fn) ? latestMap[fn] : undefined;
    setChaptersDraftOutOfSync(
      mergeDraftOutOfSyncSet(
        serverDraftOutOfSyncRef.current,
        fn,
        fn ? currentChapterEditorHashRef.current : null,
        latestHistoryHash
      )
    );
  }, []);

  const prefetchChapterLatestHistoryHash = useCallback(async (slug: string, filename: string) => {
    try {
      const { latestContentHash } = await listChapterVersions(slug, filename);
      setLatestHistoryHashByChapter((prev) => ({ ...prev, [filename]: latestContentHash }));
      return latestContentHash;
    } catch {
      return null;
    }
  }, []);

  const refreshChapterDraftStatus = useCallback(
    async (slug: string) => {
      if (!slug) return;
      try {
        const { outOfSync } = await getChapterDraftStatus(slug);
        serverDraftOutOfSyncRef.current = outOfSync;
        applyChapterDraftOutOfSyncMerge();
      } catch {
        // ignore
      }
    },
    [applyChapterDraftOutOfSyncMerge]
  );

  const loadChapterVersionsForCurrent = useCallback(async () => {
    const sel = selectedChapterRef.current;
    if (!sel) return;
    try {
      const { versions, latestContentHash } = await listChapterVersions(sel.bookSlug, sel.filename);
      setChapterVersions(versions);
      setLatestHistoryHashByChapter((prev) => ({ ...prev, [sel.filename]: latestContentHash }));
      applyChapterDraftOutOfSyncMerge();
      if (versions.length > 0) {
        const firstId = versions[0].id;
        setSelectedHistoryVersionId(firstId);
        try {
          const { content } = await getChapterVersion(sel.bookSlug, sel.filename, firstId);
          setVersionContentCache((prev) => ({ ...prev, [firstId]: content }));
        } catch (e: any) {
          setStatus(e?.message || String(e));
        }
      }
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }, [applyChapterDraftOutOfSyncMerge]);

  async function onSelectHistoryVersion(versionId: string) {
    setSelectedHistoryVersionId(versionId);
    if (versionId === CHAPTER_HISTORY_CURRENT_ID) return;
    const sel = selectedChapterRef.current;
    if (!sel) return;
    if (versionContentCache[versionId] !== undefined) return;
    try {
      const { content } = await getChapterVersion(sel.bookSlug, sel.filename, versionId);
      setVersionContentCache((prev) => ({ ...prev, [versionId]: content }));
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  async function confirmChapterSaveDraft(label: string) {
    const sel = selectedChapterRef.current;
    if (!sel) return;
    setChapterSaveDraftBusy(true);
    setStatus("");
    try {
      await flushChapterSave();
      const { version } = await createChapterVersion(sel.bookSlug, sel.filename, {
        label: label || undefined
      });
      setLatestHistoryHashByChapter((prev) => ({ ...prev, [sel.filename]: version.contentHash }));
      setCurrentChapterEditorHash(version.contentHash);
      currentChapterEditorHashRef.current = version.contentHash;
      await refreshChapterDraftStatus(sel.bookSlug);
      if (historyPaneOpen) await loadChapterVersionsForCurrent();
      setChapterSaveDraftModalOpen(false);
      setStatus("");
    } catch (e: any) {
      const raw = String(e?.message || e);
      try {
        const j = JSON.parse(raw) as { message?: string };
        setStatus(j.message || raw);
      } catch {
        setStatus(raw);
      }
    } finally {
      setChapterSaveDraftBusy(false);
    }
  }

  async function onRestoreChapterVersion(versionId: string) {
    const sel = selectedChapterRef.current;
    if (!sel) return;
    setBusy(true);
    setStatus("");
    try {
      await restoreChapterVersion(sel.bookSlug, sel.filename, versionId);
      const { content } = await readChapter(sel.bookSlug, sel.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      setVersionContentCache({});
      setSelectedHistoryVersionId(null);
      await loadChapterVersionsForCurrent();
      await refreshChapterDraftStatus(sel.bookSlug);
      setStatus("已还原到所选历史存稿");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openHistoryPane() {
    setMobileReading(false);
    setPolishModeOn(false);
    setExpandModeOn(false);
    setSelectedHistoryVersionId(null);
    setVersionContentCache({});
    setHistoryPaneOpen(true);
    setRightCollapsed(false);
    void loadChapterVersionsForCurrent();
  }

  function closeHistoryPane() {
    setHistoryPaneOpen(false);
    setSelectedHistoryVersionId(null);
  }

  function toggleHistoryPane() {
    if (historyPaneOpen) closeHistoryPane();
    else openHistoryPane();
  }

  // 正文改动后:判断"本章分析是否过期"(分析结果绑定 auditedHash)
  useEffect(() => {
    const auditedHash = String((auditRun as any)?.source?.contentHash || "").trim();
    const auditedLenRaw = Number((auditRun as any)?.source?.contentLength);
    if (!activeBook || !selectedChapter || !auditedHash) {
      setAuditDirty(false);
      setAuditDirtyDelta(null);
      return;
    }
    let cancelled = false;
    const current = String(chapterContentRef.current || "");
    const chapterFilename = selectedChapter.filename;
    const bookSlug = activeBook;
    void (async () => {
      try {
        const curHash = await sha1Hex(current);
        if (cancelled) return;
        const ignoredHash = auditDirtyIgnoreRef.current[auditDirtyIgnoreKey(bookSlug, chapterFilename)];
        const ignoredAtCurrentContent = ignoredHash === curHash;
        const dirty = curHash !== auditedHash && !ignoredAtCurrentContent;
        setAuditDirty(dirty);
        const curLen = String(current || "").replace(/\r/g, "").length;
        const baseLen = Number.isFinite(auditedLenRaw) ? auditedLenRaw : 0;
        const abs = Math.abs(curLen - baseLen);
        const ratio = baseLen > 0 ? abs / baseLen : curLen > 0 ? 1 : 0;
        setAuditDirtyDelta(dirty ? { abs, ratio } : null);
      } catch {
        if (cancelled) return;
        setAuditDirty(false);
        setAuditDirtyDelta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auditedHash/len 来自 auditRun
  }, [activeBook, selectedChapter?.filename, auditRun, chapterContent]);

  const onIgnoreAuditStale = () => {
    const fn = selectedChapter?.filename;
    if (!activeBook || !fn) return;
    void (async () => {
      try {
        const curHash = await sha1Hex(String(chapterContentRef.current || ""));
        auditDirtyIgnoreRef.current = setAuditDirtyIgnoreEntry(
          auditDirtyIgnoreRef.current,
          activeBook,
          fn,
          curHash
        );
        setAuditChapterStaleFilenames((prev) => {
          const next = new Set(prev);
          next.delete(fn);
          return next;
        });
        setAuditDirty(false);
        setAuditDirtyDelta(null);
      } catch {
        setAuditDirty(false);
        setAuditDirtyDelta(null);
      }
    })();
  };

  const [foreshadowCreateOpen, setForeshadowCreateOpen] = useState(false);
  const [foreshadowCreateTitle, setForeshadowCreateTitle] = useState("");
  const [foreshadowCreateStatus, setForeshadowCreateStatus] = useState<"open" | "progress" | "closed">("open");

  const [editForeshadowOpen, setEditForeshadowOpen] = useState(false);
  const [editForeshadowId, setEditForeshadowId] = useState("");
  const [editForeshadowTitle, setEditForeshadowTitle] = useState("");
  const [editForeshadowStatus, setEditForeshadowStatus] = useState<"open" | "progress" | "closed">("open");
  const [editForeshadowLastProgress, setEditForeshadowLastProgress] = useState("");
  const [editForeshadowNote, setEditForeshadowNote] = useState("");
  const [editForeshadowChapters, setEditForeshadowChapters] = useState("");

  const [hiddenForeshadowPanelOpen, setHiddenForeshadowPanelOpen] = useState(false);
  const [foreshadowExpanded, setForeshadowExpanded] = useState<Record<string, boolean>>({});
  const [hiddenOrgPanelOpen, setHiddenOrgPanelOpen] = useState(false);
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [editOrgName, setEditOrgName] = useState("");
  const [editOrgDesc, setEditOrgDesc] = useState("");
  const [editOrgLastNote, setEditOrgLastNote] = useState("");
  const [hiddenPlacePanelOpen, setHiddenPlacePanelOpen] = useState(false);
  const [editPlaceOpen, setEditPlaceOpen] = useState(false);
  const [editPlaceName, setEditPlaceName] = useState("");
  const [editPlaceDesc, setEditPlaceDesc] = useState("");
  const [editPlaceLastNote, setEditPlaceLastNote] = useState("");
  const [mergePlaceOpen, setMergePlaceOpen] = useState(false);
  const [mergePlaceSelected, setMergePlaceSelected] = useState<Record<string, boolean>>({});
  const [mergePlaceDraft, setMergePlaceDraft] = useState<any | null>(null);
  const [mergePlaceDraftText, setMergePlaceDraftText] = useState("");
  const [mergePlaceDraftBusy, setMergePlaceDraftBusy] = useState(false);
  const [placeRevealTarget, setPlaceRevealTarget] = useState<{ group: string; name: string } | null>(null);
  const [hiddenCharPanelOpen, setHiddenCharPanelOpen] = useState(false);
  const [editCharOpen, setEditCharOpen] = useState(false);
  const [editCharName, setEditCharName] = useState("");
  const [editCharRole, setEditCharRole] = useState("");
  const [editCharTags, setEditCharTags] = useState("");
  const [editCharStateJson, setEditCharStateJson] = useState("");
  const [editCharPersonality, setEditCharPersonality] = useState("");
  const [editCharSocialProfession, setEditCharSocialProfession] = useState("");
  const [editCharSocialClass, setEditCharSocialClass] = useState("");
  const [editCharSocialTitles, setEditCharSocialTitles] = useState("");
  const [editCharSocialOther, setEditCharSocialOther] = useState("");
  const [editCharHistoricalDebts, setEditCharHistoricalDebts] = useState("");
  const [editCharOccurredNotes, setEditCharOccurredNotes] = useState("");
  const [editCharWant, setEditCharWant] = useState("");
  const [editCharNeed, setEditCharNeed] = useState("");
  const [editCharMoralCompass, setEditCharMoralCompass] = useState("");
  const [editCharFlaws, setEditCharFlaws] = useState("");
  const [editCharBlindSpots, setEditCharBlindSpots] = useState("");
  const [editCharLinguisticStyle, setEditCharLinguisticStyle] = useState("");
  const [editCharCatchphrases, setEditCharCatchphrases] = useState("");
  const [editCharMannerisms, setEditCharMannerisms] = useState("");
  const [editCharMaskLines, setEditCharMaskLines] = useState("");
  const [editCharRelationsLines, setEditCharRelationsLines] = useState("");
  const [editCharRelationsFreeText, setEditCharRelationsFreeText] = useState("");
  const [editCharLockTags, setEditCharLockTags] = useState(false);
  const [editCharLockSocialTags, setEditCharLockSocialTags] = useState(false);
  const [editCharLockHistoricalDebts, setEditCharLockHistoricalDebts] = useState(false);
  const [editCharLockOccurredNotes, setEditCharLockOccurredNotes] = useState(false);
  const [editCharLockNarrativeDrives, setEditCharLockNarrativeDrives] = useState(false);
  const [editCharLockFingerprints, setEditCharLockFingerprints] = useState(false);
  const [editCharLockRelationalHooks, setEditCharLockRelationalHooks] = useState(false);
  const [relationsSearch, setRelationsSearch] = useState("");
  const [relationsFocusChar, setRelationsFocusChar] = useState<string | null>(null);
  const [relationsTypeFilter, setRelationsTypeFilter] = useState<string | null>(null);
  const [relationsOnlyWithRelations, setRelationsOnlyWithRelations] = useState(false);
  const [relationsAddRequestKey, setRelationsAddRequestKey] = useState(0);

  useEffect(() => {
    if (globalTab !== "relations") setRelationsAddRequestKey(0);
  }, [globalTab]);

  const [auditCharactersSearch, setAuditCharactersSearch] = useState("");
  const [timelineIndex, setTimelineIndex] = useState<TimelineIndex | null>(null);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineCompressStart, setTimelineCompressStart] = useState("");
  const [timelineCompressEnd, setTimelineCompressEnd] = useState("");
  const [timelineShowDoneEvents, setTimelineShowDoneEvents] = useState(false);
  const [memoryTab, setMemoryTab] = useState<"chapters" | "ranges">("chapters");
  const [memoryExpanded, setMemoryExpanded] = useState<Record<string, boolean>>({});
  const [memoryChaptersSortDesc, setMemoryChaptersSortDesc] = useState(true);
  const [memoryRangesSortDesc, setMemoryRangesSortDesc] = useState(true);
  const [auditBusy, setAuditBusy] = useState(false);
  const auditedChapterFilenameSet = useMemo(() => {
    const arr = (timelineIndex as any)?.chapters;
    if (!Array.isArray(arr)) return new Set<string>();
    const s = new Set<string>();
    for (const x of arr) {
      const fn = String(x?.filename || "").trim();
      if (fn) s.add(fn);
    }
    return s;
  }, [timelineIndex]);
  const [auditChapterStaleFilenames, setAuditChapterStaleFilenames] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const auditChapterStaleHashRef = useRef<Record<string, string>>({});
  const okModelConfigs = useMemo(() => modelConfigs.filter((c) => c.lastTestOk), [modelConfigs]);
  const [auditModelPickerOpen, setAuditModelPickerOpen] = useState(false);
  const [auditModelSearch, setAuditModelSearch] = useState("");
  type AuditStreamPhase = "idle" | "running" | "done" | "error";
  const [auditStreamPhase, setAuditStreamPhase] = useState<AuditStreamPhase>("idle");
  const [auditStreamText, setAuditStreamText] = useState("");
  const [auditRunningChapter, setAuditRunningChapter] = useState<{ bookSlug: string; filename: string } | null>(null);
  const [auditProgress, setAuditProgress] = useState<{ step: number; total: number; label: string } | null>(null);
  const auditStreamRef = useRef<HTMLDivElement | null>(null);
  const auditReaderRootRef = useRef<HTMLDivElement | null>(null);
  const [auditHover, setAuditHover] = useState<{
    target: AuditLinkTarget;
    rect: { left: number; top: number; width: number; height: number };
  } | null>(null);

  const [polishBusy, setPolishBusy] = useState(false);
  type PolishPhase = "idle" | "running" | "done" | "error";
  const [polishPhase, setPolishPhase] = useState<PolishPhase>("idle");
  const [polishDraft, setPolishDraft] = useState("");

  const [mobileLayoutBusy, setMobileLayoutBusy] = useState(false);
  const [mobileLayoutDraft, setMobileLayoutDraft] = useState("");
  const [mobileLayoutOriginal, setMobileLayoutOriginal] = useState("");

  const [expandModalOpen, setExpandModalOpen] = useState(false);
  const [expandTargetWords, setExpandTargetWords] = useState("");
  const [expandExtraContext, setExpandExtraContext] = useState("");
  const [expandBusy, setExpandBusy] = useState(false);
  const [expandDraft, setExpandDraft] = useState("");
  /** SSE 收到的完整思考缓冲(服务端可能一次推一大块);界面用 RAF 逐段追上 */
  const auditThinkingBufferRef = useRef("");
  const auditDisplayedLenRef = useRef(0);
  const auditRevealRafRef = useRef<number | null>(null);
  const selectedChapterFilenameRef = useRef<string>("");
  const auditRunningChapterRef = useRef<{ bookSlug: string; filename: string } | null>(null);
  const auditStreamPhaseRef = useRef<AuditStreamPhase>("idle");

  useEffect(() => {
    selectedChapterFilenameRef.current = selectedChapter?.filename || "";
  }, [selectedChapter?.filename]);

  useEffect(() => {
    auditRunningChapterRef.current = auditRunningChapter;
  }, [auditRunningChapter]);

  useEffect(() => {
    auditStreamPhaseRef.current = auditStreamPhase;
  }, [auditStreamPhase]);

  const flushAuditThinkingReveal = useCallback(() => {
    auditRevealRafRef.current = null;
    const full = auditThinkingBufferRef.current;
    let len = auditDisplayedLenRef.current;
    if (len >= full.length) return;
    const backlog = full.length - len;
    const stride =
      backlog > 2500 ? 20 : backlog > 1000 ? 10 : backlog > 400 ? 4 : backlog > 150 ? 2 : 1;
    len = Math.min(len + stride, full.length);
    auditDisplayedLenRef.current = len;
    const running = auditRunningChapterRef.current;
    const viewing = selectedChapterFilenameRef.current;
    if (running && viewing === running.filename) {
      setAuditStreamText(full.slice(0, len));
    }
    if (len < full.length) {
      auditRevealRafRef.current = requestAnimationFrame(flushAuditThinkingReveal);
    }
  }, []);

  const appendAuditThinkingDelta = useCallback(
    (delta: string) => {
      const d = delta ?? "";
      if (!d) return;
      auditThinkingBufferRef.current += d;
      if (auditRevealRafRef.current == null) {
        auditRevealRafRef.current = requestAnimationFrame(flushAuditThinkingReveal);
      }
    },
    [flushAuditThinkingReveal]
  );

  const resetAuditThinkingReveal = useCallback(() => {
    if (auditRevealRafRef.current != null) {
      cancelAnimationFrame(auditRevealRafRef.current);
      auditRevealRafRef.current = null;
    }
    auditThinkingBufferRef.current = "";
    auditDisplayedLenRef.current = 0;
    setAuditStreamText("");
  }, []);

  useEffect(() => {
    return () => {
      if (auditRevealRafRef.current != null) cancelAnimationFrame(auditRevealRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (rightTab !== "chapterAnalysis") return;
    const el = auditStreamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [auditStreamText, rightTab]);

  useEffect(() => {
    // 从"非运行章节"切回"运行章节"时:如果后台缓冲已经变长,立即继续追帧更新 UI
    const running = auditRunningChapter;
    if (!running) return;
    if (!selectedChapter) return;
    if (selectedChapter.filename !== running.filename) return;
    if (auditStreamPhase !== "running") return;
    if (auditDisplayedLenRef.current >= auditThinkingBufferRef.current.length) return;
    if (auditRevealRafRef.current != null) return;
    auditRevealRafRef.current = requestAnimationFrame(flushAuditThinkingReveal);
  }, [auditRunningChapter, selectedChapter, auditStreamPhase, flushAuditThinkingReveal]);

  useEffect(() => {
    // 只允许选择"连接成功"的配置;如果当前 active 不在成功列表,自动回落
    if (!okModelConfigs.length) return;
    if (activeModelId && okModelConfigs.some((c) => c.id === activeModelId)) return;
    setModelState((prev) => ({ ...prev, activeId: okModelConfigs[0].id }));
  }, [okModelConfigs, activeModelId]);

  const activeModelLabel = useMemo(() => {
    const c = okModelConfigs.find((x) => x.id === activeModelId) ?? okModelConfigs[0];
    if (!c) return "暂无可用模型";
    const name = (c.model ?? "").trim();
    return name ? `${c.label} · ${name}` : c.label;
  }, [okModelConfigs, activeModelId]);

  const okModelGroups = useMemo(() => {
    type Item =
      | { kind: "config"; id: string; configId: string; label: string }
      | { kind: "ollamaModel"; id: string; configId: string; label: string; modelName: string };

    const toItems = (c: ModelConfig): Item[] => {
      if (c.provider === "ollama" && Array.isArray(c.lastModels) && c.lastModels.length) {
        const uniq = [...new Set(c.lastModels.map((x) => String(x).trim()).filter(Boolean))].slice(0, 200);
        uniq.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
        return uniq.map((name) => ({
          kind: "ollamaModel",
          id: `${c.id}::${name}`,
          configId: c.id,
          label: name,
          modelName: name
        }));
      }
      const label = (c.model ?? "").trim() || c.label;
      return [{ kind: "config", id: c.id, configId: c.id, label }];
    };

    const byProvider = new Map<ModelProviderId, Item[]>();
    for (const c of okModelConfigs) {
      const arr = byProvider.get(c.provider) ?? [];
      arr.push(...toItems(c));
      byProvider.set(c.provider, arr);
    }
    const labelOf = (p: ModelProviderId) => BUILTIN_MODEL_PROVIDERS.find((x) => x.id === p)?.label ?? p;
    return BUILTIN_MODEL_PROVIDERS.map((p) => ({ id: p.id, label: labelOf(p.id), items: byProvider.get(p.id) ?? [] }));
  }, [okModelConfigs]);

  const okModelGroupsFiltered = useMemo(() => {
    const q = auditModelSearch.trim().toLowerCase();
    if (!q) return okModelGroups.filter((g) => g.items.length);
    return okModelGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((it: any) => {
          const s = `${g.label} ${it.label} ${it.kind ?? ""}`.toLowerCase();
          return s.includes(q);
        })
      }))
      .filter((g) => g.items.length);
  }, [okModelGroups, auditModelSearch]);

  async function goSettings(tab: SettingsTabId = "models") {
    try {
      await flushSynopsisSave();
      await flushChapterSave();
    } catch {
      // ignore
    }
    setAuditModelPickerOpen(false);
    setAuditModelSearch("");
    setNavHome(true);
    setHomeCenterTab("settings");
    setSettingsTab(tab);
    setActiveBook("");
    setSelectedChapter(null);
    setSelectedCard(null);
  }

  useEffect(() => {
    setCurrentChapterEditorHash(null);
    currentChapterEditorHashRef.current = null;
  }, [selectedChapter?.filename, activeBook]);

  useEffect(() => {
    if (!activeBook || !selectedChapter) return;
    let cancelled = false;
    void (async () => {
      const hash = await sha1Hex(chapterContent);
      if (cancelled) return;
      setCurrentChapterEditorHash(hash);
      currentChapterEditorHashRef.current = hash;
      applyChapterDraftOutOfSyncMerge();
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterContent, selectedChapter?.filename, activeBook, latestHistoryHashByChapter, applyChapterDraftOutOfSyncMerge]);

  useEffect(() => {
    if (!historyPaneOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeHistoryPane();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyPaneOpen]);

  useEffect(() => {
    if (!activeBook) {
      prevBookSlugRef.current = "";
      return;
    }
    const m = books.find((b) => b.bookId === activeBook);
    if (!m) return;
    if (prevBookSlugRef.current !== activeBook) {
      prevBookSlugRef.current = activeBook;
      const s = m.synopsis ?? "";
      setSynopsisDraft(s);
      synopsisBaselineRef.current = s;
    }
  }, [activeBook, books]);

  useEffect(() => {
    setOutlineSubTab("book");
    setSelectedStageNodeId(null);
    if (activeBook) setLeftTab("chapters");
  }, [activeBook]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistSynopsisNow 依赖 ref,避免重复挂载定时器
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
    setRightCollapsed(false);
    setHomeCenterTab("welcome");
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
    setActiveBook(b.bookId);
    setNavHome(false);
    setNavCollapsed(false);
    setRightCollapsed(false);
    setSelectedChapter(null);
    setSelectedCard(null);
    setChapterContent("");
    setCardContent("");
    chapterBaselineRef.current = "";
    cardBaselineRef.current = "";
    setChapterAutosaveHint("");
    setCardAutosaveHint("");
    setChapterTitleEditing(false);
    // 进入书籍后默认展示书籍概览(selectedChapter=null); 数据由 activeBook useEffect 加载
  }

  function openCreateBookModal() {
    setModalNewTitle("");
    setModalNewSynopsis("");
    setCreateBookModalOpen(true);
  }

  const hasAiModel = Boolean(activeModelId) && modelConfigs.some((c) => c.id === activeModelId);

  async function refreshBookSetupPlans() {
    try {
      const { plans } = await listBookSetupPlans();
      setBookSetupPlans(plans);
    } catch {
      setBookSetupPlans([]);
    }
  }

  useEffect(() => {
    if (navHome) void refreshBookSetupPlans();
  }, [navHome, bookSetupWizardOpen]);

  function openNewBookPlan() {
    if (!hasAiModel) {
      setStatus("请先在设置中配置 AI 模型（设置 → 模型）");
      return;
    }
    setBookSetupSessionId(null);
    setBookSetupWizardOpen(true);
  }

  function continueBookPlan(sessionId: string) {
    if (!hasAiModel) {
      setStatus("请先在设置中配置 AI 模型（设置 → 模型）");
      return;
    }
    setBookSetupSessionId(sessionId);
    setBookSetupWizardOpen(true);
  }

  function openPlanningFromBook() {
    if (!hasAiModel) {
      setStatus("请先在设置中配置 AI 模型（设置 → 模型）");
      return;
    }
    const sid = activeBookMeta?.setupSessionId;
    if (!sid) return;
    setBookSetupSessionId(sid);
    setBookSetupWizardOpen(true);
  }

  async function handleLinkedPlanningSync() {
    const { books: list } = await listBooks();
    setBooks(list);
    const m = list.find((b) => b.bookId === activeBookRef.current);
    if (m?.synopsis != null) setSynopsisDraft(m.synopsis);
    setOutlineRefreshKey((k) => k + 1);
    setStatus("规划已同步到本书（含大纲阶段）");
  }

  async function discardBookPlan(sessionId: string) {
    const label = bookSetupPlans.find((p) => p.sessionId === sessionId)?.displayTitle ?? "该规划";
    if (!(await appConfirm({
      message: `确定废弃「${label}」？本地草案将删除且无法恢复。`,
      variant: "danger"
    }))) return;
    setBusy(true);
    try {
      await discardBookSetupPlan(sessionId);
      if (bookSetupSessionId === sessionId) {
        setBookSetupSessionId(null);
        setBookSetupWizardOpen(false);
      }
      await refreshBookSetupPlans();
      setStatus("已废弃规划");
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function suggestPlanTitle(sessionId: string) {
    if (!hasAiModel) {
      setStatus("请先在设置中配置 AI 模型（设置 → 模型）");
      return;
    }
    setBusy(true);
    try {
      const { title } = await suggestBookSetupTitle(sessionId, { modelConfigId: activeModelId });
      await refreshBookSetupPlans();
      setStatus(`已生成标题：${title}`);
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function openBookSetupWizard() {
    setShelfTab("planning");
    openNewBookPlan();
  }

  async function handleBookSetupCreated(book: BookMeta) {
    await refreshBooks();
    await refreshBookSetupPlans();
    setBookSetupSessionId(null);
    setShelfTab("books");
    setActiveBook(book.bookId);
    setNavHome(false);
    setNavCollapsed(false);
    setRightCollapsed(false);
    setStatus(`已创建书籍：${book.title}`);
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
      setActiveBook(book.bookId);
      setNavHome(false);
      setNavCollapsed(false);
      setRightCollapsed(false);
      setStatus(`已创建书籍:${book.title}`);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // 书架不再保存简介(改为在书籍概览中编辑)

  function openDeleteBookModal(b: BookMeta) {
    setDeleteBookTarget(b);
    setDeleteBookModalOpen(true);
  }

  function closeDeleteBookModal() {
    setDeleteBookModalOpen(false);
    setDeleteBookTarget(null);
  }

  async function confirmDeleteBook() {
    const b = deleteBookTarget;
    if (!b) return;
    setBusy(true);
    setStatus("");
    try {
      await deleteBook(b.bookId);
      closeDeleteBookModal();
      await refreshBooks();
      if (activeBookRef.current === b.bookId) {
        setNavHome(true);
        setHomeCenterTab("welcome");
        setActiveBook("");
        setSelectedChapter(null);
        setSelectedCard(null);
        setChapterContent("");
        setCardContent("");
      }
      setStatus(`已废弃书籍:《${b.title}》`);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openClearBookAuditModal() {
    if (!activeBook || !activeBookMeta) return;
    if (
      auditStreamPhaseRef.current === "running" &&
      auditRunningChapterRef.current?.bookSlug === activeBook
    ) {
      setStatus("当前有章节分析进行中，请等待结束后再清空。");
      return;
    }
    setClearBookAuditConfirmDraft("");
    setClearBookAuditModalOpen(true);
  }

  function closeClearBookAuditModal() {
    setClearBookAuditModalOpen(false);
    setClearBookAuditConfirmDraft("");
  }

  async function confirmClearBookAudit() {
    const slug = activeBook;
    if (!slug) return;
    setBusy(true);
    setStatus("");
    try {
      await clearBookAudit(slug);
      closeClearBookAuditModal();
      resetAuditThinkingReveal();
      auditThinkingBufferRef.current = "";
      auditDisplayedLenRef.current = 0;
      setAuditStreamText("");
      setAuditStreamPhase("idle");
      setAuditRun(null);
      setAuditLedger(null);
      setWritingPack(null);
      setWritingPackErr("");
      setWritingPackListsOpen(false);
      await loadGlobalArtifacts(slug);
      const sel = selectedChapterRef.current;
      if (sel?.bookSlug === slug) {
        await loadAuditArtifacts(slug, sel.filename);
      }
      setStatus("已清空本书全部分析数据。");
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
      setStatsRefreshKey((k) => k + 1);

      if (bookSlug === activeBook) setChapterTitle("");

      if (bookSlug !== activeBook) {
        setActiveBook(bookSlug);
        setNavHome(false);
        setNavCollapsed(false);
        setRightCollapsed(false);
        setSelectedCard(null);
        setCardContent("");
        cardBaselineRef.current = "";
      }

      await refreshChapters(bookSlug);
      await refreshStory(bookSlug);
      await refreshTimelineIndex(bookSlug).catch(() => {});
      await refreshBooks();

      setCurrentChapterEditorHash(null);
      currentChapterEditorHashRef.current = null;
      setSelectedChapter({ bookSlug, filename: chapter.filename });
      const { content } = await readChapter(bookSlug, chapter.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      await prefetchChapterLatestHistoryHash(bookSlug, chapter.filename);
      applyChapterDraftOutOfSyncMerge();
      setChapterTitleEditing(false);

      // 新建章节后:刷新右侧内容整理数据源
      setAuditStreamPhase("idle");
      resetAuditThinkingReveal();
      setAuditRun(null);
      setAuditLedger(null);
      setAuditCharactersIndex(null);
      setTimelineIndex(null);
      setWritingPack(null);
      setWritingPackErr("");
      setWritingPackListsOpen(false);
      void loadAuditArtifacts(bookSlug, chapter.filename);
      setRightTab("writingPack");
      void doGenerateWritingPack(bookSlug, chapter.filename);
      setStatus("已新建章节,并写入本地文件。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openShelfChapterGapModal(b: BookMeta) {
    const gaps = normalizeChapterGapList(b.missingChapterIndexes ?? []);
    if (gaps.length === 0) return;
    setChapterGapModalBookSlug(b.bookId);
    setChapterGapModalIndexes(gaps);
    setChapterGapModalDraftTitle("");
    setChapterGapModalOpen(true);
  }

  async function onCreateChapter() {
    if (!activeBook) return;
    if (!chapterTitle.trim()) return;

    // 点击"新增章节"立刻重置右侧内容整理(避免残留上一章的摘要/角色展开/时间线等)
    setRightTab("chapterAnalysis");
    setExpandedAuditCharIds({});
    setSelectedCard(null);
    setCardContent("");
    cardBaselineRef.current = "";
    setAuditRun(null);
    setAuditLedger(null);
    setAuditCharactersIndex(null);
    setTimelineIndex(null);

    const gaps = normalizeChapterGapList(books.find((b) => b.bookId === activeBook)?.missingChapterIndexes ?? []);
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
    const m = books.find((bk) => bk.bookId === slug);
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
      setHistoryPaneOpen(false);
      setChapterVersions([]);
      setSelectedHistoryVersionId(null);
      setVersionContentCache({});
      setCurrentChapterEditorHash(null);
      currentChapterEditorHashRef.current = null;
      setSelectedChapter({ bookSlug: activeBook, filename: c.filename });
      setMobileLayoutDraft("");
      setMobileLayoutOriginal("");
      const { content } = await readChapter(activeBook, c.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      await prefetchChapterLatestHistoryHash(activeBook, c.filename);
      applyChapterDraftOutOfSyncMerge();
      queueMicrotask(() => scrollChapterToTop());
      void loadAuditArtifacts(activeBook, c.filename);
      void loadGlobalArtifacts(activeBook);
      // 运行中:允许切章浏览,但不清空缓冲/不断流
      const running = auditRunningChapterRef.current;
      const phase = auditStreamPhaseRef.current;
      const isAuditRunningInThisBook = running && phase === "running" && running.bookSlug === activeBook;
      const isOpeningRunningChapter = isAuditRunningInThisBook && running.filename === c.filename;

      if (isAuditRunningInThisBook && !isOpeningRunningChapter) {
        // 正在分析别章:清空展示避免串章,但不重置缓冲/phase
        setAuditStreamText("");
      } else if (!isOpeningRunningChapter) {
        // 非运行章(或没有在分析):按原逻辑重置面板
        resetAuditThinkingReveal();
        setAuditStreamPhase("idle");
      }

      // 切回运行章:立即从缓冲回填,并继续追帧
      if (isOpeningRunningChapter) {
        setAuditStreamPhase("running");
        setAuditStreamText(auditThinkingBufferRef.current.slice(0, auditDisplayedLenRef.current));
        if (auditDisplayedLenRef.current < auditThinkingBufferRef.current.length && auditRevealRafRef.current == null) {
          auditRevealRafRef.current = requestAnimationFrame(flushAuditThinkingReveal);
        }
      }
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function jumpToRunningAuditChapter() {
    if (!activeBook) return;
    const running = auditRunningChapter;
    if (!running || running.bookSlug !== activeBook) return;
    const m = chapters.find((x) => x.filename === running.filename);
    if (!m) return;
    setRightTab("chapterAnalysis");
    await onOpenChapter(m);
  }

  async function refreshAuditChapterStale(slug: string) {
    try {
      const { chapters } = await getAuditChapterStale(slug);
      const hashByFilename: Record<string, string> = {};
      const staleRaw = new Set<string>();
      for (const c of chapters) {
        hashByFilename[c.filename] = c.currentHash;
        if (c.stale) staleRaw.add(c.filename);
      }
      auditChapterStaleHashRef.current = hashByFilename;
      setAuditChapterStaleFilenames(
        filterStaleChaptersWithIgnore(slug, staleRaw, hashByFilename, auditDirtyIgnoreRef.current)
      );
    } catch {
      auditChapterStaleHashRef.current = {};
      setAuditChapterStaleFilenames(new Set());
    }
  }

  async function loadGlobalArtifacts(slug: string) {
    if (!slug) return;
    try {
      const [
        { index },
        { index: timelineIdx },
        { index: placesIdx },
        { index: foreshadowsIdx },
        { index: progressIdx },
        { index: orgsIdx }
      ] = await Promise.all([
        getAuditCharacters(slug).catch(() => ({ index: null })),
        getTimelineIndex(slug).catch(() => ({ index: null as any })),
        getAuditPlaces(slug).catch(() => ({ index: null as any })),
        getAuditForeshadows(slug).catch(() => ({ index: null as any })),
        getAuditProgress(slug).catch(() => ({ index: null as any })),
        getAuditOrgs(slug).catch(() => ({ index: null as any }))
      ]);
      if (activeBookRef.current !== slug) return;
      setAuditCharactersIndex(index);
      setTimelineIndex(timelineIdx);
      setAuditPlacesIndex(placesIdx);
      setAuditForeshadowsIndex(foreshadowsIdx);
      setAuditProgressIndex(progressIdx);
      setAuditOrgsIndex(orgsIdx);
      void refreshAuditChapterStale(slug);
      void refreshChapterDraftStatus(slug);
    } catch {
      // ignore
    }
  }

  const clearBookScopedState = useCallback(() => {
    setAuditCharactersIndex(null);
    setAuditPlacesIndex(null);
    setAuditOrgsIndex(null);
    setAuditForeshadowsIndex(null);
    setAuditProgressIndex(null);
    setTimelineIndex(null);
    setInspirationIndex(null);
    setChapters([]);
    setStoryFiles([]);
    setCharFiles([]);
    setExpandedAuditCharIds({});
    setForeshadowExpanded({});
    setAuditCharactersSearch("");
    setRelationsSearch("");
    setRelationsFocusChar(null);
    setRelationsTypeFilter(null);
    setRelationsOnlyWithRelations(false);
    setRelationsAddRequestKey(0);
    setMemoryExpanded({});
    setAuditChapterStaleFilenames(new Set());
    auditChapterStaleHashRef.current = {};
    setLatestHistoryHashByChapter({});
    setChaptersDraftOutOfSync(new Set());
    serverDraftOutOfSyncRef.current = [];
    setAuditRun(null);
    setAuditLedger(null);
    setWritingPack(null);
    setWritingPackErr("");
    setWritingPackListsOpen(false);
    setAuditStreamPhase("idle");
    resetAuditThinkingReveal();
  }, [resetAuditThinkingReveal]);

  const reloadActiveBookData = useCallback(
    (slug: string) => {
      if (!slug) return;
      setOutlineRefreshKey((k) => k + 1);
      setStatsRefreshKey((k) => k + 1);
      void loadInspiration(slug);
      void loadGlobalArtifacts(slug);
      refreshChapters(slug).catch((e) => setStatus(String(e?.message || e)));
      refreshStory(slug).catch((e) => setStatus(String(e?.message || e)));
    },
    [loadInspiration]
  );

  useEffect(() => {
    if (!activeBook) {
      clearBookScopedState();
      return;
    }
    clearBookScopedState();
    reloadActiveBookData(activeBook);
  }, [activeBook, clearBookScopedState, reloadActiveBookData]);

  async function loadAuditArtifacts(slug: string, chapterFilename: string) {
    try {
      const [{ run }, { text }, { pack }] = await Promise.all([
        getAuditLatest(slug, chapterFilename).catch(() => ({ run: null })),
        getAuditAnalysis(slug, chapterFilename).catch(() => ({ text: "" })),
        getWritingPack(slug, chapterFilename).catch(() => ({ pack: null }))
      ]);

      setAuditRun(run);
      setWritingPack(pack);
      setWritingPackErr("");

      const persisted = String(text || "");
      const running = auditRunningChapterRef.current;
      const isRunningThis =
        running &&
        running.bookSlug === slug &&
        running.filename === chapterFilename &&
        auditStreamPhaseRef.current === "running";
      const isViewingNonRunningWhileRunning =
        running && running.bookSlug === slug && running.filename !== chapterFilename && auditStreamPhaseRef.current === "running";

      if (!isRunningThis && persisted.trim()) {
        // 持久化的"本章分析"文本:直接当成完整缓冲,避免 RAF 逐段追帧导致二次"打字机效果"
        resetAuditThinkingReveal();
        auditThinkingBufferRef.current = persisted;
        auditDisplayedLenRef.current = persisted.length;
        setAuditStreamText(persisted);
        setAuditStreamPhase("done");
      } else if (!isRunningThis && isViewingNonRunningWhileRunning) {
        // 正在分析别章,但用户在查看本章:本章无持久化内容时,显示为空(不影响运行缓冲)
        if (!persisted.trim()) {
          setAuditStreamText("");
        }
      } else if (!isRunningThis && auditStreamPhaseRef.current !== "running") {
        setAuditStreamPhase("idle");
      }
    } catch {
      // ignore
    }
  }

  async function doGenerateWritingPack(slug: string, chapterFilename: string) {
    if (!slug || !chapterFilename) return;
    setWritingPackBusy(true);
    setWritingPackErr("");
    try {
      const { pack } = await generateWritingPack(slug, { chapterFilename, modelConfigId: activeModelId ?? null });
      setWritingPack(pack);
      setWritingPackListsOpen(false);
    } catch (e: any) {
      setWritingPackErr(e?.message || String(e));
    } finally {
      setWritingPackBusy(false);
    }
  }

  async function runSearchNow(query: string) {
    const slug = activeBookRef.current;
    const q = String(query || "").trim();
    if (!slug || !q) {
      setSearchGroups([]);
      return;
    }
    setSearchBusy(true);
    setSearchErr("");
    try {
      const { groups } = await searchBook(slug, {
        q,
        sort: searchSort,
        caseSensitive: false,
        wholeWord: false,
        limit: 200,
        offset: 0
      });
      setSearchGroups(groups || []);
    } catch (e: any) {
      setSearchErr(e?.message || String(e));
    } finally {
      setSearchBusy(false);
    }
  }

  function scheduleSearch(q: string) {
    if (searchDebounceRef.current !== null) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => void runSearchNow(q), 250);
  }

  function openEditPlace(p: any) {
    const name = String(p?.name || "").trim();
    if (!name) return;
    setEditPlaceName(name);
    setEditPlaceDesc(String(p?.description || "").trim());
    setEditPlaceLastNote(String(p?.lastNote || "").trim());
    setMergePlaceOpen(false);
    setMergePlaceSelected({});
    setMergePlaceDraft(null);
    setMergePlaceDraftText("");
    setEditPlaceOpen(true);
  }

  async function submitEditPlace() {
    if (!activeBook) return;
    const name = editPlaceName.trim();
    if (!name) return;
    try {
      const { index } = await updateAuditPlace(activeBook, {
        name,
        description: editPlaceDesc,
        lastNote: editPlaceLastNote
      });
      setAuditPlacesIndex(index);
      setEditPlaceOpen(false);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  function openEditOrg(o: any) {
    const name = String(o?.name || "").trim();
    if (!name) return;
    setEditOrgName(name);
    setEditOrgDesc(String(o?.description || "").trim());
    setEditOrgLastNote(String(o?.lastNote || "").trim());
    setEditOrgOpen(true);
  }

  async function submitEditOrg() {
    if (!activeBook) return;
    const name = editOrgName.trim();
    if (!name) return;
    try {
      const { index } = await updateAuditOrg(activeBook, {
        name,
        description: editOrgDesc,
        lastNote: editOrgLastNote
      });
      setAuditOrgsIndex(index);
      setEditOrgOpen(false);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  function openEditForeshadow(f: any) {
    const id = String(f?.id || "").trim();
    if (!id) return;
    setEditForeshadowId(id);
    setEditForeshadowTitle(String(f?.title || "").trim());
    const st = String(f?.status || "open");
    setEditForeshadowStatus(st === "closed" ? "closed" : st === "progress" ? "progress" : "open");
    setEditForeshadowLastProgress(String(f?.lastProgress || "").trim());
    setEditForeshadowNote(String(f?.note || "").trim());
    const chapters = Array.isArray(f?.chapters) ? (f.chapters as any[]).map((n) => String(n)).join(",") : "";
    setEditForeshadowChapters(chapters);
    setEditForeshadowOpen(true);
  }

  async function submitEditForeshadow() {
    if (!activeBook) return;
    const id = editForeshadowId.trim();
    if (!id) return;
    const title = editForeshadowTitle.trim();
    try {
      const chapters = editForeshadowChapters
        .split(/[,,、\s]+/g)
        .map((x) => Math.floor(Number(x)))
        .filter((n) => Number.isFinite(n) && n >= 1);
      const uniq = [...new Set(chapters)].sort((a, b) => a - b);
      const { index } = await updateAuditForeshadow(activeBook, {
        id,
        title,
        status: editForeshadowStatus,
        lastProgress: editForeshadowLastProgress,
        note: editForeshadowNote,
        chapters: uniq.length ? uniq : undefined
      });
      setAuditForeshadowsIndex(index);
      setEditForeshadowOpen(false);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  async function submitCreateForeshadow() {
    if (!activeBook) return;
    const title = foreshadowCreateTitle.trim();
    if (!title) return;
    try {
      const { index } = await createAuditForeshadow(activeBook, { title, status: foreshadowCreateStatus });
      setAuditForeshadowsIndex(index);
      setForeshadowCreateTitle("");
      setForeshadowCreateStatus("open");
      setForeshadowCreateOpen(false);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  async function refreshTimelineIndex(slug: string) {
    if (!slug) return;
    setTimelineBusy(true);
    try {
      const { index } = await getTimelineIndex(slug);
      setTimelineIndex(index);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setTimelineBusy(false);
    }
  }

  async function compressMemoryRangeWithMerge(startChapter: number, endChapter: number) {
    if (!activeBook) return;
    const a = Math.min(startChapter, endChapter);
    const b = Math.max(startChapter, endChapter);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1) return;

    setTimelineBusy(true);
    setStatus("");
    const existing = Array.isArray(timelineIndex?.compressedRanges) ? timelineIndex!.compressedRanges : [];
    const overlaps = existing.filter((r: any) => {
      const s = Number(r?.startChapter);
      const e = Number(r?.endChapter);
      if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
      const rs = Math.min(s, e);
      const re = Math.max(s, e);
      const hit = Math.max(a, rs) <= Math.min(b, re);
      return hit && !(rs === a && re === b);
    });

    let targetA = a;
    let targetB = b;

    if (overlaps.length) {
      const unionA = Math.min(a, ...overlaps.map((r: any) => Number(r.startChapter)));
      const unionB = Math.max(b, ...overlaps.map((r: any) => Number(r.endChapter)));
      const list = overlaps
        .map((r: any) => `${r.startChapter}-${r.endChapter}`)
        .sort((x: string, y: string) => x.localeCompare(y, "zh-Hans-CN"))
        .join("、");
      const ok = await appConfirm({
        message: `你要压缩的区间第 ${a}-${b} 章与已有多章概要重叠:${list}\n\n是否合并为更粗区间:第 ${unionA}-${unionB} 章?\n(合并后会删除上述旧区间,仅保留并集区间摘要)`
      });
      if (!ok) {
        setTimelineBusy(false);
        return;
      }
      targetA = unionA;
      targetB = unionB;

      // union_replace:先删旧区间再压缩新并集
      for (const r of overlaps) {
        try {
          const { index } = await deleteTimelineRange(activeBook, { startChapter: r.startChapter, endChapter: r.endChapter });
          setTimelineIndex(index);
        } catch (e: any) {
          setStatus(e?.message || String(e));
          setTimelineBusy(false);
          return;
        }
      }
    }

    try {
      const { index } = await compressTimelineRange(activeBook, {
        startChapter: targetA,
        endChapter: targetB,
        modelConfigId: activeModelId ?? null
      });
      setTimelineIndex(index);
    } finally {
      setTimelineBusy(false);
    }
  }

  const jumpToOrganize = useCallback(
    (tab: "chapterAnalysis" | "chapterEntities" | "auditCharacters" | "places" | "timeline" | "foreshadows" | "story" | "orgs", key: string) => {
      // 额外展开:让"跳转过去"落点是可见的
      if (tab === "auditCharacters") {
        setExpandedAuditCharIds((prev) => ({ ...prev, [key]: true }));
      }
      if (tab === "places") {
        const places = Array.isArray(auditPlacesIndex?.places) ? (auditPlacesIndex.places as any[]) : [];
        const p = places.find((x) => String(x?.name || "").trim() === key);
        const group = String(p?.group || "").trim() || inferPlaceGroup(key);
        setPlaceRevealTarget({ group, name: key });
      }
      if (tab === "chapterAnalysis" || tab === "chapterEntities") {
        setRightTab(tab);
      } else if (tab === "auditCharacters" || tab === "places" || tab === "timeline" || tab === "foreshadows") {
        setLeftTab("global");
        setGlobalTab(tab);
      } else {
        setStatus("该分类已取消(不再提供入口)。");
        return;
      }

      requestAnimationFrame(() => {
        const root =
          tab === "chapterAnalysis" || tab === "chapterEntities"
            ? (document.querySelector(".organizeTabScroll") as HTMLElement | null)
            : (document.querySelector(".navGlobalScroll") as HTMLElement | null);
        if (!root) return;
        const esc = (s: string) => CSS.escape(s);
        const sel =
          tab === "auditCharacters"
            ? `[data-char-name="${esc(key)}"]`
            : tab === "places"
              ? `[data-place-name="${esc(key)}"]`
              : tab === "timeline"
                ? `[data-event-id="${esc(key)}"]`
                : tab === "foreshadows"
                  ? `[data-foreshadow-id="${esc(key)}"]`
                  : "";
        if (!sel) return;
        const el = root.querySelector(sel) as HTMLElement | null;
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("flashFocus");
        window.setTimeout(() => el.classList.remove("flashFocus"), 900);
      });
    },
    [auditPlacesIndex]
  );

  // 角色卡合并入口改到"编辑角色"弹窗内(更符合用户直觉)

  function openEditCharacter(c: any) {
    const name = String(c?.name || "").trim();
    if (!name) return;
    setEditCharName(name);
    setEditCharRole(typeof c?.role === "string" ? c.role : "");
    setEditCharTags(
      Array.isArray(c?.tags) ? (c.tags as any[]).map((x) => String(x)).filter(Boolean).join(", ") : ""
    );
    const st = c?.state && typeof c.state === "object" ? c.state : {};
    try {
      setEditCharStateJson(JSON.stringify(st, null, 2));
    } catch {
      setEditCharStateJson(String(st || ""));
    }
    setEditCharPersonality(String(c?.personalityAnalysis || "").trim());
    const social = c?.socialTags && typeof c.socialTags === "object" ? c.socialTags : {};
    setEditCharSocialProfession(String((social as any)?.profession || "").trim());
    setEditCharSocialClass(String((social as any)?.class || "").trim());
    setEditCharSocialTitles(
      Array.isArray((social as any)?.titles) ? (social as any).titles.map((x: any) => String(x).trim()).filter(Boolean).join("\n") : ""
    );
    setEditCharSocialOther(
      Array.isArray((social as any)?.other) ? (social as any).other.map((x: any) => String(x).trim()).filter(Boolean).join("\n") : ""
    );
    setEditCharHistoricalDebts(
      Array.isArray(c?.historicalDebts) ? (c.historicalDebts as any[]).map((x) => String(x).trim()).filter(Boolean).join("\n") : ""
    );
    setEditCharOccurredNotes(
      Array.isArray((c as any)?.occurredNotes)
        ? ((c as any).occurredNotes as any[]).map((x) => String(x).trim()).filter(Boolean).join("\n")
        : ""
    );
    const nd = c?.narrativeDrives && typeof c.narrativeDrives === "object" ? c.narrativeDrives : {};
    setEditCharWant(String((nd as any)?.want || "").trim());
    setEditCharNeed(String((nd as any)?.need || "").trim());
    setEditCharMoralCompass(String((nd as any)?.moralCompass || "").trim());
    setEditCharFlaws(
      Array.isArray((nd as any)?.flaws) ? (nd as any).flaws.map((x: any) => String(x).trim()).filter(Boolean).join("\n") : ""
    );
    setEditCharBlindSpots(
      Array.isArray((nd as any)?.blindSpots)
        ? (nd as any).blindSpots.map((x: any) => String(x).trim()).filter(Boolean).join("\n")
        : ""
    );
    const fp = c?.fingerprints && typeof c.fingerprints === "object" ? c.fingerprints : {};
    setEditCharLinguisticStyle(
      Array.isArray((fp as any)?.linguisticStyle)
        ? (fp as any).linguisticStyle.map((x: any) => String(x).trim()).filter(Boolean).join("\n")
        : ""
    );
    setEditCharCatchphrases(
      Array.isArray((fp as any)?.catchphrases)
        ? (fp as any).catchphrases.map((x: any) => String(x).trim()).filter(Boolean).join("\n")
        : ""
    );
    setEditCharMannerisms(
      Array.isArray((fp as any)?.mannerisms) ? (fp as any).mannerisms.map((x: any) => String(x).trim()).filter(Boolean).join("\n") : ""
    );
    setEditCharMaskLines(
      Array.isArray((fp as any)?.mask)
        ? (fp as any).mask
            .map((m: any) => ({
              context: String(m?.context || "").trim(),
              persona: String(m?.persona || "").trim()
            }))
            .filter((m: any) => m.context || m.persona)
            .map((m: any) => `${m.context || ""}=${m.persona || ""}`.trim())
            .join("\n")
        : ""
    );
    const rh = c?.relationalHooks && typeof c.relationalHooks === "object" ? c.relationalHooks : {};
    setEditCharRelationsFreeText(String((rh as any)?.freeText || "").trim());
    const locks = c?.locks && typeof c.locks === "object" ? c.locks : {};
    setEditCharLockTags(Boolean((locks as any).tags));
    setEditCharLockSocialTags(Boolean((locks as any).socialTags));
    setEditCharLockHistoricalDebts(Boolean((locks as any).historicalDebts));
    setEditCharLockOccurredNotes(Boolean((locks as any).occurredNotes));
    setEditCharLockNarrativeDrives(Boolean((locks as any).narrativeDrives));
    setEditCharLockFingerprints(Boolean((locks as any).fingerprints));
    setEditCharLockRelationalHooks(Boolean((locks as any).relationalHooks));
    setEditCharRelationsLines(
      Array.isArray((rh as any)?.relations)
        ? (rh as any).relations
            .map((r: any) => ({
              targetName: String(r?.targetName || "").trim(),
              types: Array.isArray(r?.types) ? r.types.map((x: any) => String(x).trim()).filter(Boolean) : [],
              emotionalPolarity: String(r?.emotionalPolarity || "").trim(),
              conflictIndex: String(r?.conflictIndex || "").trim(),
              sharedSecrets: Array.isArray(r?.sharedSecrets)
                ? r.sharedSecrets.map((x: any) => String(x).trim()).filter(Boolean)
                : []
            }))
            .filter((r: any) => r.targetName)
            .map(
              (r: any) =>
                `${r.targetName}|${r.types.length ? `types=${r.types.join(",")}` : ""}|${r.emotionalPolarity || ""}|${
                  r.conflictIndex || ""
                }|${r.sharedSecrets.join(",")}`.trim()
            )
            .join("\n")
        : ""
    );
    setEditCharOpen(true);
  }

  async function submitEditCharacter() {
    if (!activeBook) return;
    const name = editCharName.trim();
    if (!name) return;
    let state: any = undefined;
    const stText = editCharStateJson.trim();
    if (stText) {
      try {
        state = JSON.parse(stText);
      } catch (e: any) {
        setStatus(`state 不是合法 JSON:${e?.message || String(e)}`);
        return;
      }
    }
    const tags = editCharTags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    const lines = (t: string) =>
      t
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    const socialTags = {
      profession: editCharSocialProfession.trim() || undefined,
      class: editCharSocialClass.trim() || undefined,
      titles: lines(editCharSocialTitles).slice(0, 60),
      other: lines(editCharSocialOther).slice(0, 60)
    };
    const historicalDebts = lines(editCharHistoricalDebts).slice(0, 120);
    const occurredNotes = lines(editCharOccurredNotes).slice(0, 6000);
    const narrativeDrives = {
      want: editCharWant.trim() || undefined,
      need: editCharNeed.trim() || undefined,
      moralCompass: editCharMoralCompass.trim() || undefined,
      flaws: lines(editCharFlaws).slice(0, 60),
      blindSpots: lines(editCharBlindSpots).slice(0, 60)
    };
    const parseMask = () => {
      const out: Array<{ context: string; persona: string }> = [];
      for (const ln of lines(editCharMaskLines)) {
        const i = ln.indexOf("=");
        if (i >= 0) {
          const context = ln.slice(0, i).trim();
          const persona = ln.slice(i + 1).trim();
          if (context || persona) out.push({ context, persona });
        } else {
          out.push({ context: "", persona: ln });
        }
      }
      return out;
    };
    const fingerprints = {
      linguisticStyle: lines(editCharLinguisticStyle).slice(0, 60),
      catchphrases: lines(editCharCatchphrases).slice(0, 60),
      mannerisms: lines(editCharMannerisms).slice(0, 60),
      mask: parseMask()
    };
    const parseRelations = () => {
      const out: Array<{
        targetName: string;
        types?: string[];
        emotionalPolarity?: string;
        conflictIndex?: string;
        sharedSecrets?: string[];
      }> = [];
      for (const ln of lines(editCharRelationsLines)) {
        const parts = ln.split("|");
        const targetName = String(parts[0] || "").trim();
        if (!targetName) continue;
        const maybeTypes = String(parts[1] || "").trim();
        const types =
          maybeTypes.startsWith("types=") || maybeTypes.startsWith("type=")
            ? maybeTypes
                .replace(/^types?=/, "")
                .split(/[,,、]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        const emotionalPolarity = String(parts[2] || "").trim();
        const conflictIndex = String(parts[3] || "").trim();
        const secretsRaw = String(parts[4] || "").trim();
        const sharedSecrets = secretsRaw
          ? secretsRaw
              .split(/[,,、]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        out.push({
          targetName,
          types: types.length ? types : undefined,
          emotionalPolarity: emotionalPolarity || undefined,
          conflictIndex: conflictIndex || undefined,
          sharedSecrets: sharedSecrets.length ? sharedSecrets : undefined
        });
      }
      return out;
    };
    const relationalHooks = {
      relations: parseRelations(),
      freeText: editCharRelationsFreeText.trim() || undefined
    };
    const locks = {
      tags: editCharLockTags || undefined,
      socialTags: editCharLockSocialTags || undefined,
      historicalDebts: editCharLockHistoricalDebts || undefined,
      occurredNotes: editCharLockOccurredNotes || undefined,
      narrativeDrives: editCharLockNarrativeDrives || undefined,
      fingerprints: editCharLockFingerprints || undefined,
      relationalHooks: editCharLockRelationalHooks || undefined
    };
    try {
      const { index } = await updateAuditCharacter(activeBook, {
        name,
        role: editCharRole.trim(),
        tags,
        state,
        locks,
        socialTags,
        historicalDebts,
        occurredNotes,
        narrativeDrives,
        fingerprints,
        relationalHooks,
        personalityAnalysis: editCharPersonality.trim()
      });
      setAuditCharactersIndex(index);
      setEditCharOpen(false);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  async function onAuditSelectedChapter() {
    if (!activeBook || !selectedChapter) return;
    if (!okModelConfigs.length) {
      setStatus("没有可用模型:请先在「设置」中配置模型并测试连接,连接成功后再分析。");
      return;
    }

    // 提醒:如果本章之前存在未分析章节,直接分析本章可能遗漏上下文
    try {
      const parseNo = (filename: string) => {
        const m = String(filename || "").match(/^(\d+)[_\.]/);
        const n = Math.floor(Number(m?.[1] || ""));
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const curNo = parseNo(selectedChapter.filename);
      if (curNo != null && chapters.length) {
        const prevMissing = chapters
          .map((c) => ({ fn: c.filename, no: parseNo(c.filename) }))
          .filter((x) => x.no != null && (x.no as number) < curNo && !auditedChapterFilenameSet.has(x.fn))
          .map((x) => x.no as number)
          .sort((a, b) => a - b);
        const uniq = [...new Set(prevMissing)].slice(0, 24);
        if (uniq.length) {
          const ok = await appConfirm({
            message: `提示:检测到本章之前仍有未分析章节:第 ${uniq.join("、")} 章。\n\n直接分析本章可能会出现内容遗漏。\n\n仍要继续分析本章吗?`
          });
          if (!ok) return;
        }
      }
    } catch {
      // ignore
    }

    if (auditRunningChapter && auditRunningChapter.bookSlug === activeBook && auditRunningChapter.filename !== selectedChapter.filename) {
      const runningMeta = chapters.find((x) => x.filename === auditRunningChapter.filename);
      const noFromName = Number(String(auditRunningChapter.filename).match(/^(\d+)/)?.[1] || "");
      const no = Number.isFinite(noFromName) && noFromName > 0 ? noFromName : runningMeta ? chapters.indexOf(runningMeta) + 1 : 0;
      setStatus(`当前第 ${no || "?"} 章正在分析中,请先回到该章节查看进度。`);
      return;
    }
    setAuditBusy(true);
    setStatus("");
    setAuditStreamPhase("running");
    setAuditProgress({ step: 1, total: 5, label: "准备输入(读取章节/角色/索引)" });
    const runningBookSlug = activeBook;
    const runningChapterFilename = selectedChapter.filename;
    setAuditRunningChapter({ bookSlug: runningBookSlug, filename: runningChapterFilename });
    resetAuditThinkingReveal();
    try {
      const debugKey = `${runningBookSlug}/${runningChapterFilename}/${Date.now()}`;
      // 先尽力同步一次(避免服务端没有最新配置)
      await putModelConfigs({ configs: modelConfigs as any, activeId: activeModelId ?? null }).catch(() => {});

      const res = await fetch(
        `${(import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177"}/api/books/${encodeURIComponent(
          runningBookSlug
        )}/chapters/${encodeURIComponent(selectedChapter.filename)}/audit/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelConfigId: activeModelId ?? null })
        }
      );
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        buf += chunkText;
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLines = chunk
            .split("\n")
            .map((l) => l.trimEnd())
            .filter((l) => l.startsWith("data:"));
          for (const line of dataLines) {
            const payloadText = line.replace(/^data:\s?/, "");
            let payload: any;
            try {
              payload = JSON.parse(payloadText);
            } catch {
              continue;
            }
            if (payload?.type === "error") {
              throw new Error(payload.message || "分析失败");
            }
            if (payload?.type === "modelPrompt") {
              const stage = String(payload.stage || "");
              const prompt = String(payload.prompt ?? "");
              const title = `[audit] 提问${stage ? `(${stage})` : ""} ${debugKey} len=${prompt.length}`;
              const preview = prompt.slice(0, 220);
              // Console 里更易查阅:折叠分组 + 预览 + 完整正文
              console.groupCollapsed(title);
              console.log("preview:", preview + (prompt.length > preview.length ? " ..." : ""));
              console.log("prompt:");
              console.log(prompt);
              console.groupEnd();
            }
            if (payload?.type === "phase") {
              const step = Math.max(1, Math.floor(Number(payload.step || 1)));
              const total = Math.max(step, Math.floor(Number(payload.total || 5)));
              const label = String(payload.label || "").trim() || "处理中...";
              setAuditProgress({ step, total, label });
            }
            if (payload?.type === "done") {
              if (payload.run) {
                auditDirtyIgnoreRef.current = clearAuditDirtyIgnoreEntry(
                  auditDirtyIgnoreRef.current,
                  runningBookSlug,
                  runningChapterFilename
                );
                setAuditRun(payload.run);
              }
                const reportText = String(payload?.run?.humanAuditReport ?? "");
                if (reportText.trim()) {
                  resetAuditThinkingReveal();
                  auditThinkingBufferRef.current = reportText;
                  auditDisplayedLenRef.current = reportText.length;
                  setAuditStreamText(reportText);
                }
              setAuditStreamPhase("done");
              await saveAuditAnalysis(runningBookSlug, {
                chapterFilename: runningChapterFilename,
                  text: reportText
              }).catch(() => {});
              await loadAuditArtifacts(runningBookSlug, runningChapterFilename);
              await refreshTimelineIndex(runningBookSlug);
              await loadGlobalArtifacts(runningBookSlug);
              setAuditRunningChapter(null);
              setAuditProgress(null);
            }
          }
        }
      }
    } catch (e: any) {
      setAuditStreamPhase("error");
      setStatus(e?.message || String(e));
      setAuditRunningChapter(null);
      setAuditProgress(null);
    } finally {
      setAuditBusy(false);
    }
  }

  async function onPolishSelectedChapter() {
    if (!activeBook || !selectedChapter) return;
    if (!okModelConfigs.length) {
      setStatus("没有可用模型:请先在「设置」中配置模型并测试连接,连接成功后再纠错。");
      return;
    }
    setPolishBusy(true);
    setStatus("");
    setPolishPhase("running");
    const original = chapterContentRef.current;
    setPolishDraft("");
    try {
      await putModelConfigs({ configs: modelConfigs as any, activeId: activeModelId ?? null }).catch(() => {});
      const res = await fetch(
        `${(import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177"}/api/books/${encodeURIComponent(
          activeBook
        )}/chapters/${encodeURIComponent(selectedChapter.filename)}/polish/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelConfigId: activeModelId ?? null, original })
        }
      );
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk
            .split("\n")
            .map((l) => l.trimEnd())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payloadText = line.replace(/^data:\s?/, "");
          try {
            const payload = JSON.parse(payloadText) as any;
            if (payload.type === "delta") {
              const d = String(payload.textDelta ?? "");
              if (d) setPolishDraft((prev) => prev + d);
            }
            if (payload.type === "done") {
              const t = String(payload.text ?? "");
              if (t.trim()) setPolishDraft(t);
              setPolishPhase("done");
            }
            if (payload.type === "error") {
              throw new Error(String(payload.message || "纠错失败"));
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }
      setPolishPhase((p) => (p === "done" ? "done" : "done"));
    } catch (e: any) {
      setPolishPhase("error");
      setStatus(e?.message || String(e));
    } finally {
      setPolishBusy(false);
    }
  }

  async function onMobileLayoutChapter() {
    if (!activeBook || !selectedChapter) return;
    if (!okModelConfigs.length) {
      setStatus("没有可用模型：请先在「设置」中配置模型并测试连接，连接成功后再使用 AI 排版。");
      return;
    }
    setMobileLayoutBusy(true);
    setStatus("");
    const original = chapterContent;
    setMobileLayoutOriginal(original);
    setMobileLayoutDraft("");
    try {
      await putModelConfigs({ configs: modelConfigs as any, activeId: activeModelId ?? null }).catch(() => {});
      await consumeChapterSseStream(
        chapterStreamUrl(activeBook, selectedChapter.filename, "mobile-layout"),
        { modelConfigId: activeModelId ?? null, original },
        {
          onDelta: (d) => setMobileLayoutDraft((prev) => prev + d),
          onDone: (t) => setMobileLayoutDraft(stripAiPlainTextOutput(t))
        }
      );
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setMobileLayoutBusy(false);
    }
  }

  function applyMobileLayoutToChapter(text: string) {
    setChapterContent(text);
    setMobileLayoutDraft("");
    setMobileLayoutOriginal("");
    setStatus("已应用 AI 排版到正文");
  }

  async function onExpandWithTargetWords(targetWords: number, extraContext: string) {
    if (!activeBook || !selectedChapter) return;
    if (!okModelConfigs.length) {
      setStatus("没有可用模型:请先在「设置」中配置模型并测试连接,连接成功后再调整。");
      return;
    }
    setExpandBusy(true);
    setStatus("");
    setExpandDraft("");
    try {
      await putModelConfigs({ configs: modelConfigs as any, activeId: activeModelId ?? null }).catch(() => {});
      const res = await fetch(
        `${(import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177"}/api/books/${encodeURIComponent(
          activeBook
        )}/chapters/${encodeURIComponent(selectedChapter.filename)}/expand/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelConfigId: activeModelId ?? null,
            original: chapterContent,
            targetWords,
            extraContext
          })
        }
      );
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk
            .split("\n")
            .map((l) => l.trimEnd())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payloadText = line.replace(/^data:\s?/, "");
          try {
            const payload = JSON.parse(payloadText) as any;
            if (payload.type === "delta") {
              const d = String(payload.textDelta ?? "");
              if (d) setExpandDraft((prev) => prev + d);
            }
            if (payload.type === "done") {
              const t = String(payload.text ?? "");
              if (t.trim()) setExpandDraft(t);
            }
            if (payload.type === "error") {
              throw new Error(String(payload.message || "调整失败"));
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setExpandBusy(false);
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

  async function openChapterTitleSuggestModal() {
    if (!activeBook || !selectedChapter) return;
    setChapterTitleSuggestOpen(true);
    setChapterTitleSuggestBusy(true);
    setChapterTitleSuggestErr("");
    setChapterTitleSuggestList([]);
    setChapterTitleSuggestByStyle({});
    setChapterTitleSuggestPicked("");
    try {
      await flushChapterSave();
      const { results } = await suggestChapterTitlesBatch(activeBook, selectedChapter.filename, {
        modelConfigId: activeModelId ?? null,
        count: 5
      });
      const map: Record<string, string[]> = {};
      for (const r of results || []) {
        const style = String((r as any)?.style || "").trim();
        const titles = Array.isArray((r as any)?.titles) ? (r as any).titles : [];
        const uniq = [...new Set(titles.map((t: any) => String(t || "").trim()).filter(Boolean))].slice(0, 8) as string[];
        if (style && uniq.length) map[style] = uniq;
      }
      setChapterTitleSuggestByStyle(map);
      const firstStyle =
        (["boom", "suspense", "hotblood", "funny", "poetic", "minimal", "normal"] as const).find((s) => map[s]?.length) ||
        Object.keys(map)[0] ||
        "boom";
      setChapterTitleSuggestStyle(firstStyle as any);
      const list = map[firstStyle] || [];
      setChapterTitleSuggestList(list);
      setChapterTitleSuggestPicked(list[0] || "");
      if (!Object.keys(map).length) setChapterTitleSuggestErr("没有生成到可用的标题候选。");
    } catch (e: any) {
      setChapterTitleSuggestErr(e?.message || String(e));
    } finally {
      setChapterTitleSuggestBusy(false);
    }
  }

  async function applySuggestedChapterTitle() {
    if (!activeBook || !selectedChapter) return;
    const picked = chapterTitleSuggestPicked.trim();
    if (!picked) return;
    setBusy(true);
    setStatus("");
    try {
      await flushChapterSave();
      const { chapter } = await renameChapter(activeBook, selectedChapter.filename, picked);
      await refreshChapters(activeBook);
      setSelectedChapter({ bookSlug: activeBook, filename: chapter.filename });
      const { content } = await readChapter(activeBook, chapter.filename);
      setChapterContent(content);
      chapterBaselineRef.current = content;
      setChapterRenameDraft(chapter.title);
      setChapterTitleSuggestOpen(false);
      setStatus("已应用章节标题。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openSearchHit(hit: BookSearchHit) {
    if (!activeBook) return;
    try {
      if (hit.kind === "chapters") {
        const filename = String(hit.path || "").replace(/^chapters\//, "");
        const meta = chapters.find((c) => c.filename === filename);
        if (meta) {
          await onOpenChapter(meta);
          const q = String(searchQ || "").trim();
          // 等待 React 把章节内容渲染进 textarea 后再设置选区高亮
          window.setTimeout(() => highlightChapterHit(hit.lineNo, q), 0);
        } else {
          setStatus("未找到对应章节。");
        }
        setSearchOpen(false);
        return;
      }
      // 仅搜索章节正文:不会再出现 story 命中
      // audit:V1 先不做精确跳转,至少提示路径
      setStatus(`审计产物命中:${hit.path}`);
      setSearchOpen(false);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
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
      // 直接打开新建的卡片
      const f: StoryFile = { kind: "character", path: character.relPath, title: name, role: modalCharacterRole, tags };
      await onOpenCard(f);
      setStatus("已创建角色卡文件。");
    } catch (e: any) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openModelConfigEditor(id: string) {
    const cfg = modelConfigs.find((c) => c.id === id);
    if (!cfg) return;
    setModelConfigEditorId(id);
    setModelEditorDraft({ ...cfg });
    setModelTestStatus("");
  }

  function saveModelConfigDraft() {
    if (!modelEditorDraft) return;
    setModelState((prev) => ({
      ...prev,
      configs: prev.configs.map((c) => (c.id === modelEditorDraft.id ? modelEditorDraft : c))
    }));
    setStatus("已保存模型设置。");
  }

  async function testModelConfigDraft() {
    if (!modelEditorDraft) return;
    const cfg = modelEditorDraft;
    if (!cfg.testUrl.trim()) {
      setModelTestStatus("请先填写测试地址。");
      return;
    }
    setModelTestStatus("测试中...");
    try {
      const headers: Record<string, string> = {};
      if (cfg.provider === "openai" || cfg.provider === "deepseek" || cfg.provider === "qwen") {
        if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
      }
      if (cfg.provider === "gemini") {
        // gemini 常用 key=...;这里不强绑,若用户已把 key 写进 url 则不追加
        if (cfg.apiKey.trim() && !cfg.testUrl.includes("key=")) {
          const u = new URL(cfg.testUrl);
          u.searchParams.set("key", cfg.apiKey.trim());
          const next = u.toString();
          setModelEditorDraft({ ...cfg, testUrl: next });
          cfg.testUrl = next;
        }
      }
      if (cfg.extraHeadersJson?.trim()) {
        try {
          const extra = JSON.parse(cfg.extraHeadersJson) as Record<string, string>;
          for (const [k, v] of Object.entries(extra)) headers[k] = String(v);
        } catch {
          setModelTestStatus("extraHeadersJson 不是合法 JSON。");
          return;
        }
      }
      const res = await fetch(cfg.testUrl, { method: "GET", headers });
      const text = await res.text().catch(() => "");
      let suffix = text ? ` · ${text.slice(0, 120)}` : "";
      let lastModels: string[] | undefined = undefined;
      if (cfg.provider === "ollama" || cfg.testUrl.includes("/api/tags")) {
        try {
          const j = JSON.parse(text) as any;
          const names: string[] = Array.isArray(j?.models)
            ? j.models.map((m: any) => String(m?.name || m?.model || "")).filter(Boolean)
            : [];
          if (names.length) {
            const preview = names.slice(0, 6).join("、");
            suffix = ` · 共 ${names.length} 个模型:${preview}${names.length > 6 ? "..." : ""}`;
          }
          // 存一份供"当前模型选择器"使用
          setModelEditorDraft((prev) => (prev ? { ...prev, lastModels: names } : prev));
          lastModels = names;
        } catch {
          // ignore
        }
      }
      const ok = res.status >= 200 && res.status < 300;
      setModelEditorDraft((prev) => (prev ? { ...prev, lastTestOk: ok } : prev));
      setModelState((prev) => ({
        ...prev,
        configs: prev.configs.map((c) =>
          c.id === cfg.id ? { ...c, lastTestOk: ok, lastModels: lastModels ?? c.lastModels } : c
        )
      }));
      setModelTestStatus(`HTTP ${res.status}${suffix}`);
    } catch (e: any) {
      setModelTestStatus(e?.message || String(e));
    }
  }

  return (
    <div className="app">
      <TopBar
        busy={busy}
        themeId={themeId}
        onThemeChange={setThemeId}
        fullscreenOn={fullscreenOn}
        onGoHome={goNavHome}
        onFullscreenError={setStatus}
        onOpenSettings={() => void goSettings("models")}
        navCollapsed={navCollapsed}
        onToggleNav={() => setNavCollapsed((v) => !v)}
        rightCollapsed={rightCollapsed}
        onToggleRight={() => setRightCollapsed((v) => !v)}
      />

      <OutlineBookProvider bookId={activeBook || null} refreshToken={outlineRefreshKey}>
      <div
        className={`layout3 ${navCollapsed ? "layout3NavCollapsed" : ""} ${rightCollapsed ? "layout3RightCollapsed" : ""}`}
        style={
          {
            ["--layout3-nav" as any]: navCollapsed ? "0px" : `${layout3NavW}px`,
            ["--layout3-right" as any]: rightCollapsed ? "0px" : `${layout3RightW}px`
          } as React.CSSProperties
        }
      >
        <aside className="nav">
          {navCollapsed ? null : (
            <div className="navSection navSectionMain">
              {navHome ? (
                <>
                  <BookShelfTabs tab={shelfTab} onChange={setShelfTab} disabled={busy} />
                  {shelfTab === "books" ? (
                    <BookShelfNav
                      books={books}
                      displayedBooks={displayedBooks}
                      busy={busy}
                      bookShelfSortDesc={bookShelfSortDesc}
                      onToggleSort={() => setBookShelfSortDesc((v) => !v)}
                      onCreateBook={() => openCreateBookModal()}
                      onOpenBook={(b) => void openBookFromShelf(b)}
                    />
                  ) : (
                    <BookPlanningNav
                      plans={bookSetupPlans}
                      busy={busy}
                      hasModel={hasAiModel}
                      onRefresh={() => void refreshBookSetupPlans()}
                      onNewPlan={openNewBookPlan}
                      onContinue={continueBookPlan}
                      onSuggestTitle={(id) => void suggestPlanTitle(id)}
                      onDiscard={(id) => void discardBookPlan(id)}
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="navChapterHeader">
                    <button
                      type="button"
                      className="navTitle navTitleButton"
                      disabled={busy}
                      onClick={() => void goBookOverview()}
                      title="查看书籍概览"
                    >
                      {activeBookMeta?.title ?? activeBook}
                    </button>
                    {sortedActiveMissingChapterIndexes.length > 0 && activeBookMeta ? (
                      <button
                        type="button"
                        className="navBookGapHint"
                        disabled={busy}
                        onClick={() => openShelfChapterGapModal(activeBookMeta)}
                        title="选择补齐空缺或接在最大序号之后新建"
                      >
                        空缺:{formatMissingChapterList(sortedActiveMissingChapterIndexes)} · 点此新建
                      </button>
                    ) : null}
                  </div>

                  <div className="browserTabsBar" role="tablist" aria-label="左侧页签">
                    <div className="browserTabsStrip tabsWrap">
                      <button
                        type="button"
                        role="tab"
                        className={`browserTab ${leftTab === "chapters" ? "active" : ""}`}
                        aria-selected={leftTab === "chapters"}
                        onClick={() => setLeftTab("chapters")}
                        disabled={busy}
                      >
                        章节目录
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={`browserTab ${leftTab === "outline" ? "active" : ""}`}
                        aria-selected={leftTab === "outline"}
                        onClick={() => setLeftTab("outline")}
                        disabled={busy}
                      >
                        大纲
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={`browserTab ${leftTab === "global" ? "active" : ""}`}
                        aria-selected={leftTab === "global"}
                        onClick={() => setLeftTab("global")}
                        disabled={busy}
                      >
                        全局信息
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={`browserTab ${leftTab === "progress" ? "active" : ""}`}
                        aria-selected={leftTab === "progress"}
                        onClick={() => setLeftTab("progress")}
                        disabled={busy}
                      >
                        进行中
                      </button>
                    <button
                      type="button"
                      role="tab"
                      className={`browserTab ${leftTab === "inspiration" ? "active" : ""}`}
                      aria-selected={leftTab === "inspiration"}
                      onClick={() => {
                        setLeftTab("inspiration");
                        if (activeBook) void loadInspiration(activeBook);
                      }}
                      disabled={busy}
                      title="灵感库:灵感生成与记录"
                    >
                      灵感库
                    </button>
                    {activeBook ? (
                      <button
                        type="button"
                        role="tab"
                        className={`browserTab ${leftTab === "notes" ? "active" : ""}`}
                        aria-selected={leftTab === "notes"}
                        onClick={() => {
                          setLeftTab("notes");
                          setNotesFocusRequest((n) => n + 1);
                        }}
                        disabled={busy}
                        title="作者随记备注"
                      >
                        备注
                      </button>
                    ) : null}
                    </div>
                  </div>

                  {leftTab === "chapters" ? (
                    <ChapterNav
                      chapters={chapters}
                      displayedChapters={displayedChapters}
                      selectedChapterFilename={selectedChapter?.filename ?? null}
                      busy={busy}
                      chapterSortDesc={chapterSortDesc}
                      chapterTitle={chapterTitle}
                      auditedChapterFilenames={auditedChapterFilenameSet}
                      auditChangedChapterFilenames={auditChapterStaleFilenames}
                      chaptersDraftOutOfSync={chaptersDraftOutOfSync}
                      onToggleSort={() => setChapterSortDesc((v) => !v)}
                      onChapterTitleChange={setChapterTitle}
                      onOpenChapter={(c) => void onOpenChapter(c)}
                      onCreateChapter={() => void onCreateChapter()}
                    />
                  ) : leftTab === "outline" && activeBook ? (
                    <OutlineWorkspace
                      slug={activeBook}
                      chapters={chapters}
                      busy={busy}
                      activeModelId={activeModelId}
                      bookSynopsis={activeBookMeta?.synopsis}
                      refreshToken={outlineRefreshKey}
                      outlineSubTab={outlineSubTab}
                      onOutlineSubTabChange={setOutlineSubTab}
                      selectedStageNodeId={selectedStageNodeId}
                      onSelectedStageNodeIdChange={setSelectedStageNodeId}
                      onOpenChapter={(c) => void onOpenChapter(c)}
                      onStatus={setStatus}
                    />
                  ) : leftTab === "notes" && activeBook ? (
                    <BookNotesPanel
                      bookId={activeBook}
                      busy={busy}
                      onStatus={setStatus}
                      focusRequest={notesFocusRequest}
                    />
                  ) : leftTab === "inspiration" ? (
                    <InspirationTab
                      busy={busy}
                      activeBook={activeBook}
                      activeModelId={activeModelId}
                      auditCharactersIndex={auditCharactersIndex}
                      inspirationTypeTab={inspirationTypeTab}
                      setInspirationTypeTab={setInspirationTypeTab}
                      inspirationFuncByType={inspirationFuncByType}
                      setInspirationFuncByType={setInspirationFuncByType}
                      inspirationFuncTab={inspirationFuncTab}
                      inspirationIndex={inspirationIndex}
                      inspirationBusy={inspirationBusy}
                      inspirationErr={inspirationErr}
                      inspirationFilter={inspirationFilter}
                      inspGenByType={inspGenByType}
                      setInspGenByType={setInspGenByType}
                      inspirationListExpanded={inspirationListExpanded}
                      setInspirationListExpanded={setInspirationListExpanded}
                      setInspirationBusy={setInspirationBusy}
                      setInspirationErr={setInspirationErr}
                      setInspirationIndex={setInspirationIndex}
                      setStatus={setStatus}
                    />

                  ) : (
                    <>
                      {leftTab === "progress" ? (
                        <div className="navGlobalScroll progressTab">
                          {(() => {
                            const idx = auditProgressIndex;
                            const items = Array.isArray(idx?.items) ? (idx.items as any[]) : [];
                            const activeItems = items.filter((it) => String(it?.status || "") !== "done");
                            const updatedAt = String(idx?.updatedAt || "").trim();
                            const src = idx?.lastSourceChapter;
                            const summary = String(idx?.summary || "").trim();
                            return (
                              <div className="progressWrap">
                                <div className="progressSummary">
                                  <div className="progressSummaryTitle">当前进度</div>
                                  <div className="muted progressSummaryMeta">
                                    {updatedAt ? `上次更新:${updatedAt}` : "尚无进度(请先完成一次章节分析)"}
                                    {src?.filename ? ` · 来源:${String(src.filename)}` : ""}
                                  </div>
                                  {summary ? <div className="progressSummaryText">{summary}</div> : null}
                                </div>

                                <div className="progressItemsScroll">
                                  {activeItems.length ? (
                                    <div className="progressList">
                                      {activeItems.slice(0, 60).map((it) => {
                                        const id = String(it?.id || "").trim();
                                        const title = String(it?.title || "").trim() || "未命名事项";
                                        const detail = String(it?.detail || "").trim();
                                        const rel = it?.related || {};
                                        const tags = [
                                          ...(Array.isArray(rel.characters) ? rel.characters.map((x: any) => `角色:${String(x)}`) : []),
                                          ...(Array.isArray(rel.places) ? rel.places.map((x: any) => `地点:${String(x)}`) : []),
                                          ...(Array.isArray(rel.orgs) ? rel.orgs.map((x: any) => `组织:${String(x)}`) : [])
                                        ].filter(Boolean);
                                        return (
                                          <div key={id || title} className="progressItem">
                                            <div className="progressItemTitle">{title}</div>
                                            {detail ? <div className="muted progressItemDetail">{detail}</div> : null}
                                            {tags.length ? <div className="muted progressItemTags">{tags.join(" · ")}</div> : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="muted auditPanelEmpty" style={{ padding: "10px 0" }}>
                                      暂无进行中事项。
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <GlobalInfoPanel
                          busy={busy}
                          activeBook={activeBook}
                          chapters={chapters}
                          currentChapterNo={
                            selectedChapterMeta && Number.isFinite(Number(selectedChapterMeta.id))
                              ? Number(selectedChapterMeta.id)
                              : null
                          }
                          globalTab={globalTab}
                          setGlobalTab={setGlobalTab}
                          auditCharactersIndex={auditCharactersIndex}
                          setAuditCharactersIndex={setAuditCharactersIndex}
                          auditPlacesIndex={auditPlacesIndex}
                          setAuditPlacesIndex={setAuditPlacesIndex}
                          auditForeshadowsIndex={auditForeshadowsIndex}
                          setAuditForeshadowsIndex={setAuditForeshadowsIndex}
                          timelineIndex={timelineIndex}
                          setTimelineIndex={setTimelineIndex}
                          timelineBusy={timelineBusy}
                          setTimelineBusy={setTimelineBusy}
                          relationsSearch={relationsSearch}
                          setRelationsSearch={setRelationsSearch}
                          relationsFocusChar={relationsFocusChar}
                          setRelationsFocusChar={setRelationsFocusChar}
                          relationsTypeFilter={relationsTypeFilter}
                          setRelationsTypeFilter={setRelationsTypeFilter}
                          relationsOnlyWithRelations={relationsOnlyWithRelations}
                          setRelationsOnlyWithRelations={setRelationsOnlyWithRelations}
                          onRelationsAddRequest={() => setRelationsAddRequestKey((k) => k + 1)}
                          auditCharactersSearch={auditCharactersSearch}
                          setAuditCharactersSearch={setAuditCharactersSearch}
                          expandedAuditCharIds={expandedAuditCharIds}
                          setExpandedAuditCharIds={setExpandedAuditCharIds}
                          foreshadowExpanded={foreshadowExpanded}
                          setForeshadowExpanded={setForeshadowExpanded}
                          memoryTab={memoryTab}
                          setMemoryTab={setMemoryTab}
                          memoryExpanded={memoryExpanded}
                          setMemoryExpanded={setMemoryExpanded}
                          memoryChaptersSortDesc={memoryChaptersSortDesc}
                          setMemoryChaptersSortDesc={setMemoryChaptersSortDesc}
                          memoryRangesSortDesc={memoryRangesSortDesc}
                          setMemoryRangesSortDesc={setMemoryRangesSortDesc}
                          timelineShowDoneEvents={timelineShowDoneEvents}
                          setTimelineShowDoneEvents={setTimelineShowDoneEvents}
                          timelineCompressStart={timelineCompressStart}
                          setTimelineCompressStart={setTimelineCompressStart}
                          timelineCompressEnd={timelineCompressEnd}
                          setTimelineCompressEnd={setTimelineCompressEnd}
                          setHiddenCharPanelOpen={setHiddenCharPanelOpen}
                          setHiddenPlacePanelOpen={setHiddenPlacePanelOpen}
                          setHiddenForeshadowPanelOpen={setHiddenForeshadowPanelOpen}
                          setForeshadowCreateOpen={setForeshadowCreateOpen}
                          setStatus={setStatus}
                          openEditCharacter={openEditCharacter}
                          openEditPlace={openEditPlace}
                          placeRevealTarget={placeRevealTarget}
                          onPlaceRevealHandled={() => setPlaceRevealTarget(null)}
                          openEditForeshadow={openEditForeshadow}
                          onCompressRangeWithMerge={(a, b) => void compressMemoryRangeWithMerge(a, b)}
                          onRefreshTimeline={() => activeBook && void refreshTimelineIndex(activeBook)}
                          onOpenChapter={(c) => void onOpenChapter(c)}
                        />
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

        </aside>

        <div
          className={`layoutDivider ${navCollapsed ? "hidden" : ""} ${layout3Dragging === "nav" ? "dragging" : ""}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左侧栏宽度"
          onMouseDown={(e) => {
            if (navCollapsed) return;
            e.preventDefault();
            layout3DragStartRef.current = { kind: "nav", x: e.clientX, navW: layout3NavW, rightW: layout3RightW };
            setLayout3Dragging("nav");
          }}
        />

        <main className="center">
          <div className="centerTop">
            <div className="centerTitleBlock">
              <div className="centerTitleRow">
                {!activeBook ? (
                  <>
                    <div className="centerTitle">
                      {homeCenterTab === "settings" ? "设置" : "请从书架打开一本书"}
                    </div>
                    <span className="titleAutosave autosaveHint" />
                  </>
                ) : showRelationsCenter ? (
                  <>
                    <div className="centerTitle">
                      《{activeBookMeta?.title ?? activeBook}》· 人物关系
                    </div>
                    <span className="titleAutosave autosaveHint" />
                  </>
                ) : showStageOutlineCenter ? (
                  <>
                    <StageOutlineCenterTop
                      selectedId={selectedStageNodeId}
                      busy={busy}
                      bookTitle={activeBookMeta?.title ?? activeBook}
                    />
                  </>
                ) : showBookOverview ? (
                  <>
                    <div className="centerTitle">
                      《{activeBookMeta?.title ?? activeBook}》· 书籍概览
                    </div>
                    <span className="titleAutosave autosaveHint" />
                  </>
                ) : !selectedChapterMeta ? (
                  <>
                    <div className="centerTitle">章节加载中...</div>
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
                    {chapterAutosaveHint ? (
                      <span
                        className={`titleAutosave autosaveHint ${
                          chapterAutosaveHint === "保存失败" ? "autosaveErr" : ""
                        }`}
                      >
                        {chapterAutosaveHint}
                      </span>
                    ) : null}
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
                        canRenameChapterFilename ? "双击修改标题(回车确认,Esc 取消)" : undefined
                      }
                    >
                      {selectedChapterMeta.id}
                    </div>
                    {canRenameChapterFilename ? (
                      <button
                        type="button"
                        disabled={busy || chapterTitleSuggestBusy}
                        onClick={() => void openChapterTitleSuggestModal()}
                        title="根据本章正文生成多个标题候选"
                      >
                        {chapterTitleSuggestBusy ? "生成中..." : "生成标题"}
                      </button>
                    ) : null}
                    {chapterAutosaveHint ? (
                      <span
                        className={`titleAutosave autosaveHint ${
                          chapterAutosaveHint === "保存失败" ? "autosaveErr" : ""
                        }`}
                      >
                        {chapterAutosaveHint}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
              {selectedChapterMeta && !showBookOverview && !canRenameChapterFilename ? (
                <div className="renameHint">当前文件名需在文件夹中手动改名。</div>
              ) : null}
            </div>
            {!activeBook && homeCenterTab === "settings" ? null : !activeBook ? (
              <div className="centerMeta muted">打开一本书后可查看书籍信息、简介与章节正文。</div>
            ) : showBookOverview && activeBookMeta ? (
              <div className="centerMeta centerMetaOverview">
                <span title={activeBookMeta.createdAt}>
                  创建时间:{formatBookCreatedAt(activeBookMeta.createdAt)}
                </span>
                <span className="centerMetaSep">·</span>
                <span>{activeBookMeta.status}</span>
                <span className="centerMetaSep">·</span>
                <span className="muted">ID {activeBookMeta.bookId.slice(0, 8)}…</span>
              </div>
            ) : (
              <div className="centerMeta">字数:{chapterWordCount}</div>
            )}
            {selectedChapter ? (
              <div className="centerReading">
                <button
                  type="button"
                  className="btnReadingNav"
                  disabled={busy || !adjacentChapters.prev}
                  onClick={() => adjacentChapters.prev && void onOpenChapter(adjacentChapters.prev)}
                  title={adjacentChapters.prev ? `上一章:${adjacentChapters.prev.id}` : "没有上一章"}
                >
                  上一章
                </button>
                <button
                  type="button"
                  className="btnReadingNav"
                  disabled={busy || !adjacentChapters.next}
                  onClick={() => adjacentChapters.next && void onOpenChapter(adjacentChapters.next)}
                  title={adjacentChapters.next ? `下一章:${adjacentChapters.next.id}` : "没有下一章"}
                >
                  下一章
                </button>
                <button
                  type="button"
                  className={`btnAuditRead ${mobileReading ? "active" : ""}`}
                  disabled={busy || polishModeOn || expandModeOn}
                  onClick={() => {
                    if (busy || polishModeOn || expandModeOn) return;
                    setMobileReading((v) => !v);
                  }}
                  title={mobileReading ? "退出移动端阅读预览" : "以手机尺寸预览本章"}
                >
                  {mobileReading ? "退出移动预览" : "移动端预览"}
                </button>
                <button
                  type="button"
                  className={`btnAuditRead ${polishModeOn ? "active" : ""}`}
                  disabled={busy || polishBusy}
                  onClick={() => {
                    if (busy) return;
                    setMobileReading(false);
                    setAuditReadModeOn(false);
                    setExpandModeOn(false);
                    setHistoryPaneOpen(false);
                    setPolishModeOn((v) => {
                      const next = !v;
                      if (next) {
                        setPolishDraft("");
                        setPolishPhase("idle");
                        void onPolishSelectedChapter();
                      }
                      return next;
                    });
                  }}
                  title={polishModeOn ? "退出纠错对照" : "AI 纠错本章错别字、标点与语法，并提供对照"}
                >
                  {polishBusy ? "纠错中..." : polishModeOn ? "退出纠错" : "纠错"}
                </button>
                <button
                  type="button"
                  className={`btnAuditRead ${expandModalOpen ? "active" : ""}`}
                  disabled={busy || expandBusy}
                  onClick={() => {
                    if (busy || !selectedChapter) return;
                    setExpandTargetWords(String(Math.max(200, chapterWordCount)));
                    setExpandExtraContext("");
                    setExpandDraft("");
                    setExpandModalOpen(true);
                  }}
                  title="调整本章:设置预计字数,可增写、压缩或优化草率段落"
                >
                  {expandBusy ? "调整中..." : "调整"}
                </button>
                <button
                  type="button"
                  className={`btnAuditRead ${auditReadModeOn ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => setAuditReadModeOn((v) => !v)}
                  title={auditReadModeOn ? "退出审计阅读模式" : "进入审计阅读模式(高亮内容整理关联)"}
                >
                  {auditReadModeOn ? "退出审计" : "审计"}
                </button>
                <button
                  type="button"
                  className="btnAuditRead"
                  disabled={busy || chapterSaveDraftBusy}
                  onClick={() => setChapterSaveDraftModalOpen(true)}
                  title="将当前正文保存为历史存稿 (⌘⇧S / Ctrl+Shift+S)"
                >
                  {currentChapterDraftOutOfSync ? "存稿*" : "存稿"}
                </button>
                <button
                  type="button"
                  className={`btnAuditRead ${historyPaneOpen ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => toggleHistoryPane()}
                  title="在编辑区右侧查看历史存稿与对比 (⌘⇧H / Ctrl+Shift+H)"
                >
                  {historyPaneOpen ? "收起历史" : "历史版本"}
                </button>
                {/* 移动端预览固定 iPhone 14 尺寸,不再提供机型切换 */}
              </div>
            ) : null}
          </div>
          {!activeBook ? (
            homeCenterTab === "settings" ? (
              <SettingsPage
                tab={settingsTab}
                onTabChange={setSettingsTab}
                modelsPanel={
                  <SettingsModelsPanel
                    busy={busy}
                    modelConfigs={modelConfigs}
                    activeModelId={activeModelId}
                    modelConfigEditorId={modelConfigEditorId}
                    modelEditorDraft={modelEditorDraft}
                    modelTestStatus={modelTestStatus}
                    setModelConfigEditorId={setModelConfigEditorId}
                    setModelEditorDraft={setModelEditorDraft}
                    setModelTestStatus={setModelTestStatus}
                    setModelState={setModelState}
                    openModelConfigEditor={openModelConfigEditor}
                    testModelConfigDraft={() => void testModelConfigDraft()}
                    saveModelConfigDraft={saveModelConfigDraft}
                    setStatus={setStatus}
                  />
                }
                dataDirPanel={
                  <SettingsDataDirPanel
                    busy={busy}
                    onDataDirChanged={async () => {
                      await refreshBooks();
                      setActiveBook("");
                      setSelectedChapter(null);
                      setSelectedCard(null);
                      setChapters([]);
                      setStoryFiles([]);
                      setCharFiles([]);
                    }}
                  />
                }
                shortcutsPanel={<SettingsShortcutsPanel />}
              />
            ) : (
              <div className="empty centerBodyHint">从左侧书架选择一本书开始。</div>
            )
          ) : showRelationsCenter ? (
            <RelationsCenter
              busy={busy}
              activeBook={activeBook}
              auditCharactersIndex={auditCharactersIndex}
              setAuditCharactersIndex={setAuditCharactersIndex}
              focusChar={relationsFocusChar}
              setFocusChar={setRelationsFocusChar}
              onStatus={setStatus}
              addRequestKey={relationsAddRequestKey}
              onAddRequestConsumed={() => setRelationsAddRequestKey(0)}
            />
          ) : showStageOutlineCenter ? (
            <StageOutlineCenterBody
              selectedId={selectedStageNodeId}
              busy={busy}
              onClearSelection={() => setSelectedStageNodeId(null)}
            />
          ) : showBookOverview ? (
            <div className="centerBookStats">
              <StatsPanel
                busy={busy}
                activeBook={activeBook}
                chapters={chapters}
                statsRefreshKey={statsRefreshKey}
                onSetStatus={setStatus}
              />
            </div>
          ) : (
            <ChapterEditorPanel
              mobileReading={mobileReading}
              mobileViewport={mobileViewport}
              historyPaneOpen={historyPaneOpen}
              historyPane={
                selectedChapter ? (
                  <ChapterHistoryPane
                    versions={chapterVersions}
                    selectedVersionId={selectedHistoryVersionId}
                    versionContentCache={versionContentCache}
                    currentChapterContent={chapterContent}
                    busy={busy}
                    onClose={closeHistoryPane}
                  />
                ) : null
              }
              busy={busy}
              selectedChapter={selectedChapter}
              chapterContent={chapterContent}
              setChapterContent={setChapterContent}
              chapterTextareaRef={chapterTextareaRef}
              expandModeOn={expandModeOn}
              setExpandModeOn={setExpandModeOn}
              expandBusy={expandBusy}
              expandDraft={expandDraft}
              setExpandDraft={setExpandDraft}
              setExpandModalOpen={setExpandModalOpen}
              polishModeOn={polishModeOn}
              setPolishModeOn={setPolishModeOn}
              polishBusy={polishBusy}
              polishDraft={polishDraft}
              setPolishPhase={setPolishPhase}
              setPolishDraft={setPolishDraft}
              onPolishSelectedChapter={() => void onPolishSelectedChapter()}
              okModelCount={okModelConfigs.length}
              auditReadModeOn={auditReadModeOn}
              auditReaderRootRef={auditReaderRootRef}
              auditHover={auditHover}
              setAuditHover={setAuditHover}
              auditCharactersIndex={auditCharactersIndex}
              auditPlacesIndex={auditPlacesIndex}
              auditOrgsIndex={auditOrgsIndex}
              timelineIndex={timelineIndex}
              storyFiles={storyFiles}
              onJumpToOrganize={jumpToOrganize}
              mobileLayout={
                activeBook && selectedChapter
                  ? {
                      busy: mobileLayoutBusy,
                      draft: mobileLayoutDraft,
                      original: mobileLayoutOriginal,
                      onRun: onMobileLayoutChapter
                    }
                  : null
              }
              onApplyMobileLayout={applyMobileLayoutToChapter}
            />

          )}
          {status ? <div className="status">{status}</div> : null}
        </main>

        <div
          className={`layoutDivider ${rightCollapsed ? "hidden" : ""} ${layout3Dragging === "right" ? "dragging" : ""}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整右侧栏宽度"
          onMouseDown={(e) => {
            if (rightCollapsed) return;
            e.preventDefault();
            layout3DragStartRef.current = { kind: "right", x: e.clientX, navW: layout3NavW, rightW: layout3RightW };
            setLayout3Dragging("right");
          }}
        />

        {!rightCollapsed && showBookOverview ? (
          <BookSynopsisPanel
            busy={busy}
            activeBook={activeBook}
            activeBookMeta={activeBookMeta}
            synopsisDraft={synopsisDraft}
            setSynopsisDraft={setSynopsisDraft}
            bookOverviewAutosaveHint={bookOverviewAutosaveHint}
            onToggleCompleted={async () => {
              if (!activeBook) return;
              try {
                const { book } = await patchBookCompleted(
                  activeBook,
                  !Boolean(activeBookMeta?.completed)
                );
                setBooks((prev) => prev.map((b) => (b.bookId === activeBook ? book : b)));
                setStatus(book.completed ? "已标记为已完结。" : "已取消完结标记。");
              } catch (e: any) {
                setStatus(e?.message || String(e));
              }
            }}
            onDeleteBook={() => activeBookMeta && openDeleteBookModal(activeBookMeta)}
            onClearAudit={openClearBookAuditModal}
            onOpenPlanning={openPlanningFromBook}
          />
        ) : !rightCollapsed ? (
        <RightPanel
          busy={busy}
          activeBook={activeBook}
          selectedChapter={selectedChapter}
          rightTab={rightTab}
          setRightTab={setRightTab}
          okModelConfigs={okModelConfigs}
          activeModelId={activeModelId}
          activeModelLabel={activeModelLabel}
          auditModelPickerOpen={auditModelPickerOpen}
          setAuditModelPickerOpen={setAuditModelPickerOpen}
          auditModelSearch={auditModelSearch}
          setAuditModelSearch={setAuditModelSearch}
          okModelGroupsFiltered={okModelGroupsFiltered}
          setModelState={setModelState}
          onGoModelConfigList={() => void goSettings("models")}
          writingPack={writingPack}
          writingPackBusy={writingPackBusy}
          writingPackErr={writingPackErr}
          writingPackListsOpen={writingPackListsOpen}
          setWritingPackListsOpen={setWritingPackListsOpen}
          onGenerateWritingPack={(slug, fn) => void doGenerateWritingPack(slug, fn)}
          setStatus={setStatus}
          auditDirty={auditDirty}
          auditDirtyDelta={auditDirtyDelta}
          onIgnoreAuditStale={onIgnoreAuditStale}
          auditBusy={auditBusy}
          auditRun={auditRun}
          onAuditSelectedChapter={() => void onAuditSelectedChapter()}
          auditStreamPhase={auditStreamPhase}
          auditStreamText={auditStreamText}
          auditStreamRef={auditStreamRef}
          auditRunningChapter={auditRunningChapter}
          auditProgress={auditProgress}
          onJumpToRunningAuditChapter={() => void jumpToRunningAuditChapter()}
          onJumpToOrganize={jumpToOrganize}
          historyPaneOpen={historyPaneOpen}
          chapterVersions={chapterVersions}
          selectedHistoryVersionId={selectedHistoryVersionId}
          versionContentCache={versionContentCache}
          currentChapterContent={chapterContent}
          onSelectHistoryVersion={(id) => void onSelectHistoryVersion(id)}
          onRestoreHistoryVersion={(id) => void onRestoreChapterVersion(id)}
        />
        ) : null}
      </div>
      </OutlineBookProvider>

      <ClearBookAuditModal
        open={clearBookAuditModalOpen}
        busy={busy}
        bookTitle={activeBookMeta?.title ?? activeBook}
        confirmDraft={clearBookAuditConfirmDraft}
        onConfirmDraftChange={setClearBookAuditConfirmDraft}
        onClose={closeClearBookAuditModal}
        onConfirm={() => void confirmClearBookAudit()}
      />

      <ChapterSaveDraftModal
        open={chapterSaveDraftModalOpen}
        busy={chapterSaveDraftBusy}
        onClose={() => {
          if (!chapterSaveDraftBusy) setChapterSaveDraftModalOpen(false);
        }}
        onConfirm={(label) => confirmChapterSaveDraft(label)}
      />

      <AppModals
        books={books}
        setBooks={setBooks}
        activeBook={activeBook}
        setActiveBook={setActiveBook}
        chapters={chapters}
        setChapters={setChapters}
        selectedChapter={selectedChapter}
        setSelectedChapter={setSelectedChapter}
        createBookModalOpen={createBookModalOpen}
        setCreateBookModalOpen={setCreateBookModalOpen}
        chapterGapModalOpen={chapterGapModalOpen}
        setChapterGapModalOpen={setChapterGapModalOpen}
        chapterGapModalBookSlug={chapterGapModalBookSlug}
        setChapterGapModalBookSlug={setChapterGapModalBookSlug}
        chapterGapModalIndexes={chapterGapModalIndexes}
        setChapterGapModalIndexes={setChapterGapModalIndexes}
        chapterGapModalDraftTitle={chapterGapModalDraftTitle}
        setChapterGapModalDraftTitle={setChapterGapModalDraftTitle}
        modalNewTitle={modalNewTitle}
        setModalNewTitle={setModalNewTitle}
        modalNewSynopsis={modalNewSynopsis}
        setModalNewSynopsis={setModalNewSynopsis}
        deleteBookModalOpen={deleteBookModalOpen}
        setDeleteBookModalOpen={setDeleteBookModalOpen}
        deleteBookTarget={deleteBookTarget}
        setDeleteBookTarget={setDeleteBookTarget}
        createCharacterModalOpen={createCharacterModalOpen}
        setCreateCharacterModalOpen={setCreateCharacterModalOpen}
        modalCharacterName={modalCharacterName}
        setModalCharacterName={setModalCharacterName}
        modalCharacterRole={modalCharacterRole}
        setModalCharacterRole={setModalCharacterRole}
        modalCharacterTags={modalCharacterTags}
        setModalCharacterTags={setModalCharacterTags}
        modalCharacterTagDraft={modalCharacterTagDraft}
        setModalCharacterTagDraft={setModalCharacterTagDraft}
        chapterContent={chapterContent}
        setChapterContent={setChapterContent}
        status={status}
        setStatus={setStatus}
        busy={busy}
        setBusy={setBusy}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchQ={searchQ}
        setSearchQ={setSearchQ}
        searchBusy={searchBusy}
        setSearchBusy={setSearchBusy}
        searchErr={searchErr}
        setSearchErr={setSearchErr}
        searchGroups={searchGroups}
        setSearchGroups={setSearchGroups}
        searchSort={searchSort}
        setSearchSort={setSearchSort}
        mergeFromEditOpen={mergeFromEditOpen}
        setMergeFromEditOpen={setMergeFromEditOpen}
        mergeFromEditSelected={mergeFromEditSelected}
        setMergeFromEditSelected={setMergeFromEditSelected}
        mergeFromEditDraft={mergeFromEditDraft}
        setMergeFromEditDraft={setMergeFromEditDraft}
        mergeFromEditDraftText={mergeFromEditDraftText}
        setMergeFromEditDraftText={setMergeFromEditDraftText}
        mergeFromEditDraftBusy={mergeFromEditDraftBusy}
        setMergeFromEditDraftBusy={setMergeFromEditDraftBusy}
        mobileReading={mobileReading}
        setMobileReading={setMobileReading}
        auditReadModeOn={auditReadModeOn}
        setAuditReadModeOn={setAuditReadModeOn}
        polishModeOn={polishModeOn}
        setPolishModeOn={setPolishModeOn}
        expandModeOn={expandModeOn}
        setExpandModeOn={setExpandModeOn}
        chapterTitleSuggestOpen={chapterTitleSuggestOpen}
        setChapterTitleSuggestOpen={setChapterTitleSuggestOpen}
        chapterTitleSuggestBusy={chapterTitleSuggestBusy}
        setChapterTitleSuggestBusy={setChapterTitleSuggestBusy}
        chapterTitleSuggestErr={chapterTitleSuggestErr}
        setChapterTitleSuggestErr={setChapterTitleSuggestErr}
        chapterTitleSuggestList={chapterTitleSuggestList}
        setChapterTitleSuggestList={setChapterTitleSuggestList}
        chapterTitleSuggestByStyle={chapterTitleSuggestByStyle}
        setChapterTitleSuggestByStyle={setChapterTitleSuggestByStyle}
        chapterTitleSuggestPicked={chapterTitleSuggestPicked}
        setChapterTitleSuggestPicked={setChapterTitleSuggestPicked}
        chapterTitleSuggestStyle={chapterTitleSuggestStyle}
        setChapterTitleSuggestStyle={setChapterTitleSuggestStyle}
        auditCharactersIndex={auditCharactersIndex}
        setAuditCharactersIndex={setAuditCharactersIndex}
        auditPlacesIndex={auditPlacesIndex}
        setAuditPlacesIndex={setAuditPlacesIndex}
        auditOrgsIndex={auditOrgsIndex}
        setAuditOrgsIndex={setAuditOrgsIndex}
        auditForeshadowsIndex={auditForeshadowsIndex}
        setAuditForeshadowsIndex={setAuditForeshadowsIndex}
        foreshadowCreateOpen={foreshadowCreateOpen}
        setForeshadowCreateOpen={setForeshadowCreateOpen}
        foreshadowCreateTitle={foreshadowCreateTitle}
        setForeshadowCreateTitle={setForeshadowCreateTitle}
        foreshadowCreateStatus={foreshadowCreateStatus}
        setForeshadowCreateStatus={setForeshadowCreateStatus}
        editForeshadowOpen={editForeshadowOpen}
        setEditForeshadowOpen={setEditForeshadowOpen}
        editForeshadowId={editForeshadowId}
        setEditForeshadowId={setEditForeshadowId}
        editForeshadowTitle={editForeshadowTitle}
        setEditForeshadowTitle={setEditForeshadowTitle}
        editForeshadowStatus={editForeshadowStatus}
        setEditForeshadowStatus={setEditForeshadowStatus}
        editForeshadowLastProgress={editForeshadowLastProgress}
        setEditForeshadowLastProgress={setEditForeshadowLastProgress}
        editForeshadowNote={editForeshadowNote}
        setEditForeshadowNote={setEditForeshadowNote}
        editForeshadowChapters={editForeshadowChapters}
        setEditForeshadowChapters={setEditForeshadowChapters}
        hiddenForeshadowPanelOpen={hiddenForeshadowPanelOpen}
        setHiddenForeshadowPanelOpen={setHiddenForeshadowPanelOpen}
        hiddenOrgPanelOpen={hiddenOrgPanelOpen}
        setHiddenOrgPanelOpen={setHiddenOrgPanelOpen}
        editOrgOpen={editOrgOpen}
        setEditOrgOpen={setEditOrgOpen}
        editOrgName={editOrgName}
        setEditOrgName={setEditOrgName}
        editOrgDesc={editOrgDesc}
        setEditOrgDesc={setEditOrgDesc}
        editOrgLastNote={editOrgLastNote}
        setEditOrgLastNote={setEditOrgLastNote}
        hiddenPlacePanelOpen={hiddenPlacePanelOpen}
        setHiddenPlacePanelOpen={setHiddenPlacePanelOpen}
        editPlaceOpen={editPlaceOpen}
        setEditPlaceOpen={setEditPlaceOpen}
        editPlaceName={editPlaceName}
        setEditPlaceName={setEditPlaceName}
        editPlaceDesc={editPlaceDesc}
        setEditPlaceDesc={setEditPlaceDesc}
        editPlaceLastNote={editPlaceLastNote}
        setEditPlaceLastNote={setEditPlaceLastNote}
        mergePlaceOpen={mergePlaceOpen}
        setMergePlaceOpen={setMergePlaceOpen}
        mergePlaceSelected={mergePlaceSelected}
        setMergePlaceSelected={setMergePlaceSelected}
        mergePlaceDraft={mergePlaceDraft}
        setMergePlaceDraft={setMergePlaceDraft}
        mergePlaceDraftText={mergePlaceDraftText}
        setMergePlaceDraftText={setMergePlaceDraftText}
        mergePlaceDraftBusy={mergePlaceDraftBusy}
        setMergePlaceDraftBusy={setMergePlaceDraftBusy}
        hiddenCharPanelOpen={hiddenCharPanelOpen}
        setHiddenCharPanelOpen={setHiddenCharPanelOpen}
        editCharOpen={editCharOpen}
        setEditCharOpen={setEditCharOpen}
        editCharName={editCharName}
        setEditCharName={setEditCharName}
        editCharRole={editCharRole}
        setEditCharRole={setEditCharRole}
        editCharTags={editCharTags}
        setEditCharTags={setEditCharTags}
        editCharStateJson={editCharStateJson}
        setEditCharStateJson={setEditCharStateJson}
        editCharPersonality={editCharPersonality}
        setEditCharPersonality={setEditCharPersonality}
        editCharSocialProfession={editCharSocialProfession}
        setEditCharSocialProfession={setEditCharSocialProfession}
        editCharSocialClass={editCharSocialClass}
        setEditCharSocialClass={setEditCharSocialClass}
        editCharSocialTitles={editCharSocialTitles}
        setEditCharSocialTitles={setEditCharSocialTitles}
        editCharSocialOther={editCharSocialOther}
        setEditCharSocialOther={setEditCharSocialOther}
        editCharHistoricalDebts={editCharHistoricalDebts}
        setEditCharHistoricalDebts={setEditCharHistoricalDebts}
        editCharOccurredNotes={editCharOccurredNotes}
        setEditCharOccurredNotes={setEditCharOccurredNotes}
        editCharWant={editCharWant}
        setEditCharWant={setEditCharWant}
        editCharNeed={editCharNeed}
        setEditCharNeed={setEditCharNeed}
        editCharMoralCompass={editCharMoralCompass}
        setEditCharMoralCompass={setEditCharMoralCompass}
        editCharFlaws={editCharFlaws}
        setEditCharFlaws={setEditCharFlaws}
        editCharBlindSpots={editCharBlindSpots}
        setEditCharBlindSpots={setEditCharBlindSpots}
        editCharLinguisticStyle={editCharLinguisticStyle}
        setEditCharLinguisticStyle={setEditCharLinguisticStyle}
        editCharCatchphrases={editCharCatchphrases}
        setEditCharCatchphrases={setEditCharCatchphrases}
        editCharMannerisms={editCharMannerisms}
        setEditCharMannerisms={setEditCharMannerisms}
        editCharMaskLines={editCharMaskLines}
        setEditCharMaskLines={setEditCharMaskLines}
        editCharRelationsLines={editCharRelationsLines}
        setEditCharRelationsLines={setEditCharRelationsLines}
        editCharRelationsFreeText={editCharRelationsFreeText}
        setEditCharRelationsFreeText={setEditCharRelationsFreeText}
        editCharLockTags={editCharLockTags}
        setEditCharLockTags={setEditCharLockTags}
        editCharLockSocialTags={editCharLockSocialTags}
        setEditCharLockSocialTags={setEditCharLockSocialTags}
        editCharLockHistoricalDebts={editCharLockHistoricalDebts}
        setEditCharLockHistoricalDebts={setEditCharLockHistoricalDebts}
        editCharLockOccurredNotes={editCharLockOccurredNotes}
        setEditCharLockOccurredNotes={setEditCharLockOccurredNotes}
        editCharLockNarrativeDrives={editCharLockNarrativeDrives}
        setEditCharLockNarrativeDrives={setEditCharLockNarrativeDrives}
        editCharLockFingerprints={editCharLockFingerprints}
        setEditCharLockFingerprints={setEditCharLockFingerprints}
        editCharLockRelationalHooks={editCharLockRelationalHooks}
        setEditCharLockRelationalHooks={setEditCharLockRelationalHooks}
        expandModalOpen={expandModalOpen}
        setExpandModalOpen={setExpandModalOpen}
        expandTargetWords={expandTargetWords}
        setExpandTargetWords={setExpandTargetWords}
        expandExtraContext={expandExtraContext}
        setExpandExtraContext={setExpandExtraContext}
        expandBusy={expandBusy}
        setExpandBusy={setExpandBusy}
        expandDraft={expandDraft}
        setExpandDraft={setExpandDraft}
        searchInputRef={searchInputRef}
        searchPickBookFirstBtnRef={searchPickBookFirstBtnRef}
        chapterGapTitleInputRef={chapterGapTitleInputRef}
        createBookTitleInputRef={createBookTitleInputRef}
        CHARACTER_TAG_OPTIONS={CHARACTER_TAG_OPTIONS}
        applySuggestedChapterTitle={applySuggestedChapterTitle}
        closeChapterGapModal={closeChapterGapModal}
        closeDeleteBookModal={closeDeleteBookModal}
        confirmChapterGapFill={confirmChapterGapFill}
        confirmChapterGapSkip={confirmChapterGapSkip}
        confirmDeleteBook={confirmDeleteBook}
        onCreateCharacter={onCreateCharacter}
        onExpandWithTargetWords={onExpandWithTargetWords}
        openBookFromShelf={openBookFromShelf}
        openChapterTitleSuggestModal={openChapterTitleSuggestModal}
        openSearchHit={openSearchHit}
        runSearchNow={runSearchNow}
        scheduleSearch={scheduleSearch}
        submitCreateBookModal={submitCreateBookModal}
        submitCreateForeshadow={submitCreateForeshadow}
        submitEditCharacter={submitEditCharacter}
        submitEditForeshadow={submitEditForeshadow}
        submitEditOrg={submitEditOrg}
        submitEditPlace={submitEditPlace}
        activeModelId={activeModelId}
        selectedChapterMeta={selectedChapterMeta}
      />


      <BookSetupWizard
        open={bookSetupWizardOpen}
        loadSessionId={bookSetupSessionId}
        onSessionIdChange={setBookSetupSessionId}
        onPlanActivity={() => void refreshBookSetupPlans()}
        showDiscard={
          Boolean(
            bookSetupSessionId && bookSetupPlans.some((p) => p.sessionId === bookSetupSessionId)
          )
        }
        onDiscardPlan={() => {
          if (!bookSetupSessionId) {
            setBookSetupWizardOpen(false);
            return;
          }
          return discardBookPlan(bookSetupSessionId);
        }}
        onClose={() => {
          if (!busy) setBookSetupWizardOpen(false);
        }}
        onCreated={(book) => void handleBookSetupCreated(book)}
        busy={busy}
        setBusy={setBusy}
        activeModelId={activeModelId}
        onStatus={setStatus}
        onLinkedSync={() => void handleLinkedPlanningSync()}
      />

      {/* 合并入口已迁移到"编辑角色"弹窗中 */}
    </div>
  );
}

