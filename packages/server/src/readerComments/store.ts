import fs from "node:fs/promises";
import path from "node:path";
import type { ChapterReaderCommentsFile } from "./types.js";

function commentsPath(dataDir: string, bookId: string, chapterFilename: string) {
  return path.join(dataDir, bookId, "meta", "reader-comments", chapterFilename.replace(/\.md$/i, "") + ".json");
}

export async function readChapterComments(
  dataDir: string,
  bookId: string,
  chapterFilename: string
): Promise<ChapterReaderCommentsFile | null> {
  try {
    return JSON.parse(await fs.readFile(commentsPath(dataDir, bookId, chapterFilename), "utf8")) as ChapterReaderCommentsFile;
  } catch {
    return null;
  }
}

export async function writeChapterComments(
  dataDir: string,
  bookId: string,
  chapterFilename: string,
  file: ChapterReaderCommentsFile
): Promise<void> {
  const dir = path.dirname(commentsPath(dataDir, bookId, chapterFilename));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(commentsPath(dataDir, bookId, chapterFilename), JSON.stringify(file, null, 2), "utf8");
}
