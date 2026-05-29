import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  clearTrainingSceneChat,
  getTrainingSceneChat,
  type TrainingChatMessage
} from "../../api";
import { appConfirm } from "../../dialog/dialog";
import { consumeTrainingSceneChatStream } from "../../utils/trainingSceneChatSse";

function formatApiError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const text = e.message.trim();
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch {
    /* */
  }
  return text || "请求失败";
}

export function TrainingSceneChat(props: {
  sceneId: string;
  sceneTitle: string;
  modelConfigId: string | null;
  disabled?: boolean;
  onStatus?: (msg: string) => void;
}) {
  const [messages, setMessages] = useState<TrainingChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamDraft, setStreamDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTrainingSceneChat(props.sceneId);
      setMessages(res.messages);
    } catch (e: unknown) {
      props.onStatus?.(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [props.sceneId, props.onStatus]);

  useEffect(() => {
    void load();
    setComposer("");
    setStreamDraft("");
  }, [load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, streaming, streamDraft]);

  async function handleSend() {
    const text = composer.trim();
    if (!text || !props.modelConfigId || props.disabled || streaming) return;
    setStreaming(true);
    setStreamDraft("");
    setComposer("");
    props.onStatus?.("");
    const optimistic: TrainingChatMessage = {
      role: "user",
      content: text,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const next = await consumeTrainingSceneChatStream(
        props.sceneId,
        { message: text, modelConfigId: props.modelConfigId },
        { onDelta: (d) => setStreamDraft((prev) => prev + d) }
      );
      setMessages(next);
    } catch (e: unknown) {
      props.onStatus?.(formatApiError(e));
      setMessages((prev) => prev.filter((m) => m !== optimistic));
    } finally {
      setStreaming(false);
      setStreamDraft("");
    }
  }

  async function handleClear() {
    const ok = await appConfirm({
      title: "清空对话",
      message: `确定清空「${props.sceneTitle}」下的学法咨询记录？`,
      confirmLabel: "清空",
      variant: "danger"
    });
    if (!ok) return;
    try {
      await clearTrainingSceneChat(props.sceneId);
      setMessages([]);
    } catch (e: unknown) {
      props.onStatus?.(formatApiError(e));
    }
  }

  const inputDisabled = props.disabled || streaming || !props.modelConfigId;

  return (
    <div className="trainingCategoryChat">
      <header className="trainingCategoryChatHead">
        <h3 className="trainingPaneTitle">学法咨询</h3>
        <button type="button" className="btnSort" disabled={!messages.length || streaming} onClick={() => void handleClear()}>
          清空对话
        </button>
      </header>
      {!props.modelConfigId ? (
        <p className="muted trainingCategoryChatHint">请先在设置 → 功能中配置训练用 AI 模型。</p>
      ) : null}
      <div ref={scrollRef} className="trainingCategoryChatScroll">
        {loading ? <p className="muted">加载对话…</p> : null}
        {messages.map((m, i) => (
          <div
            key={`${m.createdAt}-${i}`}
            className={`trainingCategoryChatBubble trainingCategoryChatBubble--${m.role}`}
          >
            <pre className="trainingCategoryChatText">{m.content}</pre>
          </div>
        ))}
        {streaming && streamDraft ? (
          <div className="trainingCategoryChatBubble trainingCategoryChatBubble--assistant">
            <pre className="trainingCategoryChatText">{streamDraft}</pre>
          </div>
        ) : null}
        {!loading && !messages.length && !streaming ? (
          <p className="muted">可就本场景写法、例题理解向 AI 提问；不会代写练习正文。</p>
        ) : null}
      </div>
      <footer className="trainingCategoryChatFooter">
        <textarea
          className="trainingTextarea trainingCategoryChatInput"
          rows={3}
          value={composer}
          disabled={inputDisabled}
          placeholder="输入问题…"
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <button type="button" className="btnModalPrimary" disabled={inputDisabled || !composer.trim()} onClick={() => void handleSend()}>
          {streaming ? "回复中…" : "发送"}
        </button>
      </footer>
    </div>
  );
}
