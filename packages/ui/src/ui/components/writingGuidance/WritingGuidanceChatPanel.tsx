import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GuidanceTurn } from "../../api";
import { WRITING_GUIDANCE_TAGS } from "./writingGuidanceTags";
import { useWritingGuidanceContext } from "./WritingGuidanceContext";

function visibleTurnsForChat(
  turns: GuidanceTurn[],
  showHidden: boolean,
  showStarredOnly: boolean
): GuidanceTurn[] {
  let list = turns;
  if (showStarredOnly) list = list.filter((t) => t.starred);
  if (!showHidden) list = list.filter((t) => !t.hidden);
  return list;
}

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
    chatScrollRef,
    showHiddenInChat,
    setShowHiddenInChat,
    showStarredOnly,
    registerTurnAnchor
  } = useWritingGuidanceContext();

  const hiddenCount = useMemo(
    () => (selectedSession?.turns ?? []).filter((t) => t.hidden).length,
    [selectedSession?.turns]
  );

  const displayTurns = useMemo(
    () =>
      selectedSession
        ? visibleTurnsForChat(selectedSession.turns, showHiddenInChat, showStarredOnly)
        : [],
    [selectedSession, showHiddenInChat, showStarredOnly]
  );

  const renderTurns = () => {
    const items: React.ReactNode[] = displayTurns.map((turn) => (
      <div key={turn.id} className="writingGuidanceTurn" data-turn-id={turn.id}>
        <div className="writingGuidanceMsg user">
          <div className="writingGuidanceMsgPlain">{turn.user.content}</div>
        </div>
        <div
          className="writingGuidanceMsg assistant"
          ref={(el) => registerTurnAnchor(turn.id, el)}
        >
          {turn.assistant.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.assistant.content}</ReactMarkdown>
          ) : (
            <span className="muted">（无回复）</span>
          )}
        </div>
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
            {hiddenCount > 0 && !showHiddenInChat ? (
              <button
                type="button"
                className="writingGuidanceShowHiddenBtn muted"
                onClick={() => setShowHiddenInChat(true)}
              >
                显示已隐藏 ({hiddenCount})
              </button>
            ) : null}
            {showHiddenInChat && hiddenCount > 0 ? (
              <button
                type="button"
                className="writingGuidanceShowHiddenBtn muted"
                onClick={() => setShowHiddenInChat(false)}
              >
                收起已隐藏
              </button>
            ) : null}
            <div className="writingGuidanceChatScroll" ref={chatScrollRef}>
              {renderTurns()}
            </div>
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
