const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177";

export function chapterStreamUrl(bookId: string, filename: string, action: "polish" | "mobile-layout" | "expand") {
  return `${API_BASE}/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(filename)}/${action}/stream`;
}

export async function consumeChapterSseStream(
  url: string,
  body: Record<string, unknown>,
  handlers: {
    onDelta?: (delta: string) => void;
    onDone?: (text: string) => void;
  }
): Promise<string> {
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
  let finalText = "";

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
          text?: string;
          message?: string;
        };
        if (payload.type === "delta") {
          const d = String(payload.textDelta ?? "");
          if (d) handlers.onDelta?.(d);
        }
        if (payload.type === "done") {
          finalText = String(payload.text ?? "");
          if (finalText.trim()) handlers.onDone?.(finalText);
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
  return finalText;
}

export function stripAiPlainTextOutput(raw: string): string {
  const t = String(raw || "").trim();
  const m = t.match(/^```(?:\w+)?\s*([\s\S]*?)```$/i);
  return (m ? m[1] : t).trim();
}
