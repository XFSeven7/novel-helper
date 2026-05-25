import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { GuidanceSession, WritingGuidanceIndex } from "../../api";
import { appAlert, appConfirm } from "../../dialog/dialog";
import {
  previewAssistantText,
  sortGuidanceSessions,
  useWritingGuidance
} from "../../hooks/useWritingGuidance";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

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
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  previewAssistantText: (session: GuidanceSession) => string;
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedSession?.messages.length, streamDraft, streaming]);

  const disabled = busy || guidance.loading || streaming;

  const handleNewSession = useCallback(async () => {
    if (!activeNotebook) return;
    try {
      const { sessionId } = await guidance.addSession(activeNotebook.id);
      setSelectedSessionId(sessionId);
      queueMicrotask(() => composerRef.current?.focus());
    } catch {
      /* */
    }
  }, [activeNotebook, guidance]);

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
      setComposer("");
      setStreaming(true);
      setStreamDraft("");
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
    onStatus
  ]);

  const startRenameNotebook = (nb: { id: string; name: string }) => {
    setRenamingId(nb.id);
    setRenameDraft(nb.name);
  };

  const handleNewNotebook = async () => {
    try {
      const idx = await guidance.addNotebook("新笔记本");
      const created = idx?.notebooks[idx.notebooks.length - 1];
      if (created) {
        setActiveNotebookId(created.id);
        startRenameNotebook(created);
      }
    } catch {
      /* */
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
    chatEndRef,
    previewAssistantText
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
