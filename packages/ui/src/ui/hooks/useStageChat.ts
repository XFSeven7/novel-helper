import { useCallback, useEffect, useRef, useState } from "react";
import type { OutlineIndex, StageChatTurn } from "../api";
import { consumeStageChatStream, stageChatStreamUrl } from "../utils/stageChatSseStream";

export function useStageChat(opts: {
  bookId: string;
  stageId: string | null;
  modelConfigId: string | null;
  chatTurns: StageChatTurn[];
  aiBusy: boolean;
  onOutlineFromServer: (outline: OutlineIndex) => void;
  onError: (msg: string) => void;
}) {
  const [streaming, setStreaming] = useState(false);
  const [streamDraft, setStreamDraft] = useState("");
  const [composer, setComposer] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStreamDraft("");
    setComposer("");
  }, [opts.stageId]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [opts.chatTurns.length, streaming, streamDraft]);

  const send = useCallback(async () => {
    const text = composer.trim();
    if (!text || !opts.stageId || opts.aiBusy || streaming) return;
    setStreaming(true);
    setStreamDraft("");
    setComposer("");
    opts.onError("");
    try {
      const outline = await consumeStageChatStream(
        stageChatStreamUrl(opts.bookId, opts.stageId),
        { modelConfigId: opts.modelConfigId, userMessage: text },
        { onDelta: (d) => setStreamDraft((prev) => prev + d) }
      );
      opts.onOutlineFromServer(outline);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      opts.onError(msg);
    } finally {
      setStreaming(false);
      setStreamDraft("");
    }
  }, [composer, opts]);

  return {
    streaming,
    streamDraft,
    composer,
    setComposer,
    send,
    chatScrollRef
  };
}
