import React, { memo } from "react";
import type { OutlineIndex, StageChatTurn } from "../../api";
import { useStageChat } from "../../hooks/useStageChat";
import { OutlineStageChatPanel } from "./OutlineStageChatPanel";

type Props = {
  bookId: string;
  stageId: string;
  chatTurns: StageChatTurn[];
  chatDisabled: boolean;
  modelOk: boolean;
  activeModelId: string | null;
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
  onOutlineFromServer,
  onError
}: Props) {
  const chat = useStageChat({
    bookId,
    stageId,
    modelConfigId: activeModelId,
    chatTurns,
    aiBusy: chatDisabled,
    onOutlineFromServer,
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
        chatScrollRef={chat.chatScrollRef}
      />
    </div>
  );
});
