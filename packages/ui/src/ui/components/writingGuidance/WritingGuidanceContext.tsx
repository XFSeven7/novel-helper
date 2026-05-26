import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { GuidanceSession } from "../../api";
import { appAlert, appConfirm } from "../../dialog/dialog";
import {
  previewAssistantText,
  sortGuidanceSessions,
  useWritingGuidance
} from "../../hooks/useWritingGuidance";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import {
  isChatNearBottom,
  scrollChatToBottom,
  scrollChatToBottomAfterPaint
} from "../../utils/chatScroll";

const BUILT_IN_NOTEBOOK_ID = "default";

export type WritingGuidanceContextValue = {
  bookId: string;
  guidance: ReturnType<typeof useWritingGuidance>;
  sortDesc: boolean;
  setSortDesc: React.Dispatch<React.SetStateAction<boolean>>;
  activeNotebookId: string;
  setActiveNotebookId: (id: string) => void;
  selectedSessionId: string | null;
  setSelectedSessionId: (id: string | null) => void;
  sessions: GuidanceSession[];
  selectedSession: GuidanceSession | null;
  disabled: boolean;
  composer: string;
  setComposer: React.Dispatch<React.SetStateAction<string>>;
  streaming: boolean;
  streamDraft: string;
  handleNewSession: () => Promise<void>;
  handleSend: () => Promise<void>;
  handleNewNotebook: () => Promise<void>;
  handleDeleteNotebook: (nb: { id: string; name: string; builtIn?: boolean }) => Promise<void>;
  handleDeleteSession: (session: GuidanceSession) => Promise<void>;
  renamingId: string | null;
  setRenamingId: React.Dispatch<React.SetStateAction<string | null>>;
  renameDraft: string;
  setRenameDraft: React.Dispatch<React.SetStateAction<string>>;
  tabsEditMode: boolean;
  setTabsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  renamingSessionId: string | null;
  setRenamingSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  sessionRenameDraft: string;
  setSessionRenameDraft: React.Dispatch<React.SetStateAction<string>>;
  commitRenameNotebook: () => Promise<void>;
  commitRenameSession: () => Promise<void>;
  startRenameNotebook: (nb: { id: string; name: string }) => void;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  previewAssistantText: (session: GuidanceSession) => string;
  expandedSessionIds: Set<string>;
  toggleSessionExpanded: (sessionId: string) => void;
  applyExpandedToSessions: (sessionIds: string[], expand: boolean) => void;
  showStarredOnly: boolean;
  setShowStarredOnly: React.Dispatch<React.SetStateAction<boolean>>;
  revealAllTurnsSessionId: string | null;
  showHiddenInChat: boolean;
  setShowHiddenInChat: React.Dispatch<React.SetStateAction<boolean>>;
  hiddenBucketOpen: Set<string>;
  toggleHiddenBucket: (sessionId: string) => void;
  scrollToTurn: (turnId: string) => void;
  registerTurnAnchor: (turnId: string, el: HTMLElement | null) => void;
};

const WritingGuidanceCtx = createContext<WritingGuidanceContextValue | null>(null);

export function useWritingGuidanceContext() {
  const ctx = useContext(WritingGuidanceCtx);
  if (!ctx) throw new Error("WritingGuidanceProvider required");
  return ctx;
}

