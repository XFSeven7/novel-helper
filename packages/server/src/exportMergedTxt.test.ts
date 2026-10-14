import { describe, expect, it } from "vitest";
import {
  buildMergedBookTxt,
  sanitizeExportFilename,
  stripLeadingTitleHeading
} from "./exportMergedTxt.js";

describe("stripLeadingTitleHeading", () => {
  it("removes leading # title and following blank line", () => {
    expect(stripLeadingTitleHeading("# 开端\n\n正文一段", "开端")).toBe("正文一段");
  });

  it("leaves body unchanged when heading does not match title", () => {
    expect(stripLeadingTitleHeading("# 别的\n\n正文", "开端")).toBe("# 别的\n\n正文");
  });
});

describe("buildMergedBookTxt", () => {
  it("joins chapters with blank line after title and two blank lines between chapters", () => {
    const text = buildMergedBookTxt([
      { chapterNo: 1, title: "开端", content: "# 开端\n\n甲" },
      { chapterNo: 2, title: "转折", content: "# 转折\n\n乙" }
    ]);
    expect(text).toBe("第1章 开端\n\n甲\n\n\n第2章 转折\n\n乙");
  });

  it("keeps caller-provided order (even if numbers look descending)", () => {
    const text = buildMergedBookTxt([
      { chapterNo: 2, title: "后", content: "B" },
      { chapterNo: 1, title: "前", content: "A" }
    ]);
    expect(text.startsWith("第2章 后\n\n")).toBe(true);
  });
});

describe("sanitizeExportFilename", () => {
  it("strips unsafe chars and adds .txt", () => {
    expect(sanitizeExportFilename('我的/书:名*')).toBe("我的书名.txt");
  });

  it("falls back when empty", () => {
    expect(sanitizeExportFilename("   ")).toBe("book.txt");
  });
});
