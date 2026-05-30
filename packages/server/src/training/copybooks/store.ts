import fs from "node:fs/promises";
import path from "node:path";
import { newTrainingId, trainingDir } from "../store.js";
import { decodeTextBuffer } from "./decodeText.js";
import { parseChapters } from "./parseChapters.js";
import type {
  CopybookChapterProgress,
  CopybookIndexEntry,
  CopybookMeta,
  CopybookProgressFile,
  CopybookSession
} from "./types.js";
import { COPYBOOK_MAX_BYTES } from "./types.js";

export function copybooksDir(dataDir: string) {
  return path.join(trainingDir(dataDir), "copybooks");
}

function bookDir(dataDir: string, bookId: string) {
  return path.join(copybooksDir(dataDir), bookId);
}

function indexPath(dataDir: string) {
  return path.join(copybooksDir(dataDir), "index.json");
}

function emptyProgress(): CopybookProgressFile {
  return { chapters: {} };
}

function defaultChapterProgress(
  draftText: string,
  prev: CopybookChapterProgress | undefined
): CopybookChapterProgress {
  const status: CopybookChapterProgress["status"] = !draftText
    ? prev?.status === "completed"
      ? "completed"
      : "not_started"
    : prev?.status === "completed"
      ? "completed"
      : "in_progress";
  return {
    draftText,
    cursorPos: prev?.cursorPos ?? 0,
    status,
    bestAccuracy: prev?.bestAccuracy ?? null,
    editedSourceText: prev?.editedSourceText,
    sessions: prev?.sessions ?? []
  };
}

async function readIndex(dataDir: string): Promise<{ books: CopybookIndexEntry[] }> {
  try {
    return JSON.parse(await fs.readFile(indexPath(dataDir), "utf8")) as { books: CopybookIndexEntry[] };
  } catch {
    return { books: [] };
  }
}

async function writeIndex(dataDir: string, index: { books: CopybookIndexEntry[] }) {
  await fs.mkdir(copybooksDir(dataDir), { recursive: true });
  await fs.writeFile(indexPath(dataDir), JSON.stringify(index, null, 2), "utf8");
}

export async function readCopybookMeta(dataDir: string, bookId: string): Promise<CopybookMeta | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(bookDir(dataDir, bookId), "meta.json"), "utf8")) as CopybookMeta;
  } catch {
    return null;
  }
}

export async function readCopybookProgress(dataDir: string, bookId: string): Promise<CopybookProgressFile> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(bookDir(dataDir, bookId), "progress.json"), "utf8")
    ) as CopybookProgressFile;
  } catch {
    return emptyProgress();
  }
}

async function writeCopybookProgress(dataDir: string, bookId: string, progress: CopybookProgressFile) {
  await fs.writeFile(
    path.join(bookDir(dataDir, bookId), "progress.json"),
    JSON.stringify(progress, null, 2),
    "utf8"
  );
}

export type CopybookChapterSummary = {
  index: number;
  title: string;
  status: CopybookChapterProgress["status"];
};

export type CopybookListItem = CopybookIndexEntry & {
  chapters: CopybookChapterSummary[];
};

export async function listCopybooksWithProgress(dataDir: string): Promise<{ books: CopybookListItem[] }> {
  const index = await readIndex(dataDir);
  const books: CopybookListItem[] = [];
  for (const entry of index.books) {
    const meta = await readCopybookMeta(dataDir, entry.id);
    const progress = await readCopybookProgress(dataDir, entry.id);
    if (!meta) continue;
    const chapters: CopybookChapterSummary[] = meta.chapters.map((ch) => {
      const p = progress.chapters[String(ch.index)];
      return {
        index: ch.index,
        title: ch.title,
        status: p?.status ?? "not_started"
      };
    });
    books.push({ ...entry, chapters });
  }
  return { books };
}

