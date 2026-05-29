import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendCategoryChatTurn,
  clearCategoryChat,
  MAX_TRAINING_CHAT_TURNS,
  readCategoryChat
} from "./chatStore.js";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nh-training-chat-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("training category chat store", () => {
  it("appends user and assistant and truncates to max turns", async () => {
    for (let i = 0; i < MAX_TRAINING_CHAT_TURNS + 1; i++) {
      await appendCategoryChatTurn(tmp, "cat-rhythm", `user ${i}`, `assistant ${i}`);
    }
    const chat = await readCategoryChat(tmp, "cat-rhythm");
    expect(chat.messages.length).toBe(MAX_TRAINING_CHAT_TURNS * 2);
    expect(chat.messages[0]!.content).toBe("user 1");
  });

  it("clearChat empties messages", async () => {
    await appendCategoryChatTurn(tmp, "cat-rhythm", "hi", "hello");
    await clearCategoryChat(tmp, "cat-rhythm");
    const chat = await readCategoryChat(tmp, "cat-rhythm");
    expect(chat.messages).toEqual([]);
  });
});
