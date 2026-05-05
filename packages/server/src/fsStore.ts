import fs from "node:fs/promises";
import path from "node:path";

export type NovelMeta = {
  slug: string;
  title: string;
  createdAt: string;
  /** 书籍简介（写入 meta.json；旧数据可无此字段） */
  synopsis?: string;
  /** 软删除：标记该书已废弃（仍保留本地目录与文件） */
  abandoned?: boolean;
  abandonedAt?: string;
};

function normalizeNovelMeta(parsed: NovelMeta, slugFallback: string): NovelMeta {
  return {
    slug: parsed.slug ?? slugFallback,
    title: parsed.title ?? slugFallback,
    createdAt: parsed.createdAt ?? new Date(0).toISOString(),
    synopsis: typeof parsed.synopsis === "string" ? parsed.synopsis : "",
    abandoned: Boolean((parsed as any).abandoned),
    abandonedAt: typeof (parsed as any).abandonedAt === "string" ? (parsed as any).abandonedAt : ""
  };
}

/** 列表/接口返回：含章节数与状态（不写入 meta.json） */
export type NovelSummary = NovelMeta & {
  chapterCount: number;
  status: "进行中";
  /** 介于 1..最大序号之间、文件名符合「序号_标题.md」但未出现的序号（如删了第 4 章则为 [4]） */
  missingChapterIndexes: number[];
};

export function novelSummaryFromMeta(
  meta: NovelMeta,
  chapterCount: number,
  missingChapterIndexes: number[] = []
): NovelSummary {
  return { ...meta, chapterCount, status: "进行中", missingChapterIndexes };
}

async function countChapterMarkdownFiles(novelDir: string): Promise<number> {
  const chaptersDir = path.join(novelDir, "chapters");
  if (!(await exists(chaptersDir))) return 0;
  const entries = await fs.readdir(chaptersDir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith(".md")).length;
}

export type ChapterMeta = {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  /** 与 UI 一致的近似字数：中文字符数 + 英文单词数 */
  wordCount: number;
};

export type StoryFile = {
  kind: "story" | "character";
  path: string; // 相对 book/<slug>/ 的路径，例如 story/timeline.md 或 story/characters/主角.md
  title: string;
  /** 仅角色卡可能包含（来自 markdown 顶部 frontmatter） */
  role?: string;
  /** 仅角色卡可能包含（来自 markdown 顶部 frontmatter） */
  tags?: string[];
};

export type AuditRun = {
  chapter: {
    filename: string;
    id: string;
    title: string;
    wordCount: number;
    auditedAt: string;
  };
  gistL1: string;
  entities: {
    characters: Array<{
      name: string;
      newOrExisting: "new" | "existing" | "unknown";
      role?: string;
      tags?: string[];
      state?: Record<string, any>;
      evidenceQuotes?: string[];
    }>;
    events: Array<Record<string, any>>;
  };
  consistencyChecks: Array<Record<string, any>>;
  causalAnchors: { setups: any[]; payoffs: any[] };
  impactAnalysis: Array<{ item: string; impactScore: number; why: string; futureImplications: string[] }>;
  compression: { l2Pruning: any; mergeCandidates: any };
  ledgerUpdates: { openLoops: any[]; closedLoops: any[] };
  uiInjection: { spotlightCharacters: string[]; spotlightTags: string[] };
};

export type TimelineCompressionSuggestion = {
  startChapter: number;
  endChapter: number;
  why: string;
};

export type TimelineCompressedRange = {
  startChapter: number;
  endChapter: number;
  summary: string;
  lastCompressedAt: string;
};

export type TimelineEvent = {
  id: string;
  title: string;
  /** 事件发生范围；单章也用相同表达 */
  startChapter: number;
  endChapter: number;
  summary: string;
  status: "open" | "done";
  updatedAt: string;
};

export type TimelineIndex = {
  version: 1;
  updatedAt: string;
  chapters: Array<{
    chapter: number;
    filename: string;
    title: string;
    auditedAt: string;
    gistL1: string;
  }>;
  compressedRanges: TimelineCompressedRange[];
  events: TimelineEvent[];
  compressionSuggestions: TimelineCompressionSuggestion[];
  manual: {
    /** 人工标记完成的事件 id 集合（覆盖模型/自动状态） */
    doneEventIds: string[];
  };
};

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function auditDir(dataDir: string, novelSlug: string) {
  return path.join(dataDir, novelSlug, "meta", "audit");
}

