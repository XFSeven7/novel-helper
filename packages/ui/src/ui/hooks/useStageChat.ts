import { useCallback, useEffect, useRef, useState } from "react";
import type { OutlineIndex, StageChatTurn } from "../api";
import {
  consumeStageChatStream,
  stageChatStreamUrl,
  type StageChatDoneMeta
} from "../utils/stageChatSseStream";
import { isChatNearBottom, scrollChatToBottom, scrollChatToBottomAfterPaint } from "../utils/chatScroll";

export function useStageChat(opts: {
  bookId: string;
  stageId: string | null;
  modelConfigId: string | null;
  chatTurns: StageChatTurn[];
  aiBusy: boolean;
  flushBeforeSend?: () => Promise<void>;
  onOutlineFromServer: (outline: OutlineIndex) => void;
  onDoneMeta?: (meta: StageChatDoneMeta) => void;
  onError: (msg: string) => void;
}) {
  const [streaming, setStreaming] = useState(false);
  const [streamDraft, setStreamDraft] = useState("");
  const [composer, setComposer] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStreamDraft("");
    setComposer("");
    scrollChatToBottomAfterPaint(() => chatScrollRef.current, "auto");
  }, [opts.stageId]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el || !isChatNearBottom(el)) return;
    scrollChatToBottom(el, "auto");
  }, [opts.chatTurns.length, streaming, streamDraft]);

  const sendWithMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !opts.stageId || opts.aiBusy || streaming) return;
      setStreaming(true);
      setStreamDraft("");
      setComposer("");
      scrollChatToBottomAfterPaint(() => chatScrollRef.current, "auto");
      opts.onError("");
      try {
        if (opts.flushBeforeSend) await opts.flushBeforeSend();
        const meta = await consumeStageChatStream(
          stageChatStreamUrl(opts.bookId, opts.stageId),
          { modelConfigId: opts.modelConfigId, userMessage: trimmed },
          { onDelta: (d) => setStreamDraft((prev) => prev + d) }
        );
        opts.onOutlineFromServer(meta.outline);
        opts.onDoneMeta?.(meta);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        opts.onError(msg);
      } finally {
        setStreaming(false);
        setStreamDraft("");
      }
    },
    [opts, streaming]
  );

  const send = useCallback(async () => {
    const text = composer.trim();
    if (!text) return;
    await sendWithMessage(text);
  }, [composer, sendWithMessage]);

  return {
    streaming,
    streamDraft,
    composer,
    setComposer,
    send,
    sendWithMessage,
    chatScrollRef
  };
}
