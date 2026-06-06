import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { StageChatTurn } from "../../api";

const QUICK_PROMPTS = [
  "这一阶段的核心冲突是什么？",
  "和上一阶段如何衔接？",
  "帮我想 3 个可能的情节点"
];

type Props = {
  turns: StageChatTurn[];
  disabled: boolean;
  chatDisabled: boolean;
  modelOk: boolean;
  streaming: boolean;
  streamDraft: string;
  composer: string;
  setComposer: (v: string) => void;
  onSend: () => void;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
};

export function OutlineStageChatPanel({
  turns,
  disabled,
  chatDisabled,
  modelOk,
  streaming,
  streamDraft,
  composer,
  setComposer,
  onSend,
  chatScrollRef
}: Props) {
  const sendDisabled = chatDisabled || !modelOk || streaming;

  const messages = useMemo(() => {
    const items: React.ReactNode[] = turns.map((turn) => (
      <div key={turn.id} className="outlineStageChatTurn">
        <div className="writingGuidanceMsg user">
          <div className="writingGuidanceMsgPlain">{turn.user.content}</div>
        </div>
        <div className="writingGuidanceMsg assistant">
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
  }, [turns, streaming, streamDraft]);

  return (
    <div className="outlineStageChatPanel panel">
      <div className="outlineStageChatHead">阶段策划</div>
      <div className="outlineStageChatScroll" ref={chatScrollRef}>
        {!modelOk ? (
          <p className="muted outlineStageChatEmpty">请先在 设置 → 模型 中配置并测试通过</p>
        ) : turns.length === 0 && !streaming ? (
          <p className="muted outlineStageChatEmpty">
            描述本阶段的困惑或目标，AI 会结合本书大纲提问、梳理方向
          </p>
        ) : (
          messages
        )}
      </div>
      <div className="outlineStageChatTags">
        {QUICK_PROMPTS.map((text) => (
          <button
            key={text}
            type="button"
            className="writingGuidanceTag"
            disabled={sendDisabled}
            onClick={() => setComposer(text)}
          >
            {text.length > 14 ? `${text.slice(0, 14)}…` : text}
          </button>
        ))}
      </div>
      <div className="writingGuidanceComposer outlineStageChatComposer">
        <textarea
          className="writingGuidanceInput"
          placeholder="构思本阶段剧情… Enter 发送，Shift+Enter 换行"
          value={composer}
          rows={3}
          disabled={sendDisabled}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <button
          type="button"
          className="btnPrimary writingGuidanceSend"
          disabled={sendDisabled || !composer.trim() || disabled}
          onClick={() => void onSend()}
        >
          {streaming ? "生成中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
