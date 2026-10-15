import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importBookTxt, stripChapterHeadingFromSlice } from "./importBookTxt.js";
import { listChapters, readChapter } from "./fsStore.js";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nh-import-book-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("stripChapterHeadingFromSlice", () => {
  it("removes title line once", () => {
    expect(stripChapterHeadingFromSlice("第1章 A\nhello\n", "第1章 A")).toBe("hello");
  });
});

describe("importBookTxt", () => {
  it("splits chapters and writes md without duplicate heading", async () => {
    const buf = Buffer.from("第1章 开端\n甲\n第2章 发展\n乙", "utf8");
    const res = await importBookTxt(tmp, "演示.txt", buf);
    expect(res.book.title).toBe("演示");
    expect(res.chapterCount).toBe(2);
    expect(res.singleChapterFallback).toBe(false);
    const chapters = await listChapters(tmp, res.book.bookId);
    expect(chapters).toHaveLength(2);
    const raw0 = await readChapter(tmp, res.book.bookId, chapters[0]!.filename);
    expect(raw0.startsWith("# 第1章 开端\n")).toBe(true);
    expect(raw0).toContain("甲");
    expect(raw0.match(/第1章 开端/g)?.length).toBe(1);
  });

  it("falls back to single 全文 chapter", async () => {
    const buf = Buffer.from("无章节标题的正文", "utf8");
    const res = await importBookTxt(tmp, "plain.txt", buf);
    expect(res.chapterCount).toBe(1);
    expect(res.singleChapterFallback).toBe(true);
    const chapters = await listChapters(tmp, res.book.bookId);
    expect(chapters[0]!.title).toBe("全文");
  });

  it("rejects oversize buffer before creating book", async () => {
    const buf = Buffer.alloc(20 * 1024 * 1024 + 1);
    await expect(importBookTxt(tmp, "big.txt", buf)).rejects.toThrow(/20MB/);
    const entries = await fs.readdir(tmp);
    expect(entries).toHaveLength(0);
  });
});
