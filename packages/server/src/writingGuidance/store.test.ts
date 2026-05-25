import { describe, expect, it } from "vitest";
import { normalizeGuidanceIndex, trimMessagesForModel } from "./store.js";
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

describe("normalizeGuidanceIndex", () => {
  it("ensures built-in notebook", () => {
    const idx = normalizeGuidanceIndex({ version: 1, notebooks: [], sessions: [] });
    expect(idx.notebooks.some((n) => n.id === "default")).toBe(true);
  });
});