function WritingGuidanceProviderInner({
  bookId,
  busy,
  activeModelId,
  okModelCount,
  onStatus,
  children
}: {
  bookId: string;
  busy: boolean;
  activeModelId: string | null;
  okModelCount: number;
  onStatus?: (msg: string) => void;
  children: React.ReactNode;
}) {
  const guidance = useWritingGuidance(bookId);
  const [sortDesc, setSortDesc] = useLocalStorageState<boolean>({
    key: `novel-helper-writing-guidance-sort-${bookId}`,
    defaultValue: true,
    parse: (raw) => raw === "desc",
    serialize: (v) => (v ? "desc" : "asc")
  });
  const [activeNotebookId, setActiveNotebookId] = useLocalStorageState<string>({
    key: `novel-helper-writing-guidance-active-notebook-${bookId}`,
    defaultValue: BUILT_IN_NOTEBOOK_ID
  });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamDraft, setStreamDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [tabsEditMode, setTabsEditMode] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [sessionRenameDraft, setSessionRenameDraft] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const turnAnchorsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [expandedRaw, setExpandedRaw] = useLocalStorageState<string>({
    key: `novel-helper-writing-guidance-expanded-${bookId}`,
    defaultValue: "[]"
  });
  const expandedSessionIds = useMemo(() => {
    try {
      const arr = JSON.parse(expandedRaw) as unknown;
      return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
    } catch {
      return new Set<string>();
    }
  }, [expandedRaw]);
  const [showStarredOnly, setShowStarredOnly] = useLocalStorageState<boolean>({
    key: `novel-helper-writing-guidance-starred-only-${bookId}`,
    defaultValue: false,
    parse: (raw) => raw === "1",
    serialize: (v) => (v ? "1" : "0")
  });
  const [revealAllTurnsSessionId, setRevealAllTurnsSessionId] = useState<string | null>(null);
  const [showHiddenInChat, setShowHiddenInChat] = useState(false);
  const [hiddenBucketOpen, setHiddenBucketOpen] = useState<Set<string>>(new Set());

  const notebooks = guidance.index?.notebooks ?? [];

  useEffect(() => {
    if (!notebooks.length) return;
    if (!notebooks.some((n) => n.id === activeNotebookId)) {
      setActiveNotebookId(notebooks[0]!.id);
    }
  }, [notebooks, activeNotebookId, setActiveNotebookId]);

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId) ?? notebooks[0];

  const sessions = useMemo(() => {
    const list = (guidance.index?.sessions ?? []).filter((s) => s.notebookId === activeNotebook?.id);
    return sortGuidanceSessions(list, sortDesc);
  }, [guidance.index?.sessions, activeNotebook?.id, sortDesc]);

  const toggleSessionExpanded = useCallback(
    (sessionId: string) => {
      const next = new Set(expandedSessionIds);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      setExpandedRaw(JSON.stringify([...next]));
    },
    [expandedSessionIds, setExpandedRaw]
  );

  const applyExpandedToSessions = useCallback(
    (sessionIds: string[], expand: boolean) => {
      const next = new Set(expandedSessionIds);
      for (const id of sessionIds) {
        if (expand) next.add(id);
        else next.delete(id);
      }
      setExpandedRaw(JSON.stringify([...next]));
    },
    [expandedSessionIds, setExpandedRaw]
  );

  const toggleHiddenBucket = useCallback((sessionId: string) => {
    setHiddenBucketOpen((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  const registerTurnAnchor = useCallback((turnId: string, el: HTMLElement | null) => {
    if (el) turnAnchorsRef.current.set(turnId, el);
    else turnAnchorsRef.current.delete(turnId);
  }, []);

  const scrollToTurn = useCallback((turnId: string) => {
    turnAnchorsRef.current.get(turnId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const selectedSession = useMemo(
    () => (guidance.index?.sessions ?? []).find((s) => s.id === selectedSessionId) ?? null,
    [guidance.index?.sessions, selectedSessionId]
  );

  useEffect(() => {
    if (selectedSessionId && !sessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0]?.id ?? null);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (!showStarredOnly || !selectedSessionId) return;
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (session && !session.turns.some((t) => t.starred)) {
      const first = sessions.find((s) => s.turns.some((t) => t.starred));
      setSelectedSessionId(first?.id ?? null);
    }
  }, [showStarredOnly, selectedSessionId, sessions]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el || !isChatNearBottom(el)) return;
    scrollChatToBottom(el, "auto");
  }, [streamDraft]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el || !isChatNearBottom(el)) return;
    scrollChatToBottom(el, "auto");
  }, [selectedSession?.turns.length]);

  const disabled = busy || guidance.loading || streaming;

  const handleNewSession = useCallback(async () => {
    if (!activeNotebook) {
      onStatus?.("请先选择笔记本");
      return;
    }
    setShowStarredOnly(false);
    try {
      const { sessionId } = await guidance.addSession(activeNotebook.id);
      setSelectedSessionId(sessionId);
      const nextExpanded = new Set(expandedSessionIds);
      nextExpanded.add(sessionId);
      setExpandedRaw(JSON.stringify([...nextExpanded]));
      onStatus?.("已新建指导");
      queueMicrotask(() => composerRef.current?.focus());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      onStatus?.(msg || "新建指导失败");
    }
  }, [
    activeNotebook,
    guidance,
    expandedSessionIds,
    setExpandedRaw,
    setShowStarredOnly,
    onStatus
  ]);

  const handleSend = useCallback(async () => {
    const text = composer.trim();
    if (!text || streaming) return;
    if (okModelCount < 1) {
      onStatus?.("请先在设置中配置并测试通过至少一个模型");
      return;
    }
    let sessionId = selectedSessionId;
    try {
      if (!sessionId && activeNotebook) {
        const created = await guidance.addSession(activeNotebook.id);
        sessionId = created.sessionId;
        setSelectedSessionId(sessionId);
      }
      if (!sessionId) return;
      setRevealAllTurnsSessionId(sessionId);
      const nextExpanded = new Set(expandedSessionIds);
      nextExpanded.add(sessionId);
      setExpandedRaw(JSON.stringify([...nextExpanded]));
      setComposer("");
      setStreaming(true);
      setStreamDraft("");
      scrollChatToBottomAfterPaint(() => chatScrollRef.current, "auto");
      await guidance.chatStream(sessionId, text, activeModelId, {
        onDelta: (d) => setStreamDraft((s) => s + d)
      });
      onStatus?.("指导已生成");
    } catch {
      /* */
    } finally {
      setStreaming(false);
      setStreamDraft("");
    }
  }, [
    composer,
    streaming,
    okModelCount,
    selectedSessionId,
    activeNotebook,
    guidance,
    activeModelId,
    onStatus,
    expandedSessionIds,
    setExpandedRaw
  ]);

  const startRenameNotebook = (nb: { id: string; name: string }) => {
    setRenamingId(nb.id);
    setRenameDraft(nb.name);
  };

  const handleNewNotebook = async () => {
    setTabsEditMode(false);
    setShowStarredOnly(false);
    try {
      const idx = await guidance.addNotebook("新笔记本");
      const created = idx?.notebooks.find(
        (n) => !notebooks.some((prev) => prev.id === n.id)
      );
      const fallback = idx?.notebooks[idx.notebooks.length - 1];
      const nb = created ?? fallback;
      if (nb) {
        setActiveNotebookId(nb.id);
        startRenameNotebook(nb);
        onStatus?.("已新建笔记本");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      onStatus?.(msg || "新建笔记本失败");
    }
  };

  const handleDeleteNotebook = async (nb: { id: string; name: string; builtIn?: boolean }) => {
    if (nb.builtIn || nb.id === BUILT_IN_NOTEBOOK_ID) return;
    const count = (guidance.index?.sessions ?? []).filter((s) => s.notebookId === nb.id).length;
    if (count > 0) {
      await appAlert({
        message: `该笔记本下有 ${count} 条指导会话，请先删除或迁移后再删除笔记本。`
      });
      return;
    }
    if (!(await appConfirm({ message: `确定删除笔记本「${nb.name}」？`, variant: "danger" }))) return;
    try {
      await guidance.removeNotebook(nb.id);
      if (activeNotebookId === nb.id) setActiveNotebookId(BUILT_IN_NOTEBOOK_ID);
      onStatus?.("笔记本已删除");
    } catch {
      /* */
    }
  };

  const handleDeleteSession = async (session: GuidanceSession) => {
    if (!(await appConfirm({ message: `确定删除「${session.title}」？`, variant: "danger" }))) return;
    try {
      await guidance.removeSession(session.id);
      if (selectedSessionId === session.id) setSelectedSessionId(null);
      onStatus?.("已删除");
    } catch {
      /* */
    }
  };

  const commitRenameNotebook = async () => {
    if (!renamingId) return;
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name) return;
    try {
      await guidance.renameNotebook(renamingId, name);
    } catch {
      /* */
    }
  };

  const commitRenameSession = async () => {
    if (!renamingSessionId) return;
    const title = sessionRenameDraft.trim();
    setRenamingSessionId(null);
    if (!title) return;
    try {
      await guidance.patchSession(renamingSessionId, { title });
    } catch {
      /* */
    }
  };

  const value: WritingGuidanceContextValue = {
    bookId,
    guidance,
    sortDesc,
    setSortDesc,
    activeNotebookId,
    setActiveNotebookId,
    selectedSessionId,
    setSelectedSessionId,
    sessions,
    selectedSession,
    disabled,
    composer,
    setComposer,
    streaming,
    streamDraft,
    handleNewSession,
    handleSend,
    handleNewNotebook,
    handleDeleteNotebook,
    handleDeleteSession,
    renamingId,
    setRenamingId,
    renameDraft,
    setRenameDraft,
    tabsEditMode,
    setTabsEditMode,
    renamingSessionId,
    setRenamingSessionId,
    sessionRenameDraft,
    setSessionRenameDraft,
    commitRenameNotebook,
    commitRenameSession,
    startRenameNotebook,
    composerRef,
    chatScrollRef,
    previewAssistantText,
    expandedSessionIds,
    toggleSessionExpanded,
    applyExpandedToSessions,
    showStarredOnly,
    setShowStarredOnly,
    revealAllTurnsSessionId,
    showHiddenInChat,
    setShowHiddenInChat,
    hiddenBucketOpen,
    toggleHiddenBucket,
    scrollToTurn,
    registerTurnAnchor
  };

  return <WritingGuidanceCtx.Provider value={value}>{children}</WritingGuidanceCtx.Provider>;
}

/** 无 bookId 时仅透传子节点，避免重复 layout 包裹 */
export function WritingGuidanceProvider({
  bookId,
  inactive,
  children,
  ...props
}: {
  bookId: string;
  inactive?: boolean;
  busy: boolean;
  activeModelId: string | null;
  okModelCount: number;
  onStatus?: (msg: string) => void;
  children: React.ReactNode;
}) {
  if (inactive || !bookId) return <>{children}</>;
  return (
    <WritingGuidanceProviderInner bookId={bookId} {...props}>
      {children}
    </WritingGuidanceProviderInner>
  );
}
