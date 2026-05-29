import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendSceneChatTurn,
  clearSceneChat,
  MAX_TRAINING_CHAT_TURNS,
  readSceneChat
} from "./chatStore.js";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nh-training-chat-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("training scene chat store", () => {
  it("appends user and assistant and truncates to max turns", async () => {
    for (let i = 0; i < MAX_TRAINING_CHAT_TURNS + 1; i++) {
      await appendSceneChatTurn(tmp, "scene-env", `user ${i}`, `assistant ${i}`);
    }
    const chat = await readSceneChat(tmp, "scene-env");
    expect(chat.messages.length).toBe(MAX_TRAINING_CHAT_TURNS * 2);
    expect(chat.messages[0]!.content).toBe("user 1");
  });

  it("clearChat empties messages", async () => {
    await appendSceneChatTurn(tmp, "scene-env", "hi", "hello");
    await clearSceneChat(tmp, "scene-env");
    const chat = await readSceneChat(tmp, "scene-env");
    expect(chat.messages).toEqual([]);
  });
});
