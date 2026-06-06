import type { OutlineIndex } from "../api";
import { consumeSseStream } from "./sseStream";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177";

export type StageChatDoneMeta = {
  assistantText: string;
  outline: OutlineIndex;
  patchApplied: boolean;
  patchSkipped: boolean;
  createdIds: string[];
  warnings: string[];
};

export function stageChatStreamUrl(bookId: string, stageId: string) {
  return `${API_BASE}/api/books/${encodeURIComponent(bookId)}/outline/stages/${encodeURIComponent(stageId)}/chat/stream`;
}

export async function consumeStageChatStream(
  url: string,
  body: { modelConfigId?: string | null; userMessage: string },
  handlers: {
    onDelta?: (delta: string) => void;
    onDone?: (payload: StageChatDoneMeta) => void;
  }
): Promise<StageChatDoneMeta> {
  let meta: StageChatDoneMeta | null = null;
  await consumeSseStream<OutlineIndex>({
    url,
    body,
    onDelta: handlers.onDelta,
    onDone: (p) => {
      const raw = p.raw;
      meta = {
        assistantText: p.assistantText,
        outline: p.data,
        patchApplied: Boolean(raw.patchApplied),
        patchSkipped: Boolean(raw.patchSkipped),
        createdIds: Array.isArray(raw.createdIds) ? (raw.createdIds as string[]) : [],
        warnings: Array.isArray(raw.warnings) ? (raw.warnings as string[]) : []
      };
      handlers.onDone?.(meta);
    },
    parseDone: (payload) => {
      const outline = payload.outline as OutlineIndex | undefined;
      return outline ?? null;
    }
  });
  if (!meta) throw new Error("未收到完整响应");
  return meta;
}
