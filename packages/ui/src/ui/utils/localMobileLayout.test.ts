import { describe, expect, it } from "vitest";
import { applyLocalMobileLayout, needsLocalMobileLayout } from "./localMobileLayout";

describe("needsLocalMobileLayout", () => {
  it("returns false for empty string", () => {
    expect(needsLocalMobileLayout("")).toBe(false);
  });

  it("returns false for whitespace-only", () => {
    expect(needsLocalMobileLayout("   \n\t  ")).toBe(false);
  });

  it("returns false when body is already local layout (apply is no-op)", () => {
    const raw = "　　已是本地排版。\n\n　　第二段同样缩进。";
    expect(applyLocalMobileLayout(raw)).toBe(raw);
    expect(needsLocalMobileLayout(raw)).toBe(false);
  });

  it("returns true when paragraphs lack indent", () => {
    const raw = "第一段没有缩进。\n\n第二段也没有。";
    expect(needsLocalMobileLayout(raw)).toBe(true);
    expect(applyLocalMobileLayout(raw)).not.toBe(raw);
  });

  it("returns true when leading markdown chapter title would be stripped", () => {
    const raw = "# 第一章\n\n正文尚未缩进。";
    expect(needsLocalMobileLayout(raw)).toBe(true);
    expect(applyLocalMobileLayout(raw)).not.toBe(raw);
  });
});
