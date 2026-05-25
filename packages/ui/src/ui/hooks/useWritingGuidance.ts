import { useCallback, useEffect, useState } from "react";
import {
  createGuidanceNotebook,
  createGuidanceSession,
  deleteGuidanceNotebook,
  deleteGuidanceSession,
  fetchWritingGuidance,
  patchGuidanceNotebook,
  patchGuidanceSession,
  patchGuidanceTurn,
  reorderGuidanceSessions,
  type GuidanceSession,
  type GuidanceTurn,
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
    patchSession: (
      sessionId: string,
      patch: { title?: string; notebookId?: string; starred?: boolean }
    ) => run(() => patchGuidanceSession(bookId!, sessionId, patch)),
    patchTurn: (
      sessionId: string,
      turnId: string,
      patch: { hidden?: boolean; starred?: boolean }
    ) => run(() => patchGuidanceTurn(bookId!, sessionId, turnId, patch)),
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

export function sessionHasStarredTurn(session: GuidanceSession): boolean {
  return session.turns.some((t) => t.starred);
}

export function turnLabel(turn: GuidanceTurn, max = 40): string {
  const t = turn.user.content.replace(/\s+/g, " ").trim();
  if (!t) return "（空）";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function previewAssistantText(session: GuidanceSession): string {
  for (let i = session.turns.length - 1; i >= 0; i--) {
    const a = session.turns[i]!.assistant.content.replace(/\s+/g, " ").trim();
    if (a) return a.length <= 80 ? a : `${a.slice(0, 80)}…`;
  }
  return "";
}

export type GuidanceNavFilter = "all" | "starredSessions" | "starredTurns";

export function filterGuidanceSessions(
  sessions: GuidanceSession[],
  filter: GuidanceNavFilter
): GuidanceSession[] {
  if (filter === "starredSessions") return sessions.filter((s) => s.starred);
  if (filter === "starredTurns") {
    return sessions.filter((s) => s.turns.some((t) => t.starred));
  }
  return sessions;
}
