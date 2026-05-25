import type { OutlineIndex } from "../api";
import { consumeSseStream } from "./sseStream";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177";

export function stageChatStreamUrl(bookId: string, stageId: string) {
  return `${API_BASE}/api/books/${encodeURIComponent(bookId)}/outline/stages/${encodeURIComponent(stageId)}/chat/stream`;
}

export async function consumeStageChatStream(
  url: string,
  body: { modelConfigId?: string | null; userMessage: string },
  handlers: {
    onDelta?: (delta: string) => void;
    onDone?: (payload: { assistantText: string; outline: OutlineIndex }) => void;
  }
): Promise<OutlineIndex> {
  return consumeSseStream<OutlineIndex>({
    url,
    body,
    onDelta: handlers.onDelta,
    onDone: handlers.onDone
      ? (p) => handlers.onDone!({ assistantText: p.assistantText, outline: p.data })
      : undefined,
    parseDone: (payload) => {
      const outline = payload.outline as OutlineIndex | undefined;
      return outline ?? null;
    }
  });
}