export async function importCopybook(
  dataDir: string,
  filename: string,
  buf: Buffer
): Promise<CopybookListItem> {
  if (buf.byteLength > COPYBOOK_MAX_BYTES) throw new Error("文件超过 20MB 上限");
  if (buf.byteLength === 0) throw new Error("文件为空");
  const { text, encoding } = decodeTextBuffer(buf);
  const chapters = parseChapters(text);
  const id = newTrainingId("cb");
  const title = filename.replace(/\.txt$/i, "") || "未命名";
  const importedAt = new Date().toISOString();
  const meta: CopybookMeta = {
    id,
    title,
    filename,
    importedAt,
    encoding,
    charCount: text.length,
    chapters
  };
  const dir = bookDir(dataDir, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "source.txt"), text, "utf8");
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  await fs.writeFile(path.join(dir, "progress.json"), JSON.stringify(emptyProgress(), null, 2), "utf8");

  const entry: CopybookIndexEntry = {
    id,
    title,
    filename,
    importedAt,
    charCount: text.length,
    chapterCount: chapters.length
  };
  const index = await readIndex(dataDir);
  index.books.unshift(entry);
  await writeIndex(dataDir, index);

  return {
    ...entry,
    chapters: chapters.map((ch) => ({
      index: ch.index,
      title: ch.title,
      status: "not_started" as const
    }))
  };
}

export async function readChapterText(
  dataDir: string,
  bookId: string,
  index: number
): Promise<{ title: string; text: string }> {
  const meta = await readCopybookMeta(dataDir, bookId);
  if (!meta) throw new Error("书目不存在");
  const chapter = meta.chapters[index];
  if (!chapter) throw new Error("章节不存在");
  const progress = await readCopybookProgress(dataDir, bookId);
  const edited = progress.chapters[String(index)]?.editedSourceText;
  if (edited != null) {
    return { title: chapter.title, text: edited };
  }
  const source = await fs.readFile(path.join(bookDir(dataDir, bookId), "source.txt"), "utf8");
  return {
    title: chapter.title,
    text: source.slice(chapter.start, chapter.end)
  };
}

export async function saveChapterSource(
  dataDir: string,
  bookId: string,
  index: number,
  sourceText: string
): Promise<CopybookChapterProgress> {
  const meta = await readCopybookMeta(dataDir, bookId);
  if (!meta) throw new Error("书目不存在");
  if (!meta.chapters[index]) throw new Error("章节不存在");
  const progress = await readCopybookProgress(dataDir, bookId);
  const key = String(index);
  const prev = progress.chapters[key];
  const next = defaultChapterProgress(prev?.draftText ?? "", prev);
  next.editedSourceText = sourceText;
  progress.chapters[key] = next;
  await writeCopybookProgress(dataDir, bookId, progress);
  return next;
}

export async function saveChapterProgress(
  dataDir: string,
  bookId: string,
  index: number,
  input: { draftText: string; cursorPos: number }
): Promise<CopybookChapterProgress> {
  const meta = await readCopybookMeta(dataDir, bookId);
  if (!meta) throw new Error("书目不存在");
  if (!meta.chapters[index]) throw new Error("章节不存在");
  const progress = await readCopybookProgress(dataDir, bookId);
  const key = String(index);
  const prev = progress.chapters[key];
  const next = defaultChapterProgress(input.draftText, prev);
  next.cursorPos = input.cursorPos;
  progress.chapters[key] = next;
  await writeCopybookProgress(dataDir, bookId, progress);
  return next;
}

export async function completeChapter(
  dataDir: string,
  bookId: string,
  index: number,
  input: {
    draftText: string;
    durationSec?: number;
  }
): Promise<CopybookProgressFile> {
  const meta = await readCopybookMeta(dataDir, bookId);
  if (!meta) throw new Error("书目不存在");
  const chapter = meta.chapters[index];
  if (!chapter) throw new Error("章节不存在");
  const { text: chapterText } = await readChapterText(dataDir, bookId, index);
  const progress = await readCopybookProgress(dataDir, bookId);
  const key = String(index);
  const prev = progress.chapters[key];
  const session: CopybookSession = {
    completedAt: new Date().toISOString(),
    durationSec: input.durationSec ?? 0,
    accuracy: 0,
    errorCount: 0,
    charCount: chapterText.length
  };
  progress.chapters[key] = {
    draftText: input.draftText,
    cursorPos: input.draftText.length,
    status: "completed",
    bestAccuracy: prev?.bestAccuracy ?? null,
    editedSourceText: prev?.editedSourceText,
    sessions: [...(prev?.sessions ?? []), session]
  };
  await writeCopybookProgress(dataDir, bookId, progress);
  return progress;
}

export async function listCopybooks(dataDir: string) {
  return listCopybooksWithProgress(dataDir);
}
