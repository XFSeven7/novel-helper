import fs from "node:fs/promises";
import path from "node:path";
import { trainingDir } from "./store.js";
import type { TrainingSceneChat, TrainingChatMessage } from "./types.js";

export const MAX_TRAINING_CHAT_TURNS = 40;
export const MAX_TRAINING_CHAT_USER_LEN = 2000;
export const MAX_TRAINING_CHAT_ASSISTANT_STORE = 8000;

function chatDir(dataDir: string) {
  return path.join(trainingDir(dataDir), "chat");
}

function chatPath(dataDir: string, sceneId: string) {
  const safe = path.basename(sceneId);
  return path.join(chatDir(dataDir), `${safe}.json`);
}

export async function readSceneChat(dataDir: string, sceneId: string): Promise<TrainingSceneChat> {
  try {
    const raw = await fs.readFile(chatPath(dataDir, sceneId), "utf8");
    const parsed = JSON.parse(raw) as TrainingSceneChat & { categoryId?: string };
    return {
      sceneId,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString()
    };
  } catch {
    return { sceneId, messages: [], updatedAt: new Date().toISOString() };
  }
}

function trimTurns(messages: TrainingChatMessage[]): TrainingChatMessage[] {
  const maxMessages = MAX_TRAINING_CHAT_TURNS * 2;
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}

export async function appendSceneChatTurn(
  dataDir: string,
  sceneId: string,
  userContent: string,
  assistantContent: string
): Promise<TrainingSceneChat> {
  const user = userContent.trim().slice(0, MAX_TRAINING_CHAT_USER_LEN);
  const assistant = assistantContent.trim().slice(0, MAX_TRAINING_CHAT_ASSISTANT_STORE);
  if (!user || !assistant) throw new Error("Content required");

  const prev = await readSceneChat(dataDir, sceneId);
  const now = new Date().toISOString();
  const next: TrainingSceneChat = {
    sceneId,
    messages: trimTurns([
      ...prev.messages,
      { role: "user", content: user, createdAt: now },
      { role: "assistant", content: assistant, createdAt: now }
    ]),
    updatedAt: now
  };
  await fs.mkdir(chatDir(dataDir), { recursive: true });
  await fs.writeFile(chatPath(dataDir, sceneId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function clearSceneChat(dataDir: string, sceneId: string): Promise<void> {
  const empty: TrainingSceneChat = {
    sceneId,
    messages: [],
    updatedAt: new Date().toISOString()
  };
  await fs.mkdir(chatDir(dataDir), { recursive: true });
  await fs.writeFile(chatPath(dataDir, sceneId), JSON.stringify(empty, null, 2), "utf8");
}

export function messagesForModel(messages: TrainingChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}
