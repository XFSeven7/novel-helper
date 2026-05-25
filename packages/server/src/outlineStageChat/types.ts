export const MAX_STAGE_CHAT_TURNS = 50;
export const MAX_STAGE_CHAT_MODEL_TURNS = 12;
export const MAX_STAGE_CHAT_USER_LEN = 4000;

export type StageChatTurnPart = {
  content: string;
  createdAt: string;
};

export type StageChatTurn = {
  id: string;
  user: StageChatTurnPart;
  assistant: StageChatTurnPart;
};

export type StageChatModelMessage = {
  role: "user" | "assistant";
  content: string;
};
