import fs from "node:fs/promises";
import path from "node:path";

export type BookMeta = {
  slug: string;
  title: string;
  createdAt: string;
  synopsis?: string;
};

function normalizeBookMeta(parsed: BookMeta, slugFallback: string): BookMeta {
  return {
    slug: parsed.slug ?? slugFallback,
    title: parsed.title ?? slugFallback,
    createdAt: parsed.createdAt ?? new Date(0).toISOString(),
    synopsis: typeof parsed.synopsis === "string" ? parsed.synopsis : ""
  };
}

/** 列表/接口返回：含章节数与状态（不写入 meta.json） */
export type BookSummary = BookMeta & {
  chapterCount: number;
  status: "进行中";
};

export function bookSummaryFromMeta(meta: BookMeta, chapterCount: number): BookSummary {
  return { ...meta, chapterCount, status: "进行中" };
}

async function countChapterMarkdownFiles(bookDir: string): Promise<number> {
  const chaptersDir = path.join(bookDir, "chapters");
  if (!(await exists(chaptersDir))) return 0;
  const entries = await fs.readdir(chaptersDir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith(".md")).length;
}

export type ChapterMeta = {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
};

export type StoryFile = {
  kind: "story" | "character";
  path: string;
  title: string;
};

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 章节正文文件：`0001_章节名.md`（序号递增；列表展示标题为下划线后的部分） */
const CHAPTER_FILENAME_RE = /^(\d+)_(.+)\.md$/;