function timelineIndexPath(dataDir: string, novelSlug: string) {
  return path.join(auditDir(dataDir, novelSlug), "timelineIndex.json");
}

function storyTimelinePath(dataDir: string, novelSlug: string) {
  return path.join(dataDir, novelSlug, "story", "timeline.md");
}

function parseChapterNumberFromFilename(filename: string): number {
  const m = filename.match(CHAPTER_FILENAME_RE);
  if (!m) return NaN;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : NaN;
}

export async function readTimelineIndex(dataDir: string, novelSlug: string): Promise<TimelineIndex> {
  const p = timelineIndexPath(dataDir, novelSlug);
  if (!(await exists(p))) {
    return {
      version: 1,
      updatedAt: "",
      chapters: [],
      compressedRanges: [],
      events: [],
      compressionSuggestions: [],
      manual: { doneEventIds: [] }
    };
  }
  const raw = await fs.readFile(p, "utf8");
  const parsed = JSON.parse(raw) as any;
  return {
    version: 1,
    updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "",
    chapters: Array.isArray(parsed?.chapters) ? parsed.chapters : [],
    compressedRanges: Array.isArray(parsed?.compressedRanges) ? parsed.compressedRanges : [],
    events: Array.isArray(parsed?.events) ? parsed.events : [],
    compressionSuggestions: Array.isArray(parsed?.compressionSuggestions) ? parsed.compressionSuggestions : [],
    manual: {
      doneEventIds: Array.isArray(parsed?.manual?.doneEventIds) ? parsed.manual.doneEventIds : []
    }
  };
}

export async function writeTimelineIndex(dataDir: string, novelSlug: string, idx: TimelineIndex) {
  const dir = auditDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = timelineIndexPath(dataDir, novelSlug);
  await fs.writeFile(p, JSON.stringify(idx, null, 2), "utf8");
}

