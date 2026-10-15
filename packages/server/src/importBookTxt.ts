import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { decodeTextBuffer } from "./training/copybooks/decodeText.js";
import { parseChapters } from "./training/copybooks/parseChapters.js";
import { COPYBOOK_MAX_BYTES } from "./training/copybooks/types.js";
import {
  createChapter,
  createNovel,
  listChapters,
  novelSummaryFromMeta,
  type NovelSummary
} from "./fsStore.js";
import { safeSlug } from "./paths.js";

export type ImportBookTxtResult = {
  book: NovelSummary;
  chapterCount: number;
  singleChapterFallback: boolean;
};

/** 去掉切片中与 title 相同的那一行（及紧随空行），避免 createChapter 再加 # 标题后重复 */
export function stripChapterHeadingFromSlice(slice: string, title: string): string {
  const lines = slice.replace(/\r\n/g, "\n").split("\n");
  const idx = lines.findIndex((l) => l.trim() === title);
  if (idx >= 0) {
    lines.splice(idx, 1);
    if (lines[idx] === "") lines.splice(idx, 1);
  }
  return lines.join("\n").trim();
}

export async function importBookTxt(
  dataDir: string,
  filename: string,
  buf: Buffer
): Promise<ImportBookTxtResult> {
  if (buf.byteLength > COPYBOOK_MAX_BYTES) throw new Error("文件超过 20MB 上限");
  if (buf.byteLength === 0) throw new Error("文件为空");

  const { text } = decodeTextBuffer(buf);
  const parsed = parseChapters(text);
  const title = filename.replace(/\.txt$/i, "").trim() || "未命名";
  const singleChapterFallback = parsed.length === 1 && parsed[0]!.title === "全文";

  const bookId = crypto.randomUUID();
  const displaySlug = safeSlug(title) || undefined;
  const meta = await createNovel(dataDir, bookId, title, undefined, { slug: displaySlug });

  try {
    for (let i = 0; i < parsed.length; i++) {
      const ch = parsed[i]!;
      const slice = text.slice(ch.start, ch.end);
      const body =
        ch.title === "全文" ? slice.trim() : stripChapterHeadingFromSlice(slice, ch.title);
      await createChapter(dataDir, bookId, ch.title, body || undefined, i + 1);
    }
  } catch (e) {
    await fs.rm(path.join(dataDir, bookId), { recursive: true, force: true });
    throw e;
  }

  const chapters = await listChapters(dataDir, bookId);
  const book = novelSummaryFromMeta(meta, chapters.length, []);
  return { book, chapterCount: chapters.length, singleChapterFallback };
}
