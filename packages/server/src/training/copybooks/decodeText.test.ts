import { describe, expect, it } from "vitest";
import { decodeTextBuffer } from "./decodeText.js";

describe("decodeTextBuffer", () => {
  it("decodes utf-8", () => {
    const buf = Buffer.from("第1章 测试\n正文", "utf8");
    expect(decodeTextBuffer(buf)).toEqual({ text: "第1章 测试\n正文", encoding: "utf-8" });
  });
});
