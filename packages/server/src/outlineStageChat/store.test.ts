import { describe, expect, it } from "vitest";
import { normalizeStageChatTurns } from "./normalize.js";
import { turnsForModel } from "./store.js";
import { MAX_STAGE_CHAT_MODEL_TURNS, MAX_STAGE_CHAT_TURNS } from "./types.js";
import { findStageNode, updateStageNodeInTree } from "./stageTree.js";
import type { OutlineStageNode } from "../outlineStore.js";

describe("normalizeStageChatTurns", () => {
  it("truncates to max turns", () => {
    const raw = Array.from({ length: 60 }, (_, i) => ({
      id: `t${i}`,
      user: { content: `u${i}`, createdAt: "2026-01-01T00:00:00.000Z" },
      assistant: { content: `a${i}`, createdAt: "2026-01-01T00:00:00.000Z" }
    }));
    const turns = normalizeStageChatTurns(raw);
    expect(turns).toHaveLength(MAX_STAGE_CHAT_TURNS);
    expect(turns![0]!.user.content).toBe("u10");
  });
});

describe("turnsForModel", () => {
  it("keeps last N turns as messages", () => {
    const turns = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      user: { content: `u${i}`, createdAt: "t" },
      assistant: { content: `a${i}`, createdAt: "t" }
    }));
    const msgs = turnsForModel(turns);
    expect(msgs.length).toBeLessThanOrEqual(MAX_STAGE_CHAT_MODEL_TURNS * 2);
    expect(msgs[0]!.content).toBe("u8");
  });
});

describe("stageTree", () => {
  it("updates chatTurns on node", () => {
    const roots: OutlineStageNode[] = [
      { id: "a", label: "A", children: [{ id: "b", label: "B", children: [] }] }
    ];
    const found = findStageNode(roots, "b");
    expect(found?.node.label).toBe("B");
    const next = updateStageNodeInTree(roots, "b", {
      chatTurns: [
        {
          id: "1",
          user: { content: "q", createdAt: "t" },
          assistant: { content: "a", createdAt: "t" }
        }
      ]
    });
    expect(findStageNode(next, "b")?.node.chatTurns).toHaveLength(1);
  });
});
