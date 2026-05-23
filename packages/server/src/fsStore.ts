import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type NovelMeta = {
  /** 全书唯一标识（UUID）；目录名与之相同 */
  bookId: string;
  title: string;
  createdAt: string;
  /** 可选展示别名，不保证唯一 */
  slug?: string;
  /** 归档的建书规划 session */
  setupSessionId?: string;
  /** 书籍简介（写入 meta.json；旧数据可无此字段） */
  synopsis?: string;
  /** 已完结 */
  completed?: boolean;
  completedAt?: string;
  /** 软删除：标记该书已废弃（仍保留本地目录与文件） */
  abandoned?: boolean;
  abandonedAt?: string;
};

function normalizeNovelMeta(parsed: NovelMeta, dirName: string): NovelMeta {
  const bookId =
    (typeof parsed.bookId === "string" && parsed.bookId.trim()) ||
    dirName;
  const slugRaw = typeof parsed.slug === "string" ? parsed.slug.trim() : "";
  return {
    bookId,
    slug: slugRaw || (dirName !== bookId ? dirName : undefined),
    title: parsed.title ?? dirName,
    createdAt: parsed.createdAt ?? new Date(0).toISOString(),
    synopsis: typeof parsed.synopsis === "string" ? parsed.synopsis : "",
    setupSessionId:
      typeof (parsed as { setupSessionId?: string }).setupSessionId === "string"
        ? (parsed as { setupSessionId?: string }).setupSessionId!.trim()
        : undefined,
    completed: Boolean((parsed as any).completed),
    completedAt: typeof (parsed as any).completedAt === "string" ? (parsed as any).completedAt : "",
    abandoned: Boolean((parsed as any).abandoned),
    abandonedAt: typeof (parsed as any).abandonedAt === "string" ? (parsed as any).abandonedAt : ""
  };
}

/** 列表/接口返回：含章节数与状态（不写入 meta.json） */
export type NovelSummary = NovelMeta & {
  chapterCount: number;
  status: "进行中" | "已完结";
  /** 介于 1..最大序号之间、文件名符合「序号_标题.md」但未出现的序号（如删了第 4 章则为 [4]） */
  missingChapterIndexes: number[];
};

