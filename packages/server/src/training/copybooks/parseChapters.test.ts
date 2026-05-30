import { describe, expect, it } from "vitest";
import { parseChapters } from "./parseChapters.js";

describe("parseChapters", () => {
  it("splits by 第N章 headings", () => {
    const text = "简介\n\n第1章 开端\naaa\n\n第2章 冲突\nbbb";
    const chapters = parseChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe("第1章 开端");
    expect(chapters[0]!.start).toBe(0);
    expect(text.slice(chapters[0]!.start, chapters[0]!.end)).toContain("简介");
    expect(text.slice(chapters[0]!.start, chapters[0]!.end)).toContain("aaa");
    expect(chapters[1]!.title).toBe("第2章 冲突");
    expect(text.slice(chapters[1]!.start, chapters[1]!.end)).toBe("第2章 冲突\nbbb");
  });

  it("falls back to single chapter when no headings", () => {
    const text = "只有一段正文";
    const chapters = parseChapters(text);
    expect(chapters).toEqual([{ index: 0, title: "全文", start: 0, end: text.length }]);
  });
});
