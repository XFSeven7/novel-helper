import type { WritingGuidanceIndex } from "../api";
import { consumeSseStream } from "./sseStream";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177";

export function guidanceChatStreamUrl(bookId: string, sessionId: string) {
  return `${API_BASE}/api/books/${encodeURIComponent(bookId)}/writing-guidance/sessions/${encodeURIComponent(sessionId)}/chat/stream`;
}

export async function consumeGuidanceSseStream(
  url: string,
  body: { modelConfigId?: string | null; userMessage: string },
  handlers: {
    onDelta?: (delta: string) => void;
    onDone?: (payload: { assistantText: string; index: WritingGuidanceIndex }) => void;
  }
): Promise<WritingGuidanceIndex> {
  return consumeSseStream<WritingGuidanceIndex>({
    url,
    body,
    onDelta: handlers.onDelta,
    onDone: (p) => handlers.onDone?.({ assistantText: p.assistantText, index: p.data }),
    parseDone: (payload) => {
      const index = payload.index as WritingGuidanceIndex | undefined;
      return index ?? null;
    }
  });
}