export function novelSummaryFromMeta(
  meta: NovelMeta,
  chapterCount: number,
  missingChapterIndexes: number[] = []
): NovelSummary {
  return { ...meta, chapterCount, status: meta.completed ? "已完结" : "进行中", missingChapterIndexes };
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
  /** 该次分析基于的正文快照信息，用于判断是否“过期” */
  source?: {
    /** 章节正文 hash（服务端计算，前端对比判断 dirty） */
    contentHash: string;
    /** 分析时正文长度（字符数，便于提示变更幅度） */
    contentLength: number;
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

export type ForeshadowStatus = "open" | "progress" | "closed";

export type ForeshadowItem = {
  id: string;
  title: string;
  status: ForeshadowStatus;
  firstChapter?: number;
  lastChapter?: number;
  chapters?: number[];
  lastProgress?: string;
  note?: string;
  updatedAt: string;
};

export type ForeshadowsIndex = {
  version: 1;
  updatedAt: string;
  foreshadows: ForeshadowItem[];
  hiddenIds: string[];
};

export type ProgressItemStatus = "open" | "progress" | "done";

export type ProgressItem = {
  id: string;
  title: string;
  detail?: string;
  related?: {
    characters?: string[];
    places?: string[];
    orgs?: string[];
    chapters?: number[];
  };
  priority?: 1 | 2 | 3;
  status: ProgressItemStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type ProgressIndex = {
  version: 1;
  updatedAt: string;
  lastSourceChapter?: { filename: string; chapterNo?: number; title?: string };
  summary?: string;
  items: ProgressItem[];
};

export type WritingPack = {
  version: 1;
  updatedAt: string;
  source: {
    /** 取最近多少章作为窗口（用于“下一章/新章”写作包） */
    windowChapters: number;
    /** 取最近多少个压缩区间 */
    windowCompressedRanges: number;
    /** 参与筛选的 progress 候选数量（非最终展示数量） */
    pickedProgress: number;
    /** 参与筛选的 foreshadow 候选数量（非最终展示数量） */
    pickedForeshadows: number;
  };
  chapterTarget: { filename: string; title?: string; chapterNo?: number };
  /** 固定 5 句的“态势/悬念总述” */
  summary5: string[];
  lists: {
    progress: Array<{ id: string; title: string; basis?: string }>;
    foreshadows: Array<{ id: string; title: string; basis?: string }>;
    risks: Array<{ issue: string; severity?: string; basis?: string }>;
  };
  /** 固定免责声明：写作包仅供参考 */
  disclaimer: string;
};

export type IdeaItemStatus = "active" | "hidden" | "deleted";
export type IdeaItemType = "naming" | "note" | "generation";

export type IdeaItem = {
  id: string;
  type: IdeaItemType;
  /** 例如：character/place/organization/item（naming 或 generation 时可用） */
  subtype?: string;
  title?: string;
  content: string;
  tags?: string[];
  pinned?: boolean;
  status: IdeaItemStatus;
  createdAt: string;
  updatedAt: string;
  source?: { provider?: string; model?: string; prompt?: string };
  meta?: {
    genreStyle?: string[];
    tone?: string;
    seedWords?: string[];
    score?: number;
    parentId?: string;
    variantPolicy?: any;
    usedMemory?: boolean;
  };
};

export type InspirationIndex = {
  version: 1;
  updatedAt: string;
  items: IdeaItem[];
};

export type CharacterSocialTags = {
  profession?: string;
  class?: string;
  titles?: string[];
  other?: string[];
};

export type CharacterNarrativeDrives = {
  want?: string;
  need?: string;
  moralCompass?: string;
  flaws?: string[];
  blindSpots?: string[];
};

export type CharacterFingerprints = {
  linguisticStyle?: string[];
  catchphrases?: string[];
  mannerisms?: string[];
  mask?: Array<{ context: string; persona: string }>;
};

export type CharacterProfileLocks = {
  tags?: boolean;
  socialTags?: boolean;
  historicalDebts?: boolean;
  occurredNotes?: boolean;
  narrativeDrives?: boolean;
  fingerprints?: boolean;
  relationalHooks?: boolean;
};

export type CharacterRelationalHooks = {
  relations?: Array<{
    targetName: string;
    /** 受控枚举的关系类型标签（多选） */
    types?: string[];
    emotionalPolarity?: string;
    conflictIndex?: string;
    sharedSecrets?: string[];
  }>;
  freeText?: string;
};

export type CharacterProfile = {
  name: string;
  role?: string;
  tags?: string[];
  /** 物理状态/随身物品/财富等：结构允许增量扩展 */
  state?: Record<string, any>;
  /** 社会身份标签：职业/阶级/头衔等 */
  socialTags?: CharacterSocialTags;
  /** 历史债/承诺/重大决策（列表） */
  historicalDebts?: string[];
  /** 发生过的事情（全书范围增量沉淀；列表） */
  occurredNotes?: string[];
  /** 叙事驱动力：want/need/道德罗盘/认知局限等 */
  narrativeDrives?: CharacterNarrativeDrives;
  /** 表现力指纹：口癖/句式/动作/面具等 */
  fingerprints?: CharacterFingerprints;
  /** 关系钩子：结构化 relations + 兜底自由文本 */
  relationalHooks?: CharacterRelationalHooks;
  /** 手工锁定：锁定后审计不会自动覆盖对应区块 */
  locks?: CharacterProfileLocks;
  /** 兼容旧字段：性格分析 */
  personalityAnalysis?: string;
  updatedAt: string;
};

export type AuditCharactersIndexV2 = {
  version: 2;
  updatedAt: string;
  characters: CharacterProfile[];
  hiddenNames: string[];
};

function normalizeAuditCharactersIndexV2(parsed: any): AuditCharactersIndexV2 {
  const version = Number(parsed?.version);
  const updatedAt = typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "";
  const hiddenNames = Array.isArray(parsed?.hiddenNames) ? parsed.hiddenNames.map((x: any) => String(x)) : [];
  const rawChars = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const characters: CharacterProfile[] = rawChars
    .map((c: any) => ({
      ...(c && typeof c === "object" ? c : {}),
      name: String(c?.name || "").trim(),
      role: c?.role,
      tags: Array.isArray(c?.tags) ? c.tags.map((x: any) => String(x)).filter(Boolean) : c?.tags,
      state: c?.state && typeof c.state === "object" ? c.state : undefined,
      socialTags: c?.socialTags && typeof c.socialTags === "object" ? c.socialTags : undefined,
      historicalDebts: Array.isArray(c?.historicalDebts)
        ? c.historicalDebts.map((x: any) => String(x)).map((s: string) => s.trim()).filter(Boolean)
        : undefined,
      occurredNotes: Array.isArray(c?.occurredNotes)
        ? c.occurredNotes.map((x: any) => String(x)).map((s: string) => s.trim()).filter(Boolean)
        : undefined,
      narrativeDrives: c?.narrativeDrives && typeof c.narrativeDrives === "object" ? c.narrativeDrives : undefined,
      fingerprints: c?.fingerprints && typeof c.fingerprints === "object" ? c.fingerprints : undefined,
      relationalHooks:
        c?.relationalHooks && typeof c.relationalHooks === "object"
          ? {
              relations: Array.isArray(c.relationalHooks?.relations)
                ? c.relationalHooks.relations
                    .map((r: any) => ({
                      targetName: String(r?.targetName || "").trim(),
                      types: Array.isArray(r?.types)
                        ? r.types.map((x: any) => String(x)).map((s: string) => s.trim()).filter(Boolean)
                        : undefined,
                      emotionalPolarity: typeof r?.emotionalPolarity === "string" ? r.emotionalPolarity : r?.emotionalPolarity,
                      conflictIndex: typeof r?.conflictIndex === "string" ? r.conflictIndex : r?.conflictIndex,
                      sharedSecrets: Array.isArray(r?.sharedSecrets)
                        ? r.sharedSecrets.map((x: any) => String(x)).map((s: string) => s.trim()).filter(Boolean)
                        : undefined
                    }))
                    .filter((r: any) => r.targetName)
                : undefined,
              freeText: typeof c.relationalHooks?.freeText === "string" ? c.relationalHooks.freeText : c.relationalHooks?.freeText
            }
          : undefined,
      locks: c?.locks && typeof c.locks === "object" ? c.locks : undefined,
      personalityAnalysis: typeof c?.personalityAnalysis === "string" ? c.personalityAnalysis : c?.personalityAnalysis,
      updatedAt: typeof c?.updatedAt === "string" ? c.updatedAt : updatedAt
    }))
    .filter((c: any) => c.name);

  if (version === 2) {
    return { version: 2, updatedAt, characters, hiddenNames };
  }

  // v1 → v2: 旧文件通常只有 { characters, hiddenNames, updatedAt }，且角色条目多为 {name, role, tags, state, personalityAnalysis, updatedAt}
  return { version: 2, updatedAt, characters, hiddenNames };
}

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

function metaDir(dataDir: string, novelSlug: string) {
  return path.join(dataDir, novelSlug, "meta");
}

function writingPacksDir(dataDir: string, novelSlug: string) {
  return path.join(auditDir(dataDir, novelSlug), "writingPacks");
}

function timelineIndexPath(dataDir: string, novelSlug: string) {
  return path.join(auditDir(dataDir, novelSlug), "timelineIndex.json");
}

function inspirationIndexPath(dataDir: string, novelSlug: string) {
  return path.join(metaDir(dataDir, novelSlug), "inspiration.json");
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

export async function readInspirationIndex(dataDir: string, novelSlug: string): Promise<InspirationIndex> {
  const p = inspirationIndexPath(dataDir, novelSlug);
  if (!(await exists(p))) {
    return { version: 1, updatedAt: "", items: [] };
  }
  const raw = await fs.readFile(p, "utf8");
  const parsed = JSON.parse(raw) as any;
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return {
    version: 1,
    updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "",
    items
  };
}

export async function writeInspirationIndex(dataDir: string, novelSlug: string, idx: InspirationIndex) {
  const dir = metaDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = inspirationIndexPath(dataDir, novelSlug);
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

export function chapterContentSha1(text: string): string {
  const normalized = String(text || "").replace(/\r/g, "");
  return crypto.createHash("sha1").update(normalized, "utf8").digest("hex");
}

export type AuditChapterStaleEntry = {
  filename: string;
  stale: boolean;
  currentHash: string;
  auditedHash: string;
};

/** 对比各章 audit run 快照 hash 与当前正文，供章节目录「有改动」展示 */
export async function listAuditChapterStale(
  dataDir: string,
  novelSlug: string
): Promise<AuditChapterStaleEntry[]> {
  const dir = path.join(auditDir(dataDir, novelSlug), "auditRuns");
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: AuditChapterStaleEntry[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filename = file.slice(0, -5);
    const run = await readAuditRun(dataDir, novelSlug, filename);
    const auditedHash = String(run?.source?.contentHash || "").trim();
    if (!auditedHash) continue;
    try {
      const raw = await readChapter(dataDir, novelSlug, filename);
      const currentHash = chapterContentSha1(raw);
      out.push({
        filename,
        stale: currentHash !== auditedHash,
        currentHash,
        auditedHash
      });
    } catch {
      /* 章节文件缺失时跳过 */
    }
  }
  return out;
}

function auditAnalysisDir(dataDir: string, novelSlug: string) {
  return path.join(auditDir(dataDir, novelSlug), "analysisTexts");
}

export async function writeAuditAnalysisText(
  dataDir: string,
  novelSlug: string,
  chapterFilename: string,
  text: string
) {
  const dir = auditAnalysisDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = path.join(dir, `${chapterFilename}.md`);
  await fs.writeFile(p, String(text || ""), "utf8");
}

export async function readAuditAnalysisText(
  dataDir: string,
  novelSlug: string,
  chapterFilename: string
): Promise<string> {
  const p = path.join(auditAnalysisDir(dataDir, novelSlug), `${chapterFilename}.md`);
  if (!(await exists(p))) return "";
  return await fs.readFile(p, "utf8");
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

export async function readAuditCharactersIndex(dataDir: string, novelSlug: string): Promise<AuditCharactersIndexV2> {
  const p = path.join(auditDir(dataDir, novelSlug), "charactersIndex.json");
  if (!(await exists(p))) return { version: 2, updatedAt: "", characters: [], hiddenNames: [] };
  const parsed = JSON.parse(await fs.readFile(p, "utf8"));
  const idx = normalizeAuditCharactersIndexV2(parsed);
  // 懒迁移：读到旧结构时，写回 v2（失败不影响读取）
  try {
    if (Number((parsed as any)?.version) !== 2) {
      await fs.writeFile(p, JSON.stringify(idx, null, 2), "utf8");
    }
  } catch {
    // ignore
  }
  return idx;
}

export async function writeAuditCharactersIndex(dataDir: string, novelSlug: string, idx: AuditCharactersIndexV2) {
  const dir = auditDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = path.join(dir, "charactersIndex.json");
  await fs.writeFile(p, JSON.stringify(idx, null, 2), "utf8");
}

export async function readAuditPlacesIndex(dataDir: string, novelSlug: string): Promise<any> {
  const p = path.join(auditDir(dataDir, novelSlug), "placesIndex.json");
  if (!(await exists(p))) return { places: [], hiddenNames: [], updatedAt: "" };
  const parsed = JSON.parse(await fs.readFile(p, "utf8"));
  if (parsed && typeof parsed === "object") {
    if (!Array.isArray((parsed as any).places)) (parsed as any).places = [];
    if (!Array.isArray((parsed as any).hiddenNames)) (parsed as any).hiddenNames = [];
    if (typeof (parsed as any).updatedAt !== "string") (parsed as any).updatedAt = "";
  }
  return parsed;
}

export async function writeAuditPlacesIndex(dataDir: string, novelSlug: string, idx: any) {
  const dir = auditDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = path.join(dir, "placesIndex.json");
  await fs.writeFile(p, JSON.stringify(idx, null, 2), "utf8");
}

export async function readAuditOrgsIndex(dataDir: string, novelSlug: string): Promise<any> {
  const p = path.join(auditDir(dataDir, novelSlug), "orgsIndex.json");
  if (!(await exists(p))) return { orgs: [], hiddenNames: [], updatedAt: "" };
  const parsed = JSON.parse(await fs.readFile(p, "utf8"));
  if (parsed && typeof parsed === "object") {
    if (!Array.isArray((parsed as any).orgs)) (parsed as any).orgs = [];
    if (!Array.isArray((parsed as any).hiddenNames)) (parsed as any).hiddenNames = [];
    if (typeof (parsed as any).updatedAt !== "string") (parsed as any).updatedAt = "";
  }
  return parsed;
}

export async function writeAuditOrgsIndex(dataDir: string, novelSlug: string, idx: any) {
  const dir = auditDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = path.join(dir, "orgsIndex.json");
  await fs.writeFile(p, JSON.stringify(idx, null, 2), "utf8");
}

export async function readAuditForeshadowsIndex(dataDir: string, novelSlug: string): Promise<ForeshadowsIndex> {
  const p = path.join(auditDir(dataDir, novelSlug), "foreshadowsIndex.json");
  if (!(await exists(p))) return { version: 1, updatedAt: "", foreshadows: [], hiddenIds: [] };
  const parsed = JSON.parse(await fs.readFile(p, "utf8"));
  const idx: ForeshadowsIndex = {
    version: 1,
    updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "",
    foreshadows: Array.isArray(parsed?.foreshadows) ? parsed.foreshadows : [],
    hiddenIds: Array.isArray(parsed?.hiddenIds) ? parsed.hiddenIds : []
  };
  return idx;
}

export async function writeAuditForeshadowsIndex(dataDir: string, novelSlug: string, idx: ForeshadowsIndex) {
  const dir = auditDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = path.join(dir, "foreshadowsIndex.json");
  await fs.writeFile(p, JSON.stringify(idx, null, 2), "utf8");
}

export async function readAuditProgressIndex(dataDir: string, novelSlug: string): Promise<ProgressIndex> {
  const p = path.join(auditDir(dataDir, novelSlug), "progressIndex.json");
  if (!(await exists(p))) return { version: 1, updatedAt: "", lastSourceChapter: undefined, summary: "", items: [] };
  const parsed = JSON.parse(await fs.readFile(p, "utf8"));
  const idx: ProgressIndex = {
    version: 1,
    updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "",
    lastSourceChapter: parsed?.lastSourceChapter && typeof parsed.lastSourceChapter === "object" ? parsed.lastSourceChapter : undefined,
    summary: typeof parsed?.summary === "string" ? parsed.summary : "",
    items: Array.isArray(parsed?.items) ? parsed.items : []
  };
  return idx;
}

export async function writeAuditProgressIndex(dataDir: string, novelSlug: string, idx: ProgressIndex) {
  const dir = auditDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = path.join(dir, "progressIndex.json");
  await fs.writeFile(p, JSON.stringify(idx, null, 2), "utf8");
}

export async function readWritingPack(dataDir: string, novelSlug: string, chapterId: string): Promise<WritingPack | null> {
  const safeId = String(chapterId || "").trim();
  if (!safeId) return null;
  const dir = writingPacksDir(dataDir, novelSlug);
  const p = path.join(dir, `${safeId}.json`);
  if (!(await exists(p))) return null;
  const parsed = JSON.parse(await fs.readFile(p, "utf8"));
  if (!parsed || typeof parsed !== "object") return null;
  const v = Number((parsed as any).version);
  const updatedAt = typeof (parsed as any).updatedAt === "string" ? (parsed as any).updatedAt : "";
  const summary5 = Array.isArray((parsed as any).summary5) ? (parsed as any).summary5.map((x: any) => String(x)).filter(Boolean) : [];
  const lists = (parsed as any).lists && typeof (parsed as any).lists === "object" ? (parsed as any).lists : {};
  const pack: WritingPack = {
    version: v === 1 ? 1 : 1,
    updatedAt,
    source: (parsed as any).source && typeof (parsed as any).source === "object"
      ? {
          windowChapters: Number((parsed as any).source?.windowChapters) || 0,
          windowCompressedRanges: Number((parsed as any).source?.windowCompressedRanges) || 0,
          pickedProgress: Number((parsed as any).source?.pickedProgress) || 0,
          pickedForeshadows: Number((parsed as any).source?.pickedForeshadows) || 0
        }
      : { windowChapters: 0, windowCompressedRanges: 0, pickedProgress: 0, pickedForeshadows: 0 },
    chapterTarget:
      (parsed as any).chapterTarget && typeof (parsed as any).chapterTarget === "object"
        ? {
            filename: String((parsed as any).chapterTarget?.filename || "").trim(),
            title: typeof (parsed as any).chapterTarget?.title === "string" ? (parsed as any).chapterTarget.title : undefined,
            chapterNo: Number.isFinite((parsed as any).chapterTarget?.chapterNo) ? (parsed as any).chapterTarget.chapterNo : undefined
          }
        : { filename: "" },
    summary5,
    lists: {
      progress: Array.isArray(lists?.progress) ? lists.progress : [],
      foreshadows: Array.isArray(lists?.foreshadows) ? lists.foreshadows : [],
      risks: Array.isArray(lists?.risks) ? lists.risks : []
    },
    disclaimer: typeof (parsed as any).disclaimer === "string" ? (parsed as any).disclaimer : ""
  };
  if (!pack.chapterTarget.filename) return null;
  if (pack.summary5.length !== 5) {
    // 保守：读盘时不强制失败，后续 UI 会做兜底展示
  }
  return pack;
}

export async function writeWritingPack(dataDir: string, novelSlug: string, chapterId: string, pack: WritingPack) {
  const safeId = String(chapterId || "").trim();
  if (!safeId) throw new Error("无效的 chapterId");
  const dir = writingPacksDir(dataDir, novelSlug);
  await ensureDir(dir);
  const p = path.join(dir, `${safeId}.json`);
  await fs.writeFile(p, JSON.stringify(pack, null, 2), "utf8");
}

export async function patchNovelMetaFields(
  dataDir: string,
  bookId: string,
  fields: Partial<Pick<NovelMeta, "title" | "synopsis" | "slug" | "setupSessionId">>
): Promise<NovelSummary> {
  const novelDir = path.join(dataDir, bookId);
  const metaPath = path.join(novelDir, "meta.json");
  if (!(await exists(metaPath))) throw new Error("Not found");
  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as NovelMeta;
  const meta = normalizeNovelMeta(parsed, bookId);
  const next: NovelMeta = {
    ...meta,
    ...(fields.title !== undefined ? { title: fields.title.trim() || meta.title } : {}),
    ...(fields.synopsis !== undefined
      ? { synopsis: fields.synopsis.slice(0, MAX_SYNOPSIS_LEN) }
      : {}),
    ...(fields.slug !== undefined ? { slug: fields.slug.trim() || undefined } : {}),
    ...(fields.setupSessionId !== undefined
      ? { setupSessionId: fields.setupSessionId.trim() || undefined }
      : {})
  };
  await fs.writeFile(metaPath, JSON.stringify(next, null, 2), "utf8");
  const chapterCount = await countChapterMarkdownFiles(novelDir);
  const missingChapterIndexes = await missingChapterIndexesFromDir(novelDir);
  return novelSummaryFromMeta(next, chapterCount, missingChapterIndexes);
}

export async function deleteNovel(dataDir: string, bookId: string): Promise<void> {
  // 兼容旧逻辑：保留函数名，但改为“废弃书籍”
  const novelDir = path.join(dataDir, bookId);
  const metaPath = path.join(novelDir, "meta.json");
  if (!(await exists(metaPath))) throw new Error("Not found");
  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as NovelMeta;
  const meta = normalizeNovelMeta(parsed, bookId);
  const next: NovelMeta = { ...meta, abandoned: true, abandonedAt: new Date().toISOString() };
  await fs.writeFile(metaPath, JSON.stringify(next, null, 2), "utf8");
}

export async function restoreNovel(dataDir: string, bookId: string): Promise<void> {
  const novelDir = path.join(dataDir, bookId);
  const metaPath = path.join(novelDir, "meta.json");
  if (!(await exists(metaPath))) throw new Error("Not found");
  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as NovelMeta;
  const meta = normalizeNovelMeta(parsed, bookId);
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

export function approximateWordCount(s: string): number {
  const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (s.replace(/[\u4e00-\u9fa5]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return zh + en;
}

export type WritingLogDaily = { netWords: number; saveCount: number };

export type WritingLog = {
  version: 1;
  updatedAt: string;
  initialized?: boolean;
  chapterWordCount: Record<string, number>;
  daily: Record<string, WritingLogDaily>;
};

function emptyWritingLog(): WritingLog {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    initialized: false,
    chapterWordCount: {},
    daily: {}
  };
}

function writingLogPath(dataDir: string, novelSlug: string): string {
  return path.join(dataDir, novelSlug, "meta", "writing-log.json");
}

export async function readWritingLog(dataDir: string, novelSlug: string): Promise<WritingLog> {
  const p = writingLogPath(dataDir, novelSlug);
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as WritingLog;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      initialized: Boolean(parsed.initialized),
      chapterWordCount:
        parsed.chapterWordCount && typeof parsed.chapterWordCount === "object" ? parsed.chapterWordCount : {},
      daily: parsed.daily && typeof parsed.daily === "object" ? parsed.daily : {}
    };
  } catch {
    return emptyWritingLog();
  }
}

export async function writeWritingLog(dataDir: string, novelSlug: string, log: WritingLog): Promise<void> {
  const p = writingLogPath(dataDir, novelSlug);
  await ensureDir(path.dirname(p));
  const next: WritingLog = { ...log, version: 1, updatedAt: new Date().toISOString() };
  await fs.writeFile(p, JSON.stringify(next, null, 2), "utf8");
}

/** 将当前各章字数写入基线，不写入 daily（避免历史字数误计入日更） */
export async function ensureWritingLogBaseline(dataDir: string, novelSlug: string): Promise<WritingLog> {
  const log = await readWritingLog(dataDir, novelSlug);
  if (log.initialized) return log;

  const chapters = await listChapters(dataDir, novelSlug);
  const chapterWordCount: Record<string, number> = { ...log.chapterWordCount };
  for (const ch of chapters) {
    if (chapterWordCount[ch.filename] === undefined) {
      chapterWordCount[ch.filename] = ch.wordCount;
    }
  }
  const next: WritingLog = { ...log, chapterWordCount, initialized: true };
  await writeWritingLog(dataDir, novelSlug, next);
  return next;
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordChapterWordDelta(
  dataDir: string,
  novelSlug: string,
  filename: string,
  newContent: string,
  options?: { treatAsNew?: boolean }
): Promise<void> {
  await ensureWritingLogBaseline(dataDir, novelSlug);
  const log = await readWritingLog(dataDir, novelSlug);
  const newCount = approximateWordCount(newContent);
  const chapterWordCount = { ...log.chapterWordCount };
  const daily = { ...log.daily };

  let delta = 0;
  if (options?.treatAsNew) {
    delta = newCount;
  } else if (chapterWordCount[filename] === undefined) {
    chapterWordCount[filename] = newCount;
    await writeWritingLog(dataDir, novelSlug, { ...log, chapterWordCount, daily });
    return;
  } else {
    const oldCount = chapterWordCount[filename] ?? 0;
    delta = Math.max(0, newCount - oldCount);
  }

  chapterWordCount[filename] = newCount;

  if (delta > 0) {
    const day = todayDateStr();
    const prev = daily[day] ?? { netWords: 0, saveCount: 0 };
    daily[day] = { netWords: prev.netWords + delta, saveCount: prev.saveCount + 1 };
  } else {
    const day = todayDateStr();
    const prev = daily[day];
    if (prev) {
      daily[day] = { ...prev, saveCount: prev.saveCount + 1 };
    }
  }

  await writeWritingLog(dataDir, novelSlug, { ...log, chapterWordCount, daily });
}

export async function removeChapterFromWritingLog(
  dataDir: string,
  novelSlug: string,
  filename: string
): Promise<void> {
  const log = await readWritingLog(dataDir, novelSlug);
  if (!log.chapterWordCount[filename]) return;
  const chapterWordCount = { ...log.chapterWordCount };
  delete chapterWordCount[filename];
  await writeWritingLog(dataDir, novelSlug, { ...log, chapterWordCount });
}

export async function renameChapterInWritingLog(
  dataDir: string,
  novelSlug: string,
  oldFilename: string,
  newFilename: string,
  newContent: string
): Promise<void> {
  const log = await readWritingLog(dataDir, novelSlug);
  const chapterWordCount = { ...log.chapterWordCount };
  if (oldFilename !== newFilename && chapterWordCount[oldFilename] !== undefined) {
    chapterWordCount[newFilename] = chapterWordCount[oldFilename];
    delete chapterWordCount[oldFilename];
  }
  await writeWritingLog(dataDir, novelSlug, { ...log, chapterWordCount });
  await recordChapterWordDelta(dataDir, novelSlug, newFilename, newContent);
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

  for (const dirName of dirs) {
    const metaPath = path.join(dataDir, dirName, "meta.json");
    if (!(await exists(metaPath))) continue;
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const parsed = JSON.parse(raw) as NovelMeta;
      const meta = normalizeNovelMeta(parsed, dirName);
      if (meta.abandoned) continue;
      const novelDir = path.join(dataDir, meta.bookId);
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

export async function createNovel(
  dataDir: string,
  bookId: string,
  title: string,
  synopsis?: string,
  extra?: Pick<NovelMeta, "slug" | "setupSessionId">
) {
  await ensureDir(dataDir);
  const novelDir = path.join(dataDir, bookId);
  const metaPath = path.join(novelDir, "meta.json");
  const chaptersDir = path.join(novelDir, "chapters");
  const storyDir = path.join(novelDir, "story");
  const charactersDir = path.join(storyDir, "characters");

  if (await exists(metaPath)) {
    throw new Error(`Novel already exists: ${bookId}`);
  }

  await ensureDir(chaptersDir);
  await ensureDir(charactersDir);
  const syn =
    typeof synopsis === "string" ? synopsis.trim().slice(0, MAX_SYNOPSIS_LEN) : "";
  const meta: NovelMeta = {
    bookId,
    title,
    createdAt: new Date().toISOString(),
    synopsis: syn,
    ...(extra?.slug?.trim() ? { slug: extra.slug.trim() } : {}),
    ...(extra?.setupSessionId?.trim() ? { setupSessionId: extra.setupSessionId.trim() } : {})
  };
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

  const { initNotesIndexForNewBook } = await import("./bookNotes/store.js");
  await initNotesIndexForNewBook(dataDir, bookId);

  return meta;
}

export async function updateNovelSynopsis(dataDir: string, bookId: string, synopsis: string): Promise<NovelSummary> {
  const novelDir = path.join(dataDir, bookId);
  const metaPath = path.join(novelDir, "meta.json");
  if (!(await exists(metaPath))) throw new Error("Not found");
  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as NovelMeta;
  const meta = normalizeNovelMeta(parsed, bookId);
  const next: NovelMeta = { ...meta, synopsis: synopsis.slice(0, MAX_SYNOPSIS_LEN) };
  await fs.writeFile(metaPath, JSON.stringify(next, null, 2), "utf8");
  const chapterCount = await countChapterMarkdownFiles(novelDir);
  const missingChapterIndexes = await missingChapterIndexesFromDir(novelDir);
  return novelSummaryFromMeta(next, chapterCount, missingChapterIndexes);
}

export async function updateNovelCompleted(dataDir: string, bookId: string, completed: boolean): Promise<NovelSummary> {
  const novelDir = path.join(dataDir, bookId);
  const metaPath = path.join(novelDir, "meta.json");
  if (!(await exists(metaPath))) throw new Error("Not found");
  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as NovelMeta;
  const meta = normalizeNovelMeta(parsed, bookId);
  const now = new Date().toISOString();
  const next: NovelMeta = {
    ...meta,
    completed: Boolean(completed),
    completedAt: completed ? (meta.completedAt || now) : ""
  };
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
  await recordChapterWordDelta(dataDir, novelSlug, filename, body, { treatAsNew: true });
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
  await recordChapterWordDelta(dataDir, novelSlug, filename, newContent);
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
  await removeChapterFromWritingLog(dataDir, novelSlug, safeName);
  const { deleteChapterVersionsDir } = await import("./chapterVersions.js");
  await deleteChapterVersionsDir(dataDir, novelSlug, safeName);
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
    await recordChapterWordDelta(dataDir, novelSlug, oldFilename, nextBody);
    return metaWithCount(oldFilename);
  }

  const newPath = path.join(chaptersDir, newFilename);
  if (await exists(newPath)) throw new Error("目标文件已存在");

  await fs.writeFile(newPath, nextBody, "utf8");
  await fs.unlink(oldPath);
  await renameChapterInWritingLog(dataDir, novelSlug, oldFilename, newFilename, nextBody);
  const { renameChapterVersionsDir } = await import("./chapterVersions.js");
  await renameChapterVersionsDir(dataDir, novelSlug, oldFilename, newFilename);

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