function renderTimelineMarkdown(idx: TimelineIndex): string {
  const doneIds = new Set(idx.manual?.doneEventIds ?? []);
  const events = (idx.events ?? []).filter((e) => (e?.status ?? "open") !== "done" && !doneIds.has(String(e?.id)));
  const sortedChapters = [...(idx.chapters ?? [])].sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
  const ranges = [...(idx.compressedRanges ?? [])].sort((a, b) => a.startChapter - b.startChapter);

  const lines: string[] = ["# 时间线", ""];

  lines.push("## 章节摘要", "");
  if (!sortedChapters.length) {
    lines.push("- （暂无摘要）", "");
  } else {
    for (const c of sortedChapters) {
      const n = c.chapter ?? parseChapterNumberFromFilename(String(c.filename || ""));
      const title = String(c.title || c.filename || "");
      const gist = String(c.gistL1 || "").trim();
      lines.push(`- 第 ${n} 章 · ${title}${gist ? `：${gist}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## 区间压缩摘要", "");
  if (!ranges.length) {
    lines.push("- （暂无压缩区间）", "");
  } else {
    for (const r of ranges) {
      const sum = String(r.summary || "").trim();
      lines.push(`- 第 ${r.startChapter}-${r.endChapter} 章：${sum || "（空）"}`);
    }
    lines.push("");
  }

  lines.push("## 关键事件（未完成）", "");
  if (!events.length) {
    lines.push("- （暂无）", "");
  } else {
    for (const e of events) {
      const range = e.startChapter === e.endChapter ? `第 ${e.startChapter} 章` : `第 ${e.startChapter}-${e.endChapter} 章`;
      const title = String(e.title || "").trim() || "事件";
      const sum = String(e.summary || "").trim();
      lines.push(`- ${range} · ${title}${sum ? `：${sum}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## 推荐压缩区间", "");
  if (!(idx.compressionSuggestions ?? []).length) {
    lines.push("- （暂无）", "");
  } else {
    for (const s of idx.compressionSuggestions) {
      lines.push(`- 建议压缩 第 ${s.startChapter}-${s.endChapter} 章：${String(s.why || "").trim() || "—"}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeStoryTimelineMarkdownFromIndex(dataDir: string, novelSlug: string, idx: TimelineIndex) {
  const p = storyTimelinePath(dataDir, novelSlug);
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, renderTimelineMarkdown(idx), "utf8");
}

export async function writeAuditRun(dataDir: string, novelSlug: string, chapterFilename: string, run: AuditRun) {
  const dir = path.join(auditDir(dataDir, novelSlug), "auditRuns");
  await ensureDir(dir);
  const p = path.join(dir, `${chapterFilename}.json`);
  await fs.writeFile(p, JSON.stringify(run, null, 2), "utf8");
}

export async function readAuditRun(dataDir: string, novelSlug: string, chapterFilename: string): Promise<AuditRun | null> {
  const p = path.join(auditDir(dataDir, novelSlug), "auditRuns", `${chapterFilename}.json`);
  if (!(await exists(p))) return null;
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw) as AuditRun;
}

export async function readAuditLedger(dataDir: string, novelSlug: string): Promise<any> {
  const p = path.join(auditDir(dataDir, novelSlug), "karmaLedger.json");
  if (!(await exists(p))) return { openLoops: [], closedLoops: [], updatedAt: "" };
  return JSON.parse(await fs.readFile(p, "utf8"));
}

export async function writeAuditLedger(dataDir: string, novelSlug: string, ledger: any) {
  const dir = auditDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = path.join(dir, "karmaLedger.json");
  await fs.writeFile(p, JSON.stringify(ledger, null, 2), "utf8");
}

export async function readAuditCharactersIndex(dataDir: string, novelSlug: string): Promise<any> {
  const p = path.join(auditDir(dataDir, novelSlug), "charactersIndex.json");
  if (!(await exists(p))) return { characters: [], hiddenNames: [], updatedAt: "" };
  const parsed = JSON.parse(await fs.readFile(p, "utf8"));
  if (parsed && typeof parsed === "object") {
    if (!Array.isArray((parsed as any).characters)) (parsed as any).characters = [];
    if (!Array.isArray((parsed as any).hiddenNames)) (parsed as any).hiddenNames = [];
    if (typeof (parsed as any).updatedAt !== "string") (parsed as any).updatedAt = "";
  }
  return parsed;
}

export async function writeAuditCharactersIndex(dataDir: string, novelSlug: string, idx: any) {
  const dir = auditDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = path.join(dir, "charactersIndex.json");
  await fs.writeFile(p, JSON.stringify(idx, null, 2), "utf8");
}

export async function deleteNovel(dataDir: string, slug: string): Promise<void> {
  // 兼容旧逻辑：保留函数名，但改为“废弃书籍”
  const novelDir = path.join(dataDir, slug);
  const metaPath = path.join(novelDir, "meta.json");
  if (!(await exists(metaPath))) throw new Error("Not found");
  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as NovelMeta;
  const meta = normalizeNovelMeta(parsed, slug);
  const next: NovelMeta = { ...meta, abandoned: true, abandonedAt: new Date().toISOString() };
  await fs.writeFile(metaPath, JSON.stringify(next, null, 2), "utf8");
}

export async function restoreNovel(dataDir: string, slug: string): Promise<void> {
  const novelDir = path.join(dataDir, slug);
  const metaPath = path.join(novelDir, "meta.json");
  if (!(await exists(metaPath))) throw new Error("Not found");
  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as NovelMeta;
  const meta = normalizeNovelMeta(parsed, slug);
  const next: NovelMeta = { ...meta, abandoned: false, abandonedAt: "" };
  await fs.writeFile(metaPath, JSON.stringify(next, null, 2), "utf8");
}

/** 章节正文文件：`0001_章节名.md`（序号递增；列表展示标题为下划线后的部分） */
const CHAPTER_FILENAME_RE = /^(\d+)_(.+)\.md$/;

function parseCharacterFrontmatter(raw: string): { role?: string; tags?: string[] } {
  // 仅解析极简 YAML frontmatter：
  // ---
  // role: 配角
  // tags: [盟友, 敌对]
  // ---
  if (!raw.startsWith("---")) return {};
  const start = raw.indexOf("\n");
  if (start < 0) return {};
  const end = raw.indexOf("\n---", start);
  if (end < 0) return {};
  const block = raw.slice(start + 1, end).replace(/\r/g, "");
  const lines = block.split("\n");

  const out: { role?: string; tags?: string[] } = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) {
      i += 1;
      continue;
    }

    if (line.startsWith("role:")) {
      const v = line.slice("role:".length).trim();
      if (v) out.role = v.replace(/^["']|["']$/g, "");
      i += 1;
      continue;
    }

    if (line.startsWith("tags:")) {
      const rest = line.slice("tags:".length).trim();
      // tags: [a, b]
      if (rest.startsWith("[") && rest.endsWith("]")) {
        const inside = rest.slice(1, -1).trim();
        out.tags = inside
          ? inside
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        i += 1;
        continue;
      }
      // tags:
      // - a
      // - b
      const tags: string[] = [];
      i += 1;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t) {
          i += 1;
          continue;
        }
        if (!t.startsWith("-")) break;
        const val = t.slice(1).trim();
        if (val) tags.push(val.replace(/^["']|["']$/g, ""));
        i += 1;
      }
      out.tags = tags;
      continue;
    }

    i += 1;
  }

  if (out.tags) out.tags = [...new Set(out.tags)].filter(Boolean);
  return out;
}

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

async function chapterIndexOccupied(chaptersDir: string, index: number): Promise<boolean> {
  const names = await fs.readdir(chaptersDir);
  const prefix = `${String(index).padStart(4, "0")}_`;
  return names.some((name) => name.startsWith(prefix) && name.endsWith(".md"));
}

/** 当前 chapters 目录下，规范文件名序号在 [1,max) 区间内缺失的序号 */
async function missingChapterIndexesFromDir(novelDir: string): Promise<number[]> {
  const chaptersDir = path.join(novelDir, "chapters");
  if (!(await exists(chaptersDir))) return [];
  const names = await fs.readdir(chaptersDir);
  const indices = new Set<number>();
  let max = 0;
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const m = name.match(CHAPTER_FILENAME_RE);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1) continue;
    indices.add(n);
    if (n > max) max = n;
  }
  if (max < 1) return [];
  const gaps: number[] = [];
  for (let i = 1; i < max; i++) {
    if (!indices.has(i)) gaps.push(i);
  }
  return gaps;
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

function approximateWordCount(s: string): number {
  const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (s.replace(/[\u4e00-\u9fa5]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return zh + en;
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
      createdAt: new Date(0).toISOString(),
      wordCount: 0
    };
  }
  const base = filename.replace(/\.md$/, "");
  return {
    id: base,
    title: base,
    filename,
    createdAt: new Date(0).toISOString(),
    wordCount: 0
  };
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function listNovels(dataDir: string): Promise<NovelSummary[]> {
  await ensureDir(dataDir);
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const metas: NovelSummary[] = [];

  for (const slug of dirs) {
    const metaPath = path.join(dataDir, slug, "meta.json");
    if (!(await exists(metaPath))) continue;
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const parsed = JSON.parse(raw) as NovelMeta;
      const meta = normalizeNovelMeta(parsed, slug);
      if (meta.abandoned) continue;
      const novelDir = path.join(dataDir, slug);
      const chapterCount = await countChapterMarkdownFiles(novelDir);
      const missingChapterIndexes = await missingChapterIndexesFromDir(novelDir);
      metas.push(novelSummaryFromMeta(meta, chapterCount, missingChapterIndexes));
    } catch {
      // ignore broken meta
    }
  }

  metas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return metas;
}

const MAX_SYNOPSIS_LEN = 20000;

export async function createNovel(dataDir: string, slug: string, title: string, synopsis?: string) {
  await ensureDir(dataDir);
  const novelDir = path.join(dataDir, slug);
  const metaPath = path.join(novelDir, "meta.json");
  const chaptersDir = path.join(novelDir, "chapters");
  const storyDir = path.join(novelDir, "story");
  const charactersDir = path.join(storyDir, "characters");

  if (await exists(metaPath)) {
    throw new Error(`Novel already exists: ${slug}`);
  }

  await ensureDir(chaptersDir);
  await ensureDir(charactersDir);
  const syn =
    typeof synopsis === "string" ? synopsis.trim().slice(0, MAX_SYNOPSIS_LEN) : "";
  const meta: NovelMeta = { slug, title, createdAt: new Date().toISOString(), synopsis: syn };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

  const defaults: Array<{ rel: string; content: string }> = [
    {
      rel: "story/timeline.md",
      content: `# 时间线\n\n- \n`
    },
    {
      rel: "story/state.md",
      content: `# 当前状态\n\n- 当前写到：\n- 关键冲突：\n- 伏笔：\n`
    },
    {
      rel: "story/world.md",
      content: `# 世界观\n\n- \n`
    },
    {
      rel: "story/outline.md",
      content: `# 大纲\n\n## 主线\n\n- \n\n## 章节规划\n\n- \n`
    },
    {
      rel: "story/notes.md",
      content: `# 笔记\n\n- \n`
    },
    {
      rel: "story/characters/主角.md",
      content: `---\nrole: 主角\ntags: []\n---\n# 主角\n\n- 目标：\n- 动机：\n- 弱点：\n- 外貌：\n- 关系：\n`
    }
  ];

  for (const d of defaults) {
    const p = path.join(novelDir, d.rel);
    if (!(await exists(p))) {
      await ensureDir(path.dirname(p));
      await fs.writeFile(p, d.content, "utf8");
    }
  }

  return meta;
}

export async function updateNovelSynopsis(dataDir: string, slug: string, synopsis: string): Promise<NovelSummary> {
  const novelDir = path.join(dataDir, slug);
  const metaPath = path.join(novelDir, "meta.json");
  if (!(await exists(metaPath))) throw new Error("Not found");
  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as NovelMeta;
  const meta = normalizeNovelMeta(parsed, slug);
  const next: NovelMeta = { ...meta, synopsis: synopsis.slice(0, MAX_SYNOPSIS_LEN) };
  await fs.writeFile(metaPath, JSON.stringify(next, null, 2), "utf8");
  const chapterCount = await countChapterMarkdownFiles(novelDir);
  const missingChapterIndexes = await missingChapterIndexesFromDir(novelDir);
  return novelSummaryFromMeta(next, chapterCount, missingChapterIndexes);
}

export async function listChapters(dataDir: string, novelSlug: string) {
  const chaptersDir = path.join(dataDir, novelSlug, "chapters");
  await ensureDir(chaptersDir);
  const entries = await fs.readdir(chaptersDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort(chapterFilenameSort);

  const metas: ChapterMeta[] = [];
  for (const filename of files) {
    const raw = await fs.readFile(path.join(chaptersDir, filename), "utf8");
    metas.push({
      ...chapterMetaFromFilename(filename),
      wordCount: approximateWordCount(raw)
    });
  }
  return metas;
}

export async function createChapter(
  dataDir: string,
  novelSlug: string,
  title: string,
  content?: string,
  chapterIndex?: number
) {
  const chaptersDir = path.join(dataDir, novelSlug, "chapters");
  await ensureDir(chaptersDir);

  let index: number;
  if (chapterIndex !== undefined) {
    const n = Math.floor(chapterIndex);
    if (!Number.isFinite(n) || n < 1) throw new Error("无效的章节序号");
    if (await chapterIndexOccupied(chaptersDir, n)) throw new Error(`序号 ${n} 已被占用`);
    index = n;
  } else {
    index = (await maxChapterIndex(chaptersDir)) + 1;
  }
  const stem = sanitizeChapterStem(title);
  const filename = await allocateChapterFilename(chaptersDir, index, stem);
  const filePath = path.join(chaptersDir, filename);
  const id = filename.replace(/\.md$/, "");

  const body =
    `# ${title}\n\n` +
    (content?.trim() ? `${content.trim()}\n` : "");

  await fs.writeFile(filePath, body, "utf8");
  const meta: ChapterMeta = {
    id,
    title,
    filename,
    createdAt: new Date().toISOString(),
    wordCount: approximateWordCount(body)
  };
  return meta;
}

export async function readChapter(dataDir: string, novelSlug: string, filename: string) {
  const filePath = path.join(dataDir, novelSlug, "chapters", filename);
  const raw = await fs.readFile(filePath, "utf8");
  return raw;
}

export async function updateChapter(
  dataDir: string,
  novelSlug: string,
  filename: string,
  newContent: string
) {
  const filePath = path.join(dataDir, novelSlug, "chapters", filename);
  await fs.writeFile(filePath, newContent, "utf8");
}

export async function deleteChapter(dataDir: string, novelSlug: string, filename: string) {
  const safeName = path.basename(filename);
  if (safeName !== filename || !safeName.endsWith(".md")) {
    throw new Error("无效的章节文件名");
  }
  const chaptersDir = path.resolve(path.join(dataDir, novelSlug, "chapters"));
  const filePath = path.resolve(path.join(chaptersDir, safeName));
  const boundary = chaptersDir.endsWith(path.sep) ? chaptersDir : `${chaptersDir}${path.sep}`;
  if (!filePath.startsWith(boundary)) {
    throw new Error("无效的章节路径");
  }
  if (!(await exists(filePath))) throw new Error("章节不存在");
  await fs.unlink(filePath);
}

/** 保留序号，仅改「下划线后的标题」并重命名文件；同步正文首行 `# 标题`。 */
export async function renameChapterTitle(
  dataDir: string,
  novelSlug: string,
  oldFilename: string,
  newTitle: string
): Promise<ChapterMeta> {
  const trimmed = newTitle.trim();
  if (!trimmed) throw new Error("标题不能为空");

  const m = oldFilename.match(CHAPTER_FILENAME_RE);
  if (!m) throw new Error("仅支持「序号_标题.md」格式的章节改名");

  const indexNum = parseInt(m[1], 10);
  const chaptersDir = path.join(dataDir, novelSlug, "chapters");
  const oldPath = path.join(chaptersDir, oldFilename);
  if (!(await exists(oldPath))) throw new Error("章节不存在");

  const stem = sanitizeChapterStem(trimmed);
  const newFilename = await allocateChapterFilenameExcept(chaptersDir, indexNum, stem, oldFilename);

  const raw = await fs.readFile(oldPath, "utf8");
  const nextBody = applyChapterHeadingTitle(raw, trimmed);

  const metaWithCount = (fn: string): ChapterMeta => ({
    ...chapterMetaFromFilename(fn),
    wordCount: approximateWordCount(nextBody)
  });

  if (newFilename === oldFilename) {
    await fs.writeFile(oldPath, nextBody, "utf8");
    return metaWithCount(oldFilename);
  }

  const newPath = path.join(chaptersDir, newFilename);
  if (await exists(newPath)) throw new Error("目标文件已存在");

  await fs.writeFile(newPath, nextBody, "utf8");
  await fs.unlink(oldPath);

  return metaWithCount(newFilename);
}

export async function listStoryFiles(dataDir: string, novelSlug: string) {
  const novelDir = path.join(dataDir, novelSlug);
  const storyDir = path.join(novelDir, "story");
  const charactersDir = path.join(storyDir, "characters");
  await ensureDir(charactersDir);

  const storyEntries = await fs.readdir(storyDir, { withFileTypes: true });
  const storyFiles: StoryFile[] = storyEntries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => ({
      kind: "story" as const,
      path: `story/${e.name}`,
      title: e.name.replace(/\.md$/, "")
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "zh-Hans-CN"));

  const charEntries = await fs.readdir(charactersDir, { withFileTypes: true });
  const charNames = charEntries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name);
  const charFiles: StoryFile[] = [];
  for (const name of charNames) {
    const relPath = `story/characters/${name}`;
    const absPath = path.join(dataDir, novelSlug, relPath);
    let meta: { role?: string; tags?: string[] } = {};
    try {
      const raw = await fs.readFile(absPath, "utf8");
      meta = parseCharacterFrontmatter(raw);
    } catch {
      // ignore
    }
    charFiles.push({
      kind: "character" as const,
      path: relPath,
      title: name.replace(/\.md$/, ""),
      role: meta.role,
      tags: meta.tags
    });
  }
  charFiles.sort((a, b) => a.path.localeCompare(b.path, "zh-Hans-CN"));

  return { storyFiles, charFiles };
}

export async function readStoryFile(dataDir: string, novelSlug: string, relPath: string) {
  const filePath = path.join(dataDir, novelSlug, relPath);
  const raw = await fs.readFile(filePath, "utf8");
  return raw;
}

export async function updateStoryFile(dataDir: string, novelSlug: string, relPath: string, content: string) {
  const filePath = path.join(dataDir, novelSlug, relPath);
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function createCharacterCard(
  dataDir: string,
  novelSlug: string,
  name: string,
  opts?: { role?: string; tags?: string[] }
) {
  const safeName = name.trim() || "未命名角色";
  const relPath = `story/characters/${safeName}.md`;
  const filePath = path.join(dataDir, novelSlug, relPath);
  if (await exists(filePath)) throw new Error("Character already exists");
  await ensureDir(path.dirname(filePath));
  const role = (opts?.role || "配角").trim() || "配角";
  const tags = [...new Set((opts?.tags ?? []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 30);
  const tagsYaml = tags.length ? `[${tags.join(", ")}]` : "[]";
  const body = `---\nrole: ${role}\ntags: ${tagsYaml}\n---\n# ${safeName}\n\n- 目标：\n- 动机：\n- 弱点：\n- 外貌：\n- 关系：\n`;
  await fs.writeFile(filePath, body, "utf8");
  return { relPath };
}

