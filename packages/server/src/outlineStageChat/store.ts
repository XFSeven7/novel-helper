import crypto from "node:crypto";
import {
  readOutlineIndex,
  writeOutlineIndex,
  type OutlineIndex
} from "../outlineStore.js";
import {
  MAX_STAGE_CHAT_MODEL_TURNS,
  MAX_STAGE_CHAT_TURNS,
  MAX_STAGE_CHAT_USER_LEN,
  type StageChatModelMessage,
  type StageChatTurn
} from "./types.js";
import { findStageNode, stageRoots, updateStageNodeInTree } from "./stageTree.js";

export { normalizeStageChatTurns } from "./normalize.js";

export function turnsForModel(turns: StageChatTurn[]): StageChatModelMessage[] {
  const msgs: StageChatModelMessage[] = [];
  for (const t of turns) {
    const u = t.user.content.trim();
    const a = t.assistant.content.trim();
    if (u) msgs.push({ role: "user", content: u });
    if (a) msgs.push({ role: "assistant", content: a });
  }
  return msgs.slice(-MAX_STAGE_CHAT_MODEL_TURNS * 2);
}

export async function appendStageChatTurn(
  dataDir: string,
  bookId: string,
  stageId: string,
  userContent: string,
  assistantContent: string
): Promise<OutlineIndex> {
  const outline = await readOutlineIndex(dataDir, bookId);
  if (!outline) throw new Error("Not found");
  const roots = stageRoots(outline.book.mainlineStages);
  const found = findStageNode(roots, stageId);
  if (!found) throw new Error("Not found");

  const text = userContent.trim().slice(0, MAX_STAGE_CHAT_USER_LEN);
  const assistant = assistantContent.trim().slice(0, MAX_STAGE_CHAT_USER_LEN * 4);
  if (!text || !assistant) throw new Error("Content required");

  const now = new Date().toISOString();
  const turn: StageChatTurn = {
    id: crypto.randomUUID(),
    user: { content: text, createdAt: now },
    assistant: { content: assistant, createdAt: now }
  };
  const prev = found.node.chatTurns ?? [];
  const nextTurns = [...prev, turn].slice(-MAX_STAGE_CHAT_TURNS);
  const nextStages = updateStageNodeInTree(roots, stageId, { chatTurns: nextTurns });
  const next: OutlineIndex = {
    ...outline,
    book: { ...outline.book, mainlineStages: nextStages.length ? nextStages : undefined }
  };
  return writeOutlineIndex(dataDir, bookId, next);
}
