import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  importCopybook,
  listCopybooks,
  readChapterText,
  readCopybookProgress,
  saveChapterProgress
} from "./store.js";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nh-copybook-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("copybook store", () => {
  it("imports txt and reads chapter", async () => {
    const buf = Buffer.from("第1章 A\nhello\n第2章 B\nworld", "utf8");
    const book = await importCopybook(tmp, "demo.txt", buf);
    expect(book.chapterCount).toBe(2);
    const ch0 = await readChapterText(tmp, book.id, 0);
    expect(ch0.text).toContain("hello");
  });

  it("saves progress", async () => {
    const buf = Buffer.from("第1章 A\nabc", "utf8");
    const book = await importCopybook(tmp, "p.txt", buf);
    await saveChapterProgress(tmp, book.id, 0, { draftText: "ab", cursorPos: 2 });
    const prog = await readCopybookProgress(tmp, book.id);
    expect(prog.chapters["0"]!.status).toBe("in_progress");
    expect(prog.chapters["0"]!.draftText).toBe("ab");
  });

  it("lists books with chapter summaries", async () => {
    const buf = Buffer.from("第1章 A\nx", "utf8");
    await importCopybook(tmp, "one.txt", buf);
    const { books } = await listCopybooks(tmp);
    expect(books).toHaveLength(1);
    expect(books[0]!.chapters[0]!.status).toBe("not_started");
  });
});
