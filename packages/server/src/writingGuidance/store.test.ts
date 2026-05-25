import { describe, expect, it } from "vitest";
import { splitAssistantSessionTitle } from "./parseReply.js";
import {
  migrateMessagesToTurns,
  normalizeGuidanceIndex,
  trimMessagesForModel,
  turnsForModel
} from "./store.js";
import { MAX_GUIDANCE_MODEL_MESSAGES } from "./types.js";

describe("trimMessagesForModel", () => {
  it("keeps all when within limit", () => {
    const msgs = Array.from({ length: 4 }, (_, i) => ({
      role: "user" as const,
      content: `m${i}`,
      createdAt: "2026-01-01T00:00:00.000Z"
    }));
    expect(trimMessagesForModel(msgs)).toHaveLength(4);
  });

  it("keeps only last N", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
      content: `m${i}`,
      createdAt: "2026-01-01T00:00:00.000Z"
    }));
    const trimmed = trimMessagesForModel(msgs);
    expect(trimmed).toHaveLength(MAX_GUIDANCE_MODEL_MESSAGES);
    expect(trimmed[0]!.content).toBe("m4");
  });
});

describe("splitAssistantSessionTitle", () => {
  it("extracts title line from assistant", () => {
    const { content, sessionTitle } = splitAssistantSessionTitle(
      "## 要点\n- a\n【会话标题】刀伤写实"
    );
    expect(sessionTitle).toBe("刀伤写实");
    expect(content).not.toContain("【会话标题】");
  });
});

describe("migrateMessagesToTurns", () => {
  it("pairs user+assistant", () => {
    const turns = migrateMessagesToTurns([
      { role: "user", content: "q1", createdAt: "t1" },
      { role: "assistant", content: "a1", createdAt: "t2" }
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.user.content).toBe("q1");
    expect(turns[0]!.assistant.content).toBe("a1");
  });
});

describe("turnsForModel", () => {
  it("excludes hidden turns", () => {
    const msgs = turnsForModel([
      {
        id: "1",
        user: { content: "h", createdAt: "t" },
        assistant: { content: "x", createdAt: "t" },
        hidden: true
      },
      {
        id: "2",
        user: { content: "v", createdAt: "t" },
        assistant: { content: "y", createdAt: "t" }
      }
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.content).toBe("v");
  });

  it("skips turns with empty assistant", () => {
    const msgs = turnsForModel([
      {
        id: "1",
        user: { content: "q", createdAt: "t" },
        assistant: { content: "", createdAt: "t" }
      }
    ]);
    expect(msgs).toHaveLength(0);
  });
});

describe("normalizeGuidanceIndex", () => {
  it("ensures built-in notebook", () => {
    const idx = normalizeGuidanceIndex({ version: 1, notebooks: [], sessions: [] });
    expect(idx.notebooks.some((n) => n.id === "default")).toBe(true);
    expect(idx.version).toBe(2);
  });

  it("migrates v1 messages to turns", () => {
    const idx = normalizeGuidanceIndex({
      version: 1,
      notebooks: [{ id: "default", name: "常用", builtIn: true, order: 0 }],
      sessions: [
        {
          id: "s1",
          notebookId: "default",
          title: "t",
          messages: [
            { role: "user", content: "hi", createdAt: "t1" },
            { role: "assistant", content: "yo", createdAt: "t2" }
          ],
          order: 0,
          createdAt: "t1",
          updatedAt: "t2"
        }
      ]
    });
    expect(idx.sessions[0]!.turns).toHaveLength(1);
    expect(idx.sessions[0]!.turns[0]!.user.content).toBe("hi");
  });
});
