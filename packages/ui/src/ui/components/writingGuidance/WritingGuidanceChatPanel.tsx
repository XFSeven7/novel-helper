import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WRITING_GUIDANCE_TAGS } from "./writingGuidanceTags";
import { useWritingGuidanceContext } from "./WritingGuidanceContext";

export function WritingGuidanceChatPanel() {
  const {
    selectedSession,
    disabled,
    composer,
    setComposer,
    streaming,
    streamDraft,
    handleSend,
    composerRef,
    chatEndRef
  } = useWritingGuidanceContext();

  const renderMessages = () => {
    const msgs = selectedSession?.messages ?? [];
    const items: React.ReactNode[] = msgs.map((m, i) => (
      <div
        key={`${m.createdAt}-${i}`}
        className={`writingGuidanceMsg ${m.role === "user" ? "user" : "assistant"}`}
      >
        {m.role === "assistant" ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
        ) : (
          <div className="writingGuidanceMsgPlain">{m.content}</div>
        )}
      </div>
    ));
    if (streaming && streamDraft) {
      items.push(
        <div key="streaming" className="writingGuidanceMsg assistant streaming">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamDraft}</ReactMarkdown>
        </div>
      );
    } else if (streaming) {
      items.push(
        <div key="streaming-wait" className="writingGuidanceMsg assistant muted">
          生成中…
        </div>
      );
    }
    return items;
  };

  return (
    <div className="writingGuidanceChatPanel panel">
      <div className="writingGuidanceChat">
        {!selectedSession ? (
          <div className="bookNotesEmpty muted writingGuidanceChatEmpty">
            请从左侧选择一条指导，或直接在下方输入开始新对话
          </div>
        ) : (
          <>
            <div className="writingGuidanceChatHead">{selectedSession.title}</div>
            <div className="writingGuidanceChatScroll">{renderMessages()}</div>
            <div ref={chatEndRef} />
          </>
        )}
      </div>

      <div className="writingGuidanceTags">
        {WRITING_GUIDANCE_TAGS.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="writingGuidanceTag"
            disabled={disabled}
            onClick={() => setComposer(tag.template)}
          >
            {tag.label}
          </button>
        ))}
      </div>

      <div className="writingGuidanceComposer">
        <textarea
          ref={composerRef}
          className="writingGuidanceInput"
          placeholder="描述场景或写法困惑… Enter 发送，Shift+Enter 换行"
          value={composer}
          rows={4}
          disabled={disabled}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          type="button"
          className="btnPrimary writingGuidanceSend"
          disabled={disabled || !composer.trim()}
          onClick={() => void handleSend()}
        >
          {streaming ? "生成中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
