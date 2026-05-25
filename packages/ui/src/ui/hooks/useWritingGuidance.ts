import { useCallback, useEffect, useState } from "react";
import {
  createGuidanceNotebook,
  createGuidanceSession,
  deleteGuidanceNotebook,
  deleteGuidanceSession,
  fetchWritingGuidance,
  patchGuidanceNotebook,
  patchGuidanceSession,
  reorderGuidanceSessions,
  type GuidanceSession,
  type WritingGuidanceIndex
} from "../api";
import { consumeGuidanceSseStream, guidanceChatStreamUrl } from "../utils/guidanceSseStream";

export function useWritingGuidance(bookId: string | null) {
  const [index, setIndex] = useState<WritingGuidanceIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!bookId) {
      setIndex(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetchWritingGuidance(bookId);
      setIndex(res.index);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (fn: () => Promise<{ index: WritingGuidanceIndex }>) => {
      if (!bookId) return;
      setError("");
      try {
        const res = await fn();
        setIndex(res.index);
        return res.index;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      }
    },
    [bookId]
  );

  const chatStream = useCallback(
    async (
      sessionId: string,
      userMessage: string,
      modelConfigId: string | null,
      handlers: { onDelta?: (d: string) => void }
    ): Promise<WritingGuidanceIndex> => {
      if (!bookId) throw new Error("无当前书籍");
      setError("");
      try {
        const nextIndex = await consumeGuidanceSseStream(
          guidanceChatStreamUrl(bookId, sessionId),
          { modelConfigId, userMessage },
          { onDelta: handlers.onDelta }
        );
        setIndex(nextIndex);
        return nextIndex;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      }
    },
    [bookId]
  );

  return {
    index,
    loading,
    error,
    reload,
    addNotebook: (name: string) => run(() => createGuidanceNotebook(bookId!, name)),
    renameNotebook: (notebookId: string, name: string) =>
      run(() => patchGuidanceNotebook(bookId!, notebookId, { name })),
    removeNotebook: (notebookId: string) => run(() => deleteGuidanceNotebook(bookId!, notebookId)),
    addSession: async (notebookId: string, title?: string) => {
      if (!bookId) throw new Error("无当前书籍");
      setError("");
      const res = await createGuidanceSession(bookId, notebookId, title);
      setIndex(res.index);
      return { index: res.index, sessionId: res.sessionId };
    },
    patchSession: (sessionId: string, patch: { title?: string; notebookId?: string }) =>
      run(() => patchGuidanceSession(bookId!, sessionId, patch)),
    reorderSessions: (notebookId: string, sessionIds: string[]) =>
      run(() => reorderGuidanceSessions(bookId!, notebookId, sessionIds)),
    removeSession: (sessionId: string) => run(() => deleteGuidanceSession(bookId!, sessionId)),
    chatStream
  };
}

export function sortGuidanceSessions(sessions: GuidanceSession[], sortDesc: boolean): GuidanceSession[] {
  return [...sessions].sort((a, b) => {
    const ao = Number.isFinite(a.order) ? a.order : 0;
    const bo = Number.isFinite(b.order) ? b.order : 0;
    return sortDesc ? bo - ao : ao - bo;
  });
}

export function previewAssistantText(session: GuidanceSession): string {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const m = session.messages[i];
    if (m?.role === "assistant") {
      const one = m.content.replace(/\s+/g, " ").trim();
      if (one.length <= 80) return one;
      return `${one.slice(0, 80)}…`;
    }
  }
  return "";
}
