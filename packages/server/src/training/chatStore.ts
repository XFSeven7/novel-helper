import fs from "node:fs/promises";
import path from "node:path";
import { trainingDir } from "./store.js";
import type { TrainingCategoryChat, TrainingChatMessage } from "./types.js";

export const MAX_TRAINING_CHAT_TURNS = 40;
export const MAX_TRAINING_CHAT_USER_LEN = 2000;
export const MAX_TRAINING_CHAT_ASSISTANT_STORE = 8000;

function chatDir(dataDir: string) {
  return path.join(trainingDir(dataDir), "chat");
}

function chatPath(dataDir: string, categoryId: string) {
  const safe = path.basename(categoryId);
  return path.join(chatDir(dataDir), `${safe}.json`);
}

export async function readCategoryChat(dataDir: string, categoryId: string): Promise<TrainingCategoryChat> {
  try {
    const raw = await fs.readFile(chatPath(dataDir, categoryId), "utf8");
    const parsed = JSON.parse(raw) as TrainingCategoryChat;
    return {
      categoryId,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString()
    };
  } catch {
    return { categoryId, messages: [], updatedAt: new Date().toISOString() };
  }
}

function trimTurns(messages: TrainingChatMessage[]): TrainingChatMessage[] {
  const maxMessages = MAX_TRAINING_CHAT_TURNS * 2;
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}

export async function appendCategoryChatTurn(
  dataDir: string,
  categoryId: string,
  userContent: string,
  assistantContent: string
): Promise<TrainingCategoryChat> {
  const user = userContent.trim().slice(0, MAX_TRAINING_CHAT_USER_LEN);
  const assistant = assistantContent.trim().slice(0, MAX_TRAINING_CHAT_ASSISTANT_STORE);
  if (!user || !assistant) throw new Error("Content required");

  const prev = await readCategoryChat(dataDir, categoryId);
  const now = new Date().toISOString();
  const next: TrainingCategoryChat = {
    categoryId,
    messages: trimTurns([
      ...prev.messages,
      { role: "user", content: user, createdAt: now },
      { role: "assistant", content: assistant, createdAt: now }
    ]),
    updatedAt: now
  };
  await fs.mkdir(chatDir(dataDir), { recursive: true });
  await fs.writeFile(chatPath(dataDir, categoryId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function clearCategoryChat(dataDir: string, categoryId: string): Promise<void> {
  const empty: TrainingCategoryChat = {
    categoryId,
    messages: [],
    updatedAt: new Date().toISOString()
  };
  await fs.mkdir(chatDir(dataDir), { recursive: true });
  await fs.writeFile(chatPath(dataDir, categoryId), JSON.stringify(empty, null, 2), "utf8");
}

export function messagesForModel(messages: TrainingChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}
