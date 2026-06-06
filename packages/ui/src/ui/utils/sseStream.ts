export async function consumeSseStream<TDone>(opts: {
  url: string;
  body: Record<string, unknown>;
  onDelta?: (delta: string) => void;
  onDone?: (payload: { assistantText: string; data: TDone; raw: Record<string, unknown> }) => void;
  parseDone: (payload: Record<string, unknown>) => TDone | null;
}): Promise<TDone> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts.body)
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    let msg = t || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(t) as { message?: string };
      if (j?.message) msg = String(j.message);
    } catch {
      // ignore non-JSON body
    }
    if (res.status === 404) {
      msg = "阶段未找到，请稍候或重新选中该阶段后再试";
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let result: TDone | null = null;

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
        const payload = JSON.parse(payloadText) as Record<string, unknown>;
        if (payload.type === "delta") {
          const d = String(payload.textDelta ?? "");
          if (d) opts.onDelta?.(d);
        }
        if (payload.type === "done") {
          const assistantText = String(payload.assistantText ?? "");
          const data = opts.parseDone(payload);
          if (data) {
            result = data;
            opts.onDone?.({ assistantText, data, raw: payload });
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

  if (!result) throw new Error("未收到完整响应");
  return result;
}
