import React, { memo } from "react";
import type { OutlineIndex, StageChatTurn } from "../../api";
import { useStageChat } from "../../hooks/useStageChat";
import { FORCE_SUBTREE_MESSAGE, OutlineStageChatPanel } from "./OutlineStageChatPanel";
import type { StageChatDoneMeta } from "../../utils/stageChatSseStream";

type Props = {
  bookId: string;
  stageId: string;
  chatTurns: StageChatTurn[];
  chatDisabled: boolean;
  modelOk: boolean;
  activeModelId: string | null;
  flushBeforeSend?: () => Promise<void>;
  onApplyNote?: (text: string) => void;
  onStagePatchApplied?: (createdIds: string[]) => void;
  onOutlineFromServer: (outline: OutlineIndex) => void;
  onError: (msg: string) => void;
};

export const OutlineStageChatColumn = memo(function OutlineStageChatColumn({
  bookId,
  stageId,
  chatTurns,
  chatDisabled,
  modelOk,
  activeModelId,
  flushBeforeSend,
  onApplyNote,
  onStagePatchApplied,
  onOutlineFromServer,
  onError
}: Props) {
  const handleDoneMeta = (meta: StageChatDoneMeta) => {
    if (meta.patchApplied) {
      const n = meta.createdIds.length;
      onError(n > 0 ? `已更新阶段树（新建 ${n} 个子阶段）` : "已更新当前阶段细纲与子阶段");
      if (meta.createdIds.length) onStagePatchApplied?.(meta.createdIds);
    } else if (meta.patchSkipped) {
      onError("本轮未更新阶段树（未识别 stagePatch）");
    }
    if (meta.warnings.length) {
      onError(meta.warnings.join("；"));
    }
  };

  const chat = useStageChat({
    bookId,
    stageId,
    modelConfigId: activeModelId,
    chatTurns,
    aiBusy: chatDisabled,
    flushBeforeSend,
    onOutlineFromServer,
    onDoneMeta: handleDoneMeta,
    onError
  });

  return (
    <div className="outlineStageCol outlineStageColChat">
      <OutlineStageChatPanel
        turns={chatTurns}
        disabled={chatDisabled}
        chatDisabled={chatDisabled}
        modelOk={modelOk}
        streaming={chat.streaming}
        streamDraft={chat.streamDraft}
        composer={chat.composer}
        setComposer={chat.setComposer}
        onSend={() => void chat.send()}
        onApplyNote={onApplyNote}
        onForceSubtree={() => void chat.sendWithMessage(FORCE_SUBTREE_MESSAGE)}
        chatScrollRef={chat.chatScrollRef}
      />
    </div>
  );
});
