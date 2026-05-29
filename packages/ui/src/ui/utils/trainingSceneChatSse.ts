import type { TrainingChatMessage } from "../api";
import { consumeSseStream } from "./sseStream";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177";

export function trainingSceneChatStreamUrl(sceneId: string) {
  return `${API_BASE}/api/training/scenes/${encodeURIComponent(sceneId)}/chat/stream`;
}

export async function consumeTrainingSceneChatStream(
  sceneId: string,
  body: { message: string; modelConfigId?: string | null },
  handlers: {
    onDelta?: (delta: string) => void;
    onDone?: (payload: { assistantText: string; messages: TrainingChatMessage[] }) => void;
  }
): Promise<TrainingChatMessage[]> {
  return consumeSseStream<TrainingChatMessage[]>({
    url: trainingSceneChatStreamUrl(sceneId),
    body,
    onDelta: handlers.onDelta,
    onDone: handlers.onDone
      ? (p) => handlers.onDone!({ assistantText: p.assistantText, messages: p.data })
      : undefined,
    parseDone: (payload) => {
      const messages = payload.messages as TrainingChatMessage[] | undefined;
      return Array.isArray(messages) ? messages : null;
    }
  });
}
