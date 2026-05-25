import type { WritingGuidanceIndex } from "../api";

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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let resultIndex: WritingGuidanceIndex | null = null;

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
        const payload = JSON.parse(payloadText) as {
          type?: string;
          textDelta?: string;
          assistantText?: string;
          index?: WritingGuidanceIndex;
          message?: string;
        };
        if (payload.type === "delta") {
          const d = String(payload.textDelta ?? "");
          if (d) handlers.onDelta?.(d);
        }
        if (payload.type === "done") {
          const assistantText = String(payload.assistantText ?? "");
          const index = payload.index;
          if (index) {
            resultIndex = index;
            handlers.onDone?.({ assistantText, index });
          }
        }
        if (payload.type === "error") {
          throw new Error(String(payload.message || "请求失败"));
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  if (!resultIndex) throw new Error("未收到完整响应");
  return resultIndex;
}
