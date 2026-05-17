import fs from "node:fs/promises";
import path from "node:path";
import {
  approximateWordCount,
  chapterContentSha1,
  listChapters,
  readChapter,
  updateChapter
} from "./fsStore.js";

export type ChapterVersionMeta = {
  id: string;
  createdAt: string;
  label: string;
  wordCount: number;
  contentHash: string;
  source: "manual";
};

export type ChapterVersionIndex = {
  version: 1;
  chapterFilename: string;
  updatedAt: string;
  versions: ChapterVersionMeta[];
};

export class ChapterVersionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function safeChapterFilename(filename: string) {
  const base = path.basename(filename);
  if (base !== filename || !base.endsWith(".md")) {
    throw new ChapterVersionError("无效的章节文件名", 400);
  }
  return base;
}

function chapterVersionsRoot(dataDir: string, slug: string, filename: string) {
  return path.join(dataDir, slug, "meta", "chapterVersions", safeChapterFilename(filename));
}

function indexPath(dataDir: string, slug: string, filename: string) {
  return path.join(chapterVersionsRoot(dataDir, slug, filename), "index.json");
}

function snapshotPath(dataDir: string, slug: string, filename: string, versionId: string) {
  const safeId = path.basename(versionId);
  if (safeId !== versionId || safeId.includes("..")) {
    throw new ChapterVersionError("无效的版本 id", 400);
  }
  return path.join(chapterVersionsRoot(dataDir, slug, filename), `${safeId}.md`);
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function formatVersionTimestamp(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function makeVersionId(contentHash: string) {
  return `${formatVersionTimestamp()}-${contentHash.slice(0, 7)}`;
}

function emptyIndex(chapterFilename: string): ChapterVersionIndex {
  return {
    version: 1,
    chapterFilename,
    updatedAt: new Date().toISOString(),
    versions: []
  };
}

export async function readChapterVersionIndex(
  dataDir: string,
  slug: string,
  filename: string
): Promise<ChapterVersionIndex> {
  const fn = safeChapterFilename(filename);
  const p = indexPath(dataDir, slug, fn);
  if (!(await exists(p))) return emptyIndex(fn);
  const raw = await fs.readFile(p, "utf8");
  const parsed = JSON.parse(raw) as ChapterVersionIndex;
  return {
    version: 1,
    chapterFilename: fn,
    updatedAt: String(parsed?.updatedAt || new Date().toISOString()),
    versions: Array.isArray(parsed?.versions) ? parsed.versions : []
  };
}

async function writeChapterVersionIndex(dataDir: string, slug: string, index: ChapterVersionIndex) {
  const root = chapterVersionsRoot(dataDir, slug, index.chapterFilename);
  await fs.mkdir(root, { recursive: true });
  const next: ChapterVersionIndex = {
    ...index,
    version: 1,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(root, "index.json"), JSON.stringify(next, null, 2), "utf8");
}

export async function listChapterVersions(dataDir: string, slug: string, filename: string) {
  const index = await readChapterVersionIndex(dataDir, slug, filename);
  const latestContentHash = index.versions[0]?.contentHash ?? null;
  return { versions: index.versions, latestContentHash };
}

export async function createChapterVersion(
  dataDir: string,
  slug: string,
  filename: string,
  input: { label?: string }
): Promise<ChapterVersionMeta> {
  const fn = safeChapterFilename(filename);
  const content = await readChapter(dataDir, slug, fn);
  const contentHash = chapterContentSha1(content);
  const index = await readChapterVersionIndex(dataDir, slug, fn);
  const latest = index.versions[0];
  if (latest && latest.contentHash === contentHash) {
    throw new ChapterVersionError("与上次存稿相同", 409);
  }

  const id = makeVersionId(contentHash);
  const createdAt = new Date().toISOString();
  const meta: ChapterVersionMeta = {
    id,
    createdAt,
    label: String(input.label ?? "").trim(),
    wordCount: approximateWordCount(content),
    contentHash,
    source: "manual"
  };

  const snap = snapshotPath(dataDir, slug, fn, id);
  await fs.mkdir(path.dirname(snap), { recursive: true });
  await fs.writeFile(snap, content, "utf8");

  index.versions.unshift(meta);
  await writeChapterVersionIndex(dataDir, slug, index);
  return meta;
}

export async function readChapterVersionContent(
  dataDir: string,
  slug: string,
  filename: string,
  versionId: string
): Promise<{ version: ChapterVersionMeta; content: string }> {
  const fn = safeChapterFilename(filename);
  const index = await readChapterVersionIndex(dataDir, slug, fn);
  const version = index.versions.find((v) => v.id === versionId);
  if (!version) throw new ChapterVersionError("版本不存在", 404);
  const p = snapshotPath(dataDir, slug, fn, versionId);
  if (!(await exists(p))) throw new ChapterVersionError("版本不存在", 404);
  const content = await fs.readFile(p, "utf8");
  return { version, content };
}

export async function restoreChapterVersion(
  dataDir: string,
  slug: string,
  filename: string,
  versionId: string
): Promise<{ wordCount: number }> {
  const { content } = await readChapterVersionContent(dataDir, slug, filename, versionId);
  const fn = safeChapterFilename(filename);
  await updateChapter(dataDir, slug, fn, content);
  return { wordCount: approximateWordCount(content) };
}

export async function listChapterFilenamesOutOfSyncWithLatestDraft(
  dataDir: string,
  slug: string
): Promise<string[]> {
  const chapters = await listChapters(dataDir, slug);
  const out: string[] = [];
  for (const ch of chapters) {
    const fn = ch.filename;
    const index = await readChapterVersionIndex(dataDir, slug, fn);
    if (!index.versions.length) {
      out.push(fn);
      continue;
    }
    try {
      const raw = await readChapter(dataDir, slug, fn);
      const currentHash = chapterContentSha1(raw);
      if (currentHash !== index.versions[0].contentHash) out.push(fn);
    } catch {
      out.push(fn);
    }
  }
  return out;
}

export async function renameChapterVersionsDir(
  dataDir: string,
  slug: string,
  oldFilename: string,
  newFilename: string
) {
  const oldFn = safeChapterFilename(oldFilename);
  const newFn = safeChapterFilename(newFilename);
  if (oldFn === newFn) return;
  const oldRoot = chapterVersionsRoot(dataDir, slug, oldFn);
  if (!(await exists(oldRoot))) return;
  const newRoot = chapterVersionsRoot(dataDir, slug, newFn);
  if (await exists(newRoot)) {
    throw new Error("目标章节历史目录已存在");
  }
  await fs.rename(oldRoot, newRoot);
  const index = await readChapterVersionIndex(dataDir, slug, newFn);
  index.chapterFilename = newFn;
  await writeChapterVersionIndex(dataDir, slug, index);
}

export async function deleteChapterVersionsDir(dataDir: string, slug: string, filename: string) {
  const fn = safeChapterFilename(filename);
  const root = chapterVersionsRoot(dataDir, slug, fn);
  if (!(await exists(root))) return;
  await fs.rm(root, { recursive: true, force: true });
}