function sanitizeChapterStem(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[\x00-\x1f<>:"/\\|?*\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "章节";
}

function chapterFilenameSort(a: string, b: string): number {
  const ma = a.match(CHAPTER_FILENAME_RE);
  const mb = b.match(CHAPTER_FILENAME_RE);
  if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
  if (ma && !mb) return -1;
  if (!ma && mb) return 1;
  return a.localeCompare(b, "zh-Hans-CN");
}

async function maxChapterIndex(chaptersDir: string): Promise<number> {
  let max = 0;
  const names = await fs.readdir(chaptersDir);
  for (const name of names) {
    const m = name.match(CHAPTER_FILENAME_RE);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    if (!Number.isFinite(idx) || idx < 1) continue;
    if (idx > max) max = idx;
  }
  return max;
}

async function allocateChapterFilenameExcept(
  chaptersDir: string,
  index: number,
  stem: string,
  exceptFilename: string | null
): Promise<string> {
  const prefix = String(index).padStart(4, "0");
  let n = 0;
  while (true) {
    const piece = n === 0 ? stem : `${stem}_${n}`;
    const filename = `${prefix}_${piece}.md`;
    if (exceptFilename !== null && filename === exceptFilename) return filename;
    if (!(await exists(path.join(chaptersDir, filename)))) return filename;
    n++;
  }
}

async function allocateChapterFilename(chaptersDir: string, index: number, stem: string): Promise<string> {
  return allocateChapterFilenameExcept(chaptersDir, index, stem, null);
}

function applyChapterHeadingTitle(raw: string, title: string): string {
  if (raw.startsWith("# ")) {
    const nl = raw.indexOf("\n");
    if (nl === -1) return `# ${title}\n`;
    return `# ${title}` + raw.slice(nl);
  }
  return `# ${title}\n\n` + raw;
}

function chapterMetaFromFilename(filename: string): ChapterMeta {
  const m = filename.match(CHAPTER_FILENAME_RE);
  if (m) {
    return {
      id: filename.replace(/\.md$/, ""),
      title: m[2],
      filename,
      createdAt: new Date(0).toISOString()
    };
  }
  const base = filename.replace(/\.md$/, "");
  return {
    id: base,
    title: base,
    filename,
    createdAt: new Date(0).toISOString()
  };
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function listBooks(dataDir: string): Promise<BookSummary[]> {
  await ensureDir(dataDir);
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const metas: BookSummary[] = [];

  for (const slug of dirs) {
    const metaPath = path.join(dataDir, slug, "meta.json");
    if (!(await exists(metaPath))) continue;
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const parsed = JSON.parse(raw) as BookMeta;
      const meta = normalizeBookMeta(parsed, slug);
      const chapterCount = await countChapterMarkdownFiles(path.join(dataDir, slug));
      metas.push(bookSummaryFromMeta(meta, chapterCount));
    } catch {
      // ignore broken meta
    }
  }

  metas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return metas;
}

export async function createBook(dataDir: string, slug: string, title: string) {
  await ensureDir(dataDir);
  const bookDir = path.join(dataDir, slug);
  const metaPath = path.join(bookDir, "meta.json");
  const chaptersDir = path.join(bookDir, "chapters");
  const storyDir = path.join(bookDir, "story");
  const charactersDir = path.join(storyDir, "characters");

  if (await exists(metaPath)) throw new Error(`Book already exists: ${slug}`);

  await ensureDir(chaptersDir);
  await ensureDir(charactersDir);

  const meta: BookMeta = { slug, title, createdAt: new Date().toISOString(), synopsis: "" };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

  const defaults: Array<{ rel: string; content: string }> = [
    { rel: "story/timeline.md", content: "# 时间线\n\n- \n" },
    { rel: "story/state.md", content: "# 当前状态\n\n- 当前写到：\n- 关键冲突：\n- 伏笔：\n" },
    { rel: "story/world.md", content: "# 世界观\n\n- \n" },
    { rel: "story/outline.md", content: "# 大纲\n\n## 主线\n\n- \n\n## 章节规划\n\n- \n" },
    { rel: "story/notes.md", content: "# 笔记\n\n- \n" },
    {
      rel: "story/characters/主角.md",
      content: "# 主角\n\n- 目标：\n- 动机：\n- 弱点：\n- 外貌：\n- 关系：\n"
    }
  ];
  for (const d of defaults) {
    const p = path.join(bookDir, d.rel);
    if (!(await exists(p))) {
      await ensureDir(path.dirname(p));
      await fs.writeFile(p, d.content, "utf8");
    }
  }

  return meta;
}

export async function updateBookSynopsis(dataDir: string, slug: string, synopsis: string): Promise<BookSummary> {
  const bookDir = path.join(dataDir, slug);
  const metaPath = path.join(bookDir, "meta.json");
  if (!(await exists(metaPath))) throw new Error("Not found");
  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as BookMeta;
  const meta = normalizeBookMeta(parsed, slug);
  const next: BookMeta = { ...meta, synopsis };
  await fs.writeFile(metaPath, JSON.stringify(next, null, 2), "utf8");
  const chapterCount = await countChapterMarkdownFiles(bookDir);
  return bookSummaryFromMeta(next, chapterCount);
}

export async function listChapters(dataDir: string, bookSlug: string) {
  const chaptersDir = path.join(dataDir, bookSlug, "chapters");
  await ensureDir(chaptersDir);
  const entries = await fs.readdir(chaptersDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort(chapterFilenameSort);

  return files.map((filename) => chapterMetaFromFilename(filename));
}

export async function createChapter(dataDir: string, bookSlug: string, title: string, content?: string) {
  const chaptersDir = path.join(dataDir, bookSlug, "chapters");
  await ensureDir(chaptersDir);

  const index = (await maxChapterIndex(chaptersDir)) + 1;
  const stem = sanitizeChapterStem(title);
  const filename = await allocateChapterFilename(chaptersDir, index, stem);
  const filePath = path.join(chaptersDir, filename);
  const id = filename.replace(/\.md$/, "");

  const body = `# ${title}\n\n` + (content?.trim() ? `${content.trim()}\n` : "");
  await fs.writeFile(filePath, body, "utf8");
  return { id, title, filename, createdAt: new Date().toISOString() } satisfies ChapterMeta;
}

export async function readChapter(dataDir: string, bookSlug: string, filename: string) {
  const filePath = path.join(dataDir, bookSlug, "chapters", filename);
  return await fs.readFile(filePath, "utf8");
}

export async function updateChapter(dataDir: string, bookSlug: string, filename: string, newContent: string) {
  const filePath = path.join(dataDir, bookSlug, "chapters", filename);
  await fs.writeFile(filePath, newContent, "utf8");
}

export async function deleteChapter(dataDir: string, bookSlug: string, filename: string) {
  const safeName = path.basename(filename);
  if (safeName !== filename || !safeName.endsWith(".md")) {
    throw new Error("无效的章节文件名");
  }
  const chaptersDir = path.resolve(path.join(dataDir, bookSlug, "chapters"));
  const filePath = path.resolve(path.join(chaptersDir, safeName));
  const boundary = chaptersDir.endsWith(path.sep) ? chaptersDir : `${chaptersDir}${path.sep}`;
  if (!filePath.startsWith(boundary)) {
    throw new Error("无效的章节路径");
  }
  if (!(await exists(filePath))) throw new Error("章节不存在");
  await fs.unlink(filePath);
}

export async function renameChapterTitle(
  dataDir: string,
  bookSlug: string,
  oldFilename: string,
  newTitle: string
): Promise<ChapterMeta> {
  const trimmed = newTitle.trim();
  if (!trimmed) throw new Error("标题不能为空");

  const m = oldFilename.match(CHAPTER_FILENAME_RE);
  if (!m) throw new Error("仅支持「序号_标题.md」格式的章节改名");

  const indexNum = parseInt(m[1], 10);
  const chaptersDir = path.join(dataDir, bookSlug, "chapters");
  const oldPath = path.join(chaptersDir, oldFilename);
  if (!(await exists(oldPath))) throw new Error("章节不存在");

  const stem = sanitizeChapterStem(trimmed);
  const newFilename = await allocateChapterFilenameExcept(chaptersDir, indexNum, stem, oldFilename);

  const raw = await fs.readFile(oldPath, "utf8");
  const nextBody = applyChapterHeadingTitle(raw, trimmed);

  if (newFilename === oldFilename) {
    await fs.writeFile(oldPath, nextBody, "utf8");
    return chapterMetaFromFilename(oldFilename);
  }

  const newPath = path.join(chaptersDir, newFilename);
  if (await exists(newPath)) throw new Error("目标文件已存在");

  await fs.writeFile(newPath, nextBody, "utf8");
  await fs.unlink(oldPath);

  return chapterMetaFromFilename(newFilename);
}

export async function listStoryFiles(dataDir: string, bookSlug: string) {
  const bookDir = path.join(dataDir, bookSlug);
  const storyDir = path.join(bookDir, "story");
  const charactersDir = path.join(storyDir, "characters");
  await ensureDir(charactersDir);

  const storyEntries = await fs.readdir(storyDir, { withFileTypes: true });
  const storyFiles: StoryFile[] = storyEntries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => ({ kind: "story", path: `story/${e.name}`, title: e.name.replace(/\.md$/, "") }))
    .sort((a, b) => a.path.localeCompare(b.path, "zh-Hans-CN"));

  const charEntries = await fs.readdir(charactersDir, { withFileTypes: true });
  const charFiles: StoryFile[] = charEntries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => ({
      kind: "character",
      path: `story/characters/${e.name}`,
      title: e.name.replace(/\.md$/, "")
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "zh-Hans-CN"));

  return { storyFiles, charFiles };
}

export async function readStoryFile(dataDir: string, bookSlug: string, relPath: string) {
  const filePath = path.join(dataDir, bookSlug, relPath);
  return await fs.readFile(filePath, "utf8");
}

export async function updateStoryFile(dataDir: string, bookSlug: string, relPath: string, content: string) {
  const filePath = path.join(dataDir, bookSlug, relPath);
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function createCharacterCard(dataDir: string, bookSlug: string, name: string) {
  const safeName = name.trim() || "未命名角色";
  const relPath = `story/characters/${safeName}.md`;
  const filePath = path.join(dataDir, bookSlug, relPath);
  if (await exists(filePath)) throw new Error("Character already exists");
  await ensureDir(path.dirname(filePath));
  const body = `# ${safeName}\n\n- 目标：\n- 动机：\n- 弱点：\n- 外貌：\n- 关系：\n`;
  await fs.writeFile(filePath, body, "utf8");
  return { relPath };
}

