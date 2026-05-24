import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  createChapter,
  createNovel,
  listChapters,
  listNovels,
  novelSummaryFromMeta,
  listStoryFiles,
  readStoryFile,
  updateStoryFile,
  createCharacterCard,
  deleteChapter,
  readChapter,
  renameChapterTitle,
  updateChapter,
  updateNovelSynopsis,
  updateNovelCompleted,
  deleteNovel,
  restoreNovel,
  writeAuditRun,
  readAuditRun,
  listAuditChapterStale,
  readAuditAnalysisText,
  readAuditLedger,
  writeAuditLedger,
  readAuditCharactersIndex,
  writeAuditCharactersIndex,
  readAuditPlacesIndex,
  writeAuditPlacesIndex,
  readAuditOrgsIndex,
  writeAuditOrgsIndex,
  readAuditForeshadowsIndex,
  writeAuditForeshadowsIndex,
  readAuditProgressIndex,
  writeAuditProgressIndex,
  readWritingPack,
  writeWritingPack,
  readTimelineIndex,
  writeTimelineIndex,
  writeAuditAnalysisText,
  writeStoryTimelineMarkdownFromIndex,
  clearAuditDir,
  TimelineIndex,
  WritingPack,
  readInspirationIndex,
  writeInspirationIndex,
  InspirationIndex,
  IdeaItem,
  approximateWordCount
} from "./fsStore.js";
import {
  ChapterVersionError,
  listChapterVersions,
  createChapterVersion,
  readChapterVersionContent,
  restoreChapterVersion,
  listChapterFilenamesOutOfSyncWithLatestDraft
} from "./chapterVersions.js";
import {
  readAppConfigFile,
  writeAppConfigFile,
  resolveDataDirWithSource,
  validateAndNormalizeDataDir,
  type AppSettingsResponse
} from "./appConfig.js";
import { pickDataDirectory } from "./nativeFolderPicker.js";
import { openPathInFileManager } from "./openPathInFileManager.js";
import {
  clearDataDirCaches,
  getDataDir,
  initDataDir,
  registerDataDirCacheClear,
  setDataDir
} from "./dataDirContext.js";
import {
  assertDirEmpty,
  cleanupDirBestEffort,
  copyDataDirContents,
  deleteDataDirTree,
  verifyMigratedData
} from "./dataDirMigrate.js";
import { resolveDataDir, safeSlug } from "./paths.js";
import { computeBookStats } from "./bookStats.js";
import {
  ensureOutlineIndex,
  writeOutlineIndex,
  validateOutlineAgainstChapters,
  mergeOutlinePreview,
  enrichOutlineAiPreview,
  normalizeOutlineIndex,
  type OutlineIndex
} from "./outlineStore.js";
import { runOutlineAi, type OutlineAiMode } from "./outlineAi.js";
import { registerBookSetupRoutes } from "./bookSetup/routes.js";
import { registerBookNotesRoutes } from "./bookNotes/routes.js";
import { migrateBookIds } from "./migrateBookIds.js";
import { mergeOccurredNotes } from "./characterOccurredNotes.js";
import {
  truncateForPrompt,
  buildInspirationPrompt,
  buildInspirationVariantsPrompt,
  buildWritingPackPrompt,
  buildUnifiedAuditPrompt,
  buildAuditPrompt,
  buildThinkingPrompt,
  buildProgressIndexPrompt,
  buildTimelineUpdatePrompt,
  buildTimelineRangeCompressPrompt,
  buildPolishPrompt,
  buildMobileLayoutPrompt,
  buildAdjustPrompt,
  buildChapterTitleSuggestPrompt,
  buildCharacterCardMergePrompt,
  buildAuditCharacterMergePrompt,
  buildAuditPlaceMergePrompt
} from "./prompts/index.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  preflightContinue: false
});

const PORT = Number(process.env.PORT || 3177);
initDataDir(resolveDataDir(process.env.NOVEL_HELPER_DATA_DIR));
void migrateBookIds(getDataDir()).catch((e) => {
  console.warn("[migrateBookIds]", e instanceof Error ? e.message : e);
});

type ModelProviderId = "openai" | "deepseek" | "gemini" | "qwen" | "ollama" | "custom";
type ModelConfig = {
  id: string;
  label: string;
  provider: ModelProviderId;
  baseUrl: string;
  apiKey: string;
  testUrl: string;
  model?: string;
  extraHeadersJson?: string;
};

type SearchHit = {
  kind: "chapters";
  path: string;
  title: string;
  lineNo: number;
  excerpt: string;
  matchRanges: Array<[number, number]>;
};
type SearchGroup = { kind: SearchHit["kind"]; count: number; hits: SearchHit[] };
type SearchResponse = { total: number; groups: SearchGroup[] };

type CachedDoc = {
  kind: SearchHit["kind"];
  absPath: string;
  relPath: string;
  title: string;
  mtimeMs: number;
  lines: string[];
};
type BookSearchCache = {
  updatedAtMs: number;
  docsByPath: Map<string, CachedDoc>;
};
const searchCacheByBook = new Map<string, BookSearchCache>();
registerDataDirCacheClear(() => searchCacheByBook.clear());

function settingsDir() {
  return path.join(getDataDir(), "_settings");
}

async function readModelSettings(): Promise<{ configs: ModelConfig[]; activeId: string | null }> {
  try {
    const p = path.join(settingsDir(), "model-configs.json");
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as any;
  } catch {
    return { configs: [], activeId: null };
  }
}

async function writeModelSettings(v: { configs: ModelConfig[]; activeId: string | null }) {
  await fs.mkdir(settingsDir(), { recursive: true });
  const p = path.join(settingsDir(), "model-configs.json");
  await fs.writeFile(p, JSON.stringify(v, null, 2), "utf8");
}

function stripJsonFence(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    const i = t.indexOf("\n");
    const j = t.lastIndexOf("```");
    if (i >= 0 && j > i) return t.slice(i + 1, j).trim();
  }
  return t;
}

function safeJsonParse<T = any>(raw: string): T | null {
  try {
    return JSON.parse(stripJsonFence(String(raw || ""))) as T;
  } catch {
    return null;
  }
}

/** 地点卡 / 道具卡 / 组织卡等允许 content 为结构化对象；落库与 UI 统一为字符串 */
function stringifyInspirationContent(subtypeOrKind: string, card: any): string {
  const raw = card?.content;
  if (raw == null) return "";
  if (
    (subtypeOrKind === "place" ||
      subtypeOrKind === "item" ||
      subtypeOrKind === "organization" ||
      subtypeOrKind === "event" ||
      subtypeOrKind === "lore" ||
      subtypeOrKind === "technique") &&
    typeof raw === "object" &&
    !Array.isArray(raw)
  ) {
    try {
      return JSON.stringify(raw, null, 2).trim();
    } catch {
      return String(raw).trim();
    }
  }
  return String(raw).trim();
}

function newId(): string {
  return crypto.randomUUID();
}

function normalizeIdeaItem(x: any): IdeaItem | null {
  if (!x || typeof x !== "object") return null;
  const content = String((x as any).content ?? "").trim();
  if (!content) return null;
  const now = new Date().toISOString();
  const statusRaw = String((x as any).status ?? "active");
  const status: IdeaItem["status"] =
    statusRaw === "hidden" || statusRaw === "deleted" || statusRaw === "active" ? (statusRaw as any) : "active";
  return {
    id: String((x as any).id || "").trim() || newId(),
    type: (String((x as any).type || "generation") as any) || "generation",
    subtype: typeof (x as any).subtype === "string" ? (x as any).subtype : undefined,
    title: typeof (x as any).title === "string" ? (x as any).title : undefined,
    content,
    tags: Array.isArray((x as any).tags) ? (x as any).tags.map((t: any) => String(t)).filter(Boolean) : undefined,
    pinned: Boolean((x as any).pinned),
    status,
    createdAt: typeof (x as any).createdAt === "string" && (x as any).createdAt ? (x as any).createdAt : now,
    updatedAt: typeof (x as any).updatedAt === "string" && (x as any).updatedAt ? (x as any).updatedAt : now,
    source: (x as any).source && typeof (x as any).source === "object" ? (x as any).source : undefined,
    meta: (x as any).meta && typeof (x as any).meta === "object" ? (x as any).meta : undefined
  };
}

function normalizeInspirationIndex(idx: InspirationIndex): InspirationIndex {
  const items = Array.isArray((idx as any)?.items) ? (idx as any).items : [];
  return {
    version: 1,
    updatedAt: typeof (idx as any)?.updatedAt === "string" ? (idx as any).updatedAt : "",
    items: items.map(normalizeIdeaItem).filter(Boolean) as IdeaItem[]
  };
}

function buildMemoryContextFromTimeline(tl: TimelineIndex): string {
  const ranges = Array.isArray(tl?.compressedRanges) ? tl.compressedRanges : [];
  const events = Array.isArray(tl?.events) ? tl.events : [];
  const chapters = Array.isArray(tl?.chapters) ? tl.chapters : [];

  const topRanges = [...ranges]
    .sort((a: any, b: any) => (b?.endChapter ?? 0) - (a?.endChapter ?? 0))
    .slice(0, 8)
    .map((r: any) => `- 第${r.startChapter}-${r.endChapter}章：${String(r.summary || "").trim()}`)
    .filter(Boolean);

  const topEvents = [...events]
    .filter((e: any) => String(e?.status ?? "open") !== "done")
    .sort((a: any, b: any) => (b?.endChapter ?? 0) - (a?.endChapter ?? 0))
    .slice(0, 15)
    .map(
      (e: any) =>
        `- 第${e.startChapter}-${e.endChapter}章·${String(e.title || "").trim() || "事件"}：${String(e.summary || "").trim()}`
    )
    .filter(Boolean);

  const lastChapters = [...chapters]
    .sort((a: any, b: any) => (b?.chapter ?? 0) - (a?.chapter ?? 0))
    .slice(0, 10)
    .map((c: any) => `- 第${c.chapter}章·${String(c.title || "").trim() || c.filename}：${String(c.gistL1 || "").trim()}`)
    .filter(Boolean);

  const parts: string[] = [];
  if (topRanges.length) parts.push("【多章压缩摘要（最近）】", ...topRanges, "");
  if (topEvents.length) parts.push("【关键事件（未完成/进行中）】", ...topEvents, "");
  if (lastChapters.length) parts.push("【最近章节摘要】", ...lastChapters, "");
  const txt = parts.join("\n").trim();
  return txt ? txt : "（全书记忆为空：暂无时间线摘要/事件）";
}

function buildMemoryContextFromTimelineBeforeChapter(tl: TimelineIndex, beforeChapterNo: number | null): string {
  const n = Number.isFinite(Number(beforeChapterNo)) ? Math.floor(Number(beforeChapterNo)) : NaN;
  if (!Number.isFinite(n) || n <= 1) {
    return "（当前为前几章：无可用“近章概要”。）";
  }
  const ranges = Array.isArray(tl?.compressedRanges) ? tl.compressedRanges : [];
  const events = Array.isArray(tl?.events) ? tl.events : [];
  const chapters = Array.isArray(tl?.chapters) ? tl.chapters : [];

  const topRanges = [...ranges]
    .filter((r: any) => Number(r?.endChapter ?? 0) < n)
    .sort((a: any, b: any) => (b?.endChapter ?? 0) - (a?.endChapter ?? 0))
    .slice(0, 8)
    .map((r: any) => `- 第${r.startChapter}-${r.endChapter}章：${String(r.summary || "").trim()}`)
    .filter(Boolean);

  const topEvents = [...events]
    .filter((e: any) => String(e?.status ?? "open") !== "done")
    .filter((e: any) => Number(e?.endChapter ?? 0) < n)
    .sort((a: any, b: any) => (b?.endChapter ?? 0) - (a?.endChapter ?? 0))
    .slice(0, 15)
    .map(
      (e: any) =>
        `- 第${e.startChapter}-${e.endChapter}章·${String(e.title || "").trim() || "事件"}：${String(e.summary || "").trim()}`
    )
    .filter(Boolean);

  const lastChapters = [...chapters]
    .filter((c: any) => Number(c?.chapter ?? 0) > 0 && Number(c?.chapter ?? 0) < n)
    .sort((a: any, b: any) => (b?.chapter ?? 0) - (a?.chapter ?? 0))
    .slice(0, 10)
    .map((c: any) => `- 第${c.chapter}章·${String(c.title || "").trim() || c.filename}：${String(c.gistL1 || "").trim()}`)
    .filter(Boolean);

  const parts: string[] = [];
  if (topRanges.length) parts.push("【多章压缩摘要（最近）】", ...topRanges, "");
  if (topEvents.length) parts.push("【关键事件（未完成/进行中）】", ...topEvents, "");
  if (lastChapters.length) parts.push("【最近章节摘要】", ...lastChapters, "");
  const txt = parts.join("\n").trim();
  return txt ? txt : "（全书记忆为空：暂无时间线摘要/事件）";
}

/** 组织生成等：仅注入多章压缩段，不含关键事件/近章摘要/角色地点名单 */
function buildMultiChapterCompressedMemoryOnly(tl: TimelineIndex): string {
  const ranges = Array.isArray(tl?.compressedRanges) ? tl.compressedRanges : [];
  const topRanges = [...ranges]
    .sort((a: any, b: any) => (b?.endChapter ?? 0) - (a?.endChapter ?? 0))
    .slice(0, 8)
    .map((r: any) => `- 第${r.startChapter}-${r.endChapter}章：${String(r.summary || "").trim()}`)
    .filter(Boolean);
  if (!topRanges.length) {
    return "（暂无多章压缩摘要：可在时间线中维护卷/段摘要后再生成。）";
  }
  return ["【全书剧情/世界观记忆 · 多章压缩摘要】", ...topRanges].join("\n");
}

async function listKnownCharacterNames(dataDir: string, novelSlug: string): Promise<string[]> {
  try {
    const idx: any = await readAuditCharactersIndex(dataDir, novelSlug);
    const hidden = new Set(
      Array.isArray(idx?.hiddenNames) ? (idx.hiddenNames as any[]).map((x) => String(x).trim()).filter(Boolean) : []
    );
    const names = Array.isArray(idx?.characters)
      ? (idx.characters as any[])
          .map((c) => String(c?.name || "").trim())
          .filter((n) => n && !hidden.has(n))
      : [];
    return Array.from(new Set(names));
  } catch {
    return [];
  }
}

async function listKnownPlaceNames(dataDir: string, novelSlug: string): Promise<string[]> {
  try {
    const idx: any = await readAuditPlacesIndex(dataDir, novelSlug);
    const hidden = new Set(
      Array.isArray(idx?.hiddenNames) ? (idx.hiddenNames as any[]).map((x) => String(x).trim()).filter(Boolean) : []
    );
    const names = Array.isArray(idx?.places)
      ? (idx.places as any[])
          .map((p) => String(p?.name || "").trim())
          .filter((n) => n && !hidden.has(n))
      : [];
    return Array.from(new Set(names));
  } catch {
    return [];
  }
}

const ITEM_OWNER_INFO_MAX_CHARS = 3600;


function summarizeRelationalHooksForItemOwner(rh: any): string {
  if (!rh || typeof rh !== "object") return "";
  const lines: string[] = [];
  const ft = String(rh.freeText ?? "").trim();
  if (ft) lines.push(ft);
  const rels = Array.isArray(rh.relations) ? rh.relations : [];
  for (const r of rels.slice(0, 14)) {
    const tn = String(r?.targetName || "").trim();
    if (!tn) continue;
    const types = Array.isArray(r?.types) ? r.types.map((x: any) => String(x).trim()).filter(Boolean).join("/") : "";
    const bits = [tn, types, r?.emotionalPolarity, r?.conflictIndex].filter(Boolean).map(String);
    lines.push(bits.join(" · "));
  }
  return truncateForPrompt(lines.join("\n"), 1100);
}

/** 空名 → null（无主/待定语义由提示词侧说明）；找不到卡仍返回弱约束对象。道具与功法生成共用。 */
async function resolveItemOwnerInfo(dataDir: string, novelSlug: string, name?: string | null): Promise<object | null> {
  const n = String(name ?? "").trim();
  if (!n) return null;
  let idx: any;
  try {
    idx = await readAuditCharactersIndex(dataDir, novelSlug);
  } catch {
    return { name: n, note: "未能读取角色索引；请将该名视为用户指定的持有者引用（弱约束）。" };
  }
  const hidden = new Set(
    Array.isArray(idx?.hiddenNames) ? (idx.hiddenNames as any[]).map((x) => String(x).trim()).filter(Boolean) : []
  );
  const chars = Array.isArray(idx?.characters) ? idx.characters : [];
  const profile = chars.find((c: any) => {
    const cn = String(c?.name || "").trim();
    return cn === n && !hidden.has(cn);
  });
  if (!profile) {
    return {
      name: n,
      note: `审核角色卡中未找到「${n}」。生成时请与该姓名可叙事衔接，但不要编造卡中不存在的具体经历细节。`
    };
  }
  const state = profile.state && typeof profile.state === "object" ? profile.state : undefined;
  let stateSnippet: Record<string, unknown> | undefined;
  if (state) {
    stateSnippet = {};
    for (const k of Object.keys(state).slice(0, 14)) {
      const v = (state as any)[k];
      if (v == null) continue;
      const vs = typeof v === "object" ? JSON.stringify(v) : String(v);
      (stateSnippet as any)[k] = vs.length > 220 ? vs.slice(0, 220) + "…" : vs;
    }
  }
  let personalityAnalysis = truncateForPrompt(String(profile.personalityAnalysis || "").trim(), 900);
  let relationalHooks_summary = summarizeRelationalHooksForItemOwner(profile.relationalHooks);
  const base: Record<string, unknown> = {
    name: profile.name,
    role: profile.role,
    tags: Array.isArray(profile.tags) ? profile.tags.slice(0, 24) : profile.tags,
    state: stateSnippet,
    personalityAnalysis: personalityAnalysis || undefined,
    relationalHooks_summary: relationalHooks_summary || undefined
  };
  for (const k of Object.keys(base)) {
    if (base[k] === undefined || base[k] === "") delete base[k];
  }
  const shrinkOnce = () => {
    if (typeof base.personalityAnalysis === "string")
      base.personalityAnalysis = truncateForPrompt(base.personalityAnalysis, 420);
    if (typeof base.relationalHooks_summary === "string")
      base.relationalHooks_summary = truncateForPrompt(base.relationalHooks_summary, 480);
    if (base.state && typeof base.state === "object") {
      const keys = Object.keys(base.state);
      if (keys.length > 8) {
        const next: Record<string, unknown> = {};
        for (const k of keys.slice(0, 8)) next[k] = (base.state as any)[k];
        base.state = next;
      }
    }
  };
  for (let pass = 0; pass < 3; pass++) {
    const json = JSON.stringify(base, null, 2);
    if (json.length <= ITEM_OWNER_INFO_MAX_CHARS) return base;
    shrinkOnce();
  }
  let json = JSON.stringify(base, null, 2);
  if (json.length > ITEM_OWNER_INFO_MAX_CHARS) {
    delete base.relationalHooks_summary;
    delete base.personalityAnalysis;
    delete base.state;
    base.note = "（持有者详情因篇幅限制已裁剪；请结合全书与角色名设计道具叙事）";
    json = JSON.stringify(base, null, 2);
  }
  if (json.length > ITEM_OWNER_INFO_MAX_CHARS) {
    return {
      name: profile.name,
      role: profile.role,
      tags: Array.isArray(profile.tags) ? profile.tags.slice(0, 8) : undefined
    };
  }
  return base;
}


function stripMarkdownFence(s: string): string {
  const t = String(s || "").trim();
  if (!t.startsWith("```")) return t;
  const i = t.indexOf("\n");
  const j = t.lastIndexOf("```");
  if (i >= 0 && j > i) return t.slice(i + 1, j).trim();
  return t;
}

function parseChapterNoFromFilename(filename: string): number | null {
  const m = String(filename || "").match(/^(\d+)_/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function toCleanLines5(raw: any): string[] {
  const s = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join("\n") : "";
  const lines = String(s || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
  const out: string[] = [];
  for (const ln of lines) {
    const t = ln.replace(/^[-*]\s+/, "").trim();
    if (!t) continue;
    out.push(t);
    if (out.length >= 5) break;
  }
  while (out.length < 5) out.push("");
  return out.slice(0, 5);
}

function clampList<T>(arr: T[], max: number): T[] {
  if (!Array.isArray(arr)) return [];
  if (!Number.isFinite(max) || max <= 0) return [];
  return arr.slice(0, max);
}

function isTextFile(p: string): boolean {
  const lower = p.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".json");
}

async function listFilesRecursive(dir: string, relBase = ""): Promise<Array<{ abs: string; rel: string }>> {
  const out: Array<{ abs: string; rel: string }> = [];
  let entries: any[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...(await listFilesRecursive(abs, rel)));
      continue;
    }
    if (e.isFile() && isTextFile(e.name)) out.push({ abs, rel });
  }
  return out;
}

function extractTextFromAuditJson(parsed: any): string[] {
  const lines: string[] = [];
  const push = (k: string, v: string) => {
    const t = String(v || "").replace(/\r/g, "").trim();
    if (!t) return;
    lines.push(`${k}: ${t}`);
  };

  const allowKey = (k: string) =>
    [
      "title",
      "name",
      "summary",
      "detail",
      "issue",
      "suggestion",
      "gistL1",
      "lastProgress",
      "note",
      "description",
      "lastNote"
    ].includes(k);

  const walk = (node: any, keyHint = "") => {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      if (keyHint) push(keyHint, node);
      else {
        const t = node.trim();
        if (t) lines.push(t);
      }
      return;
    }
    if (typeof node === "number" || typeof node === "boolean") return;
    if (Array.isArray(node)) {
      for (const it of node) walk(it, keyHint);
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        const kk = String(k);
        if (allowKey(kk) && typeof v === "string") push(kk, v);
        else walk(v, allowKey(kk) ? kk : keyHint || kk);
      }
    }
  };

  walk(parsed, "");
  // 去重 + 截断（避免 audit 噪音过多）
  const uniq = [...new Set(lines.map((x) => x.trim()).filter(Boolean))].slice(0, 4000);
  return uniq.length ? uniq : [];
}

function findAllMatchesInLine(line: string, q: string, caseSensitive: boolean): Array<[number, number]> {
  if (!q) return [];
  const src = caseSensitive ? line : line.toLowerCase();
  const needle = caseSensitive ? q : q.toLowerCase();
  const out: Array<[number, number]> = [];
  let i = 0;
  while (true) {
    const idx = src.indexOf(needle, i);
    if (idx < 0) break;
    out.push([idx, idx + needle.length]);
    i = idx + Math.max(1, needle.length);
    if (out.length > 50) break;
  }
  return out;
}

function isWholeWordOk(line: string, start: number, end: number): boolean {
  const isWord = (c: string) => /[A-Za-z0-9_]/.test(c);
  const left = start - 1 >= 0 ? line[start - 1] : "";
  const right = end < line.length ? line[end] : "";
  if (left && isWord(left)) return false;
  if (right && isWord(right)) return false;
  return true;
}

async function buildOrRefreshBookSearchCache(slug: string): Promise<BookSearchCache> {
  const key = safeSlug(slug);
  const cached = searchCacheByBook.get(key) || { updatedAtMs: 0, docsByPath: new Map<string, CachedDoc>() };
  const bookDir = path.join(getDataDir(), key);

  const candidates: Array<{ kind: CachedDoc["kind"]; abs: string; rel: string }> = [];
  // 仅搜索章节正文（不包含 story / meta/audit）
  const chaptersDir = path.join(bookDir, "chapters");
  const files = await listFilesRecursive(chaptersDir, "chapters");
  for (const f of files) candidates.push({ kind: "chapters", abs: f.abs, rel: f.rel });

  const seen = new Set<string>();
  for (const c of candidates) {
    seen.add(c.rel);
    let stat: any;
    try {
      stat = await fs.stat(c.abs);
    } catch {
      continue;
    }
    const prev = cached.docsByPath.get(c.rel);
    if (prev && prev.mtimeMs === stat.mtimeMs && prev.kind === c.kind) continue;

    let raw = "";
    try {
      raw = await fs.readFile(c.abs, "utf8");
    } catch {
      raw = "";
    }
    const lines: string[] = raw.replace(/\r/g, "").split("\n");
    const title = path.basename(c.abs, ".md");

    cached.docsByPath.set(c.rel, {
      kind: c.kind,
      absPath: c.abs,
      relPath: c.rel,
      title,
      mtimeMs: stat.mtimeMs,
      lines
    });
  }

  // 清理已删除文件
  for (const rel of [...cached.docsByPath.keys()]) {
    if (!seen.has(rel)) cached.docsByPath.delete(rel);
  }
  cached.updatedAtMs = Date.now();
  searchCacheByBook.set(key, cached);
  return cached;
}





async function callModel(cfg: ModelConfig, prompt: string): Promise<string> {
  const provider = cfg.provider;
  const baseUrl = (cfg.baseUrl || "").replace(/\/$/, "");
  const model = (cfg.model || "").trim();
  if (!baseUrl) throw new Error("Model baseUrl 为空");

  const extraHeaders: Record<string, string> = {};
  if (cfg.extraHeadersJson?.trim()) {
    try {
      const j = JSON.parse(cfg.extraHeadersJson) as Record<string, string>;
      for (const [k, v] of Object.entries(j)) extraHeaders[k] = String(v);
    } catch {
      throw new Error("extraHeadersJson 不是合法 JSON");
    }
  }

  if (provider === "ollama") {
    if (!model) throw new Error("Ollama 需要填写模型名");
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: "只输出 JSON，不要 markdown，不要解释。" },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    const j = (await res.json()) as any;
    const text = j?.message?.content;
    if (typeof text !== "string") throw new Error("Ollama 返回格式异常");
    return text;
  }

  if (provider === "openai" || provider === "deepseek" || provider === "custom") {
    if (!model) throw new Error("请填写模型名");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extraHeaders
    };
    if (cfg.apiKey?.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "只输出 JSON，不要 markdown，不要解释。" },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    const j = (await res.json()) as any;
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("OpenAI兼容接口返回格式异常");
    return text;
  }

  throw new Error(`暂不支持 provider: ${provider}`);
}

function normalizeBaseUrlForOpenAICompatible(raw: string): string {
  const u = (raw || "").trim().replace(/\/$/, "");
  if (!u) return u;
  // openai-compatible 期望 baseURL 指向 /v1
  if (u.endsWith("/v1")) return u;
  return `${u}/v1`;
}

type ReasoningStreamEvent =
  | { type: "reasoning"; textDelta: string }
  | { type: "log"; text: string }
  | { type: "phase"; step: number; total: number; label: string }
  | { type: "modelPrompt"; stage: "thinking" | "audit"; prompt: string }
  | { type: "done"; run: any }
  | { type: "error"; message: string };

function parseChapterNumberFromFilename(filename: string): number {
  const m = String(filename || "").match(/^(\d+)_/);
  if (!m) return NaN;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : NaN;
}

/** 防止把「审计 JSON」误当作思考过程推给前端（常见于模型未遵守禁止 JSON 的提示）。 */
function looksLikeAuditJsonFragment(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.startsWith("{") && t.includes('"gistL1"')) return true;
  if (t.includes('"consistencyChecks"') && t.includes('"entities"')) return true;
  if (t.includes('"ledgerUpdates"') && t.includes('"uiInjection"')) return true;
  return false;
}

function createAiSdkModel(cfg: ModelConfig): { model: any; providerOptions: any } {
  const modelName = (cfg.model || "").trim();
  if (!modelName) throw new Error("请先填写模型名");

  const provider = cfg.provider;

  let model: any;
  let providerOptions: any = undefined;
  if (provider === "openai") {
    const openaiClient = createOpenAI({
      apiKey: cfg.apiKey?.trim() || undefined,
      baseURL: cfg.baseUrl?.trim() || undefined
    });
    model = openaiClient(modelName);
    providerOptions = { openai: { reasoningSummary: "detailed" } };
  } else if (provider === "deepseek" || provider === "custom") {
    const client = createOpenAICompatible({
      name: provider,
      apiKey: cfg.apiKey?.trim() || undefined,
      baseURL: normalizeBaseUrlForOpenAICompatible(cfg.baseUrl)
    } as any);
    model = (client as any)(modelName);
  } else if (provider === "ollama") {
    // 不用 ollama-ai-provider：AI SDK 5 对其内部 ollama.responses（v3 spec）会报错；
    // Ollama 内置 OpenAI 兼容 /v1/chat/completions，走 openai-compatible（v2）即可。
    const client = createOpenAICompatible({
      name: "ollama",
      apiKey: cfg.apiKey?.trim() || "ollama",
      baseURL: normalizeBaseUrlForOpenAICompatible(cfg.baseUrl)
    } as any);
    model = (client as any)(modelName);
    providerOptions = undefined;
  } else {
    throw new Error(`暂不支持 provider: ${provider}`);
  }

  return { model, providerOptions };
}


async function generateCharacterCardMarkdownWithAiSdk(input: { cfg: ModelConfig; prompt: string }): Promise<string> {
  const { cfg, prompt } = input;
  const { model, providerOptions } = createAiSdkModel(cfg);
  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
    providerOptions
  } as any);
  return String(text || "");
}


async function generateAuditCharacterMergeDraftWithAiSdk(input: { cfg: ModelConfig; prompt: string }): Promise<any> {
  const { cfg, prompt } = input;
  const { model, providerOptions } = createAiSdkModel(cfg);
  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
    providerOptions
  } as any);
  const jsonText = stripJsonFence(String(text || ""));
  const parsed = JSON.parse(jsonText);
  return parsed;
}

/** 第一步：仅把「可展示思考」流式推到 UI（不包含最终 JSON）。 */
async function streamThinkingTraceWithAiSdk(input: {
  cfg: ModelConfig;
  prompt: string;
  onEvent: (e: ReasoningStreamEvent) => void;
}): Promise<void> {
  const { cfg, prompt, onEvent } = input;
  const emitLog = (t: string) => onEvent({ type: "log", text: t.endsWith("\n") ? t : `${t}\n` });
  const { model, providerOptions } = createAiSdkModel(cfg);
  let warnedAuditJsonAsThinking = false;

  emitLog(
    `AI SDK：思考阶段开始 provider=${cfg.provider} label=${cfg.label} model=${String(cfg.model || "").trim() || "(default)"} baseUrl=${cfg.baseUrl}`
  );
  // 某些 provider（尤其是 openai-compatible 的实现）可能不稳定：不返回增量、或长时间卡住不结束。
  // 这里做超时降级：避免 UI 永远停在第 2/5 阶段。
  const controller = new AbortController();
  const timeoutMs = 25_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let result: any;
  try {
    const t0 = Date.now();
    result = await streamText({
      model,
      // 用 messages 走 chat/completions 流式；Ollama 的流式输出更稳定
      messages: [{ role: "user", content: prompt }],
      ...(cfg.provider === "ollama" ? {} : { reasoning: "high" as const }),
      providerOptions,
      abortSignal: controller.signal
    } as any);
    emitLog(`AI SDK：思考阶段 streamText 建连成功（${Date.now() - t0}ms），开始接收增量…`);
  } catch (e: any) {
    clearTimeout(timer);
    const msg = String(e?.name || "") === "AbortError" ? `思考过程流式超时（>${Math.floor(timeoutMs / 1000)}s），已跳过展示。` : "";
    if (msg) emitLog(`AI SDK：${msg}`);
    else emitLog(`AI SDK：思考阶段 streamText 失败：${e?.message || String(e)}`);
    return;
  }

  let sawReasoningDelta = false;
  let reasoningChars = 0;
  let textDeltaChars = 0;

  // 同步消费 fullStream：reasoning（若有）与正文增量并行到达，避免“先读完流再等 textStream”导致一次性输出
  try {
    const t0 = Date.now();
    for await (const part of result.fullStream as any) {
      if (controller.signal.aborted) {
        emitLog(`AI SDK：思考过程流式超时（>${Math.floor(timeoutMs / 1000)}s），已跳过展示。`);
        break;
      }
    if (part.type === "reasoning" && typeof part.textDelta === "string" && part.textDelta) {
      if (looksLikeAuditJsonFragment(part.textDelta)) {
        if (!warnedAuditJsonAsThinking) {
          warnedAuditJsonAsThinking = true;
            emitLog("AI SDK：提示：模型在「思考」通道输出了疑似审计 JSON，已忽略该片段（JSON 将在第二阶段静默生成）。");
        }
        continue;
      }
      sawReasoningDelta = true;
        reasoningChars += part.textDelta.length;
      onEvent({ type: "reasoning", textDelta: part.textDelta });
      continue;
    }
    if (part.type === "text-delta" && typeof part.textDelta === "string" && part.textDelta) {
      // 没有原生 reasoning 时，把正文增量当作“可展示思考”
      if (!sawReasoningDelta) {
        if (looksLikeAuditJsonFragment(part.textDelta)) {
          if (!warnedAuditJsonAsThinking) {
            warnedAuditJsonAsThinking = true;
              emitLog("AI SDK：提示：模型在「思考」通道输出了疑似审计 JSON，已忽略该片段（JSON 将在第二阶段静默生成）。");
          }
        } else {
            textDeltaChars += part.textDelta.length;
          onEvent({ type: "reasoning", textDelta: part.textDelta });
        }
      }
      continue;
    }
    if (part.type === "error") {
      throw new Error(part.error?.message || "模型调用失败");
    }
    }
    emitLog(
      `AI SDK：思考阶段 fullStream 结束（${Date.now() - t0}ms），reasoningChars=${reasoningChars} textDeltaChars=${textDeltaChars}`
    );
  } catch (e: any) {
    const msg =
      String(e?.name || "") === "AbortError"
        ? `思考过程流式超时（>${Math.floor(timeoutMs / 1000)}s），已跳过展示。`
        : "";
    if (msg) emitLog(`AI SDK：${msg}`);
    else emitLog(`AI SDK：思考阶段 fullStream 失败：${e?.message || String(e)}`);
    return;
  } finally {
    clearTimeout(timer);
  }

  // 兜底：极少数 provider 可能只在结束时聚合出 text（但仍应尽量走上面的增量）
  if (!sawReasoningDelta) {
    try {
      const t0 = Date.now();
      const t = await (result as any).text;
      if (typeof t === "string" && t.trim()) {
        if (looksLikeAuditJsonFragment(t)) {
          emitLog("AI SDK：提示：思考阶段聚合文本疑似审计 JSON，已跳过展示。");
        } else {
          emitLog(`AI SDK：思考阶段无增量，fallback 聚合文本成功（${Date.now() - t0}ms，len=${t.length}）`);
          onEvent({ type: "reasoning", textDelta: t });
        }
      } else {
        emitLog(`AI SDK：思考阶段无增量，fallback 聚合文本为空（${Date.now() - t0}ms）`);
      }
    } catch {
      // ignore
    }
  }
}

/** 第二步：静默生成审计 JSON（不透传到 UI）。 */
async function generateAuditJsonWithAiSdk(input: {
  cfg: ModelConfig;
  prompt: string;
  onEvent?: (e: ReasoningStreamEvent) => void;
}): Promise<string> {
  const { cfg, prompt, onEvent } = input;
  const emitLog = (t: string) => {
    try {
      onEvent?.({ type: "log", text: t.endsWith("\n") ? t : `${t}\n` });
    } catch {
      // ignore
    }
  };
  const { model, providerOptions } = createAiSdkModel(cfg);

  const t0 = Date.now();
  emitLog(
    `AI SDK：JSON阶段开始 provider=${cfg.provider} label=${cfg.label} model=${String(cfg.model || "").trim() || "(default)"}`
  );

  const controller = new AbortController();
  // 章节审计 prompt 可能很长，且不同本地/云模型速度差异很大：放宽超时，避免频繁 AbortError。
  const timeoutMs = 180_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text: string | undefined = "";
  try {
    const r = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
      providerOptions,
      abortSignal: controller.signal
    } as any);
    text = (r as any)?.text;
  } catch (e: any) {
    const isAbort = String(e?.name || "") === "AbortError";
    const msg = isAbort
      ? `章节分析超时（>${Math.floor(timeoutMs / 1000)}s），已中断。建议：减少全书记忆长度/缩短章节正文、或换更快的模型/提高模型服务性能。`
      : `章节分析失败：${e?.message || String(e)}`;
    emitLog(`AI SDK：${msg}`);
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }

  if (!text?.trim()) throw new Error("模型未返回审计 JSON");
  emitLog(`AI SDK：JSON阶段完成（${Date.now() - t0}ms，chars=${String(text || "").length}）`);
  return text;
}

type TimelineModelOutput = {
  compressionSuggestions?: Array<{ startChapter: number; endChapter: number; why?: string }>;
  events?: Array<{
    id?: string;
    title?: string;
    startChapter?: number;
    endChapter?: number;
    summary?: string;
    status?: "open" | "done";
  }>;
};


async function generateTimelineUpdateWithAiSdk(input: { cfg: ModelConfig; prompt: string }): Promise<TimelineModelOutput> {
  const { cfg, prompt } = input;
  const { model, providerOptions } = createAiSdkModel(cfg);
  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "low" as const }),
    providerOptions
  } as any);
  const jsonText = stripJsonFence(text || "");
  try {
    return JSON.parse(jsonText) as TimelineModelOutput;
  } catch {
    return {};
  }
}

function normalizeTimelineIndex(idx: TimelineIndex): TimelineIndex {
  const chapters = Array.isArray(idx.chapters) ? idx.chapters : [];
  const compressedRanges = Array.isArray(idx.compressedRanges) ? idx.compressedRanges : [];
  const events = Array.isArray(idx.events) ? idx.events : [];
  const compressionSuggestions = Array.isArray(idx.compressionSuggestions) ? idx.compressionSuggestions : [];
  const manual = idx.manual && typeof idx.manual === "object" ? idx.manual : ({ doneEventIds: [] } as any);
  manual.doneEventIds = Array.isArray((manual as any).doneEventIds) ? (manual as any).doneEventIds : [];
  return {
    version: 1,
    updatedAt: typeof idx.updatedAt === "string" ? idx.updatedAt : "",
    chapters,
    compressedRanges,
    events,
    compressionSuggestions,
    manual
  };
}

async function updateTimelineIndexAfterAudit(input: {
  cfg: ModelConfig;
  slug: string;
  filename: string;
  run: any;
  ledger: any;
}): Promise<TimelineIndex> {
  const { cfg, slug, filename, run, ledger } = input;
  const idx = normalizeTimelineIndex(await readTimelineIndex(getDataDir(), slug));
  const n = parseChapterNumberFromFilename(filename);
  const title = String(run?.chapter?.title || filename.replace(/\.md$/, ""));
  const auditedAt = String(run?.chapter?.auditedAt || new Date().toISOString());
  const gistL1 = String(run?.gistL1 || "").trim();

  // upsert chapter summary
  const existingI = idx.chapters.findIndex((c) => c.filename === filename);
  const row = { chapter: Number.isFinite(n) ? n : 0, filename, title, auditedAt, gistL1 };
  if (existingI >= 0) idx.chapters[existingI] = row;
  else idx.chapters.push(row);
  idx.chapters.sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));

  // generate suggestions/events using recent summaries
  const recent = [...idx.chapters].slice(-40).map((c) => ({
    chapter: c.chapter,
    title: c.title,
    gistL1: c.gistL1
  }));
  const prompt = buildTimelineUpdatePrompt({
    bookSlug: slug,
    recentChapterSummaries: recent,
    compressedRanges: (idx.compressedRanges ?? []).slice(-20).map((r) => ({
      startChapter: r.startChapter,
      endChapter: r.endChapter,
      summary: r.summary
    })),
    doneEventIds: idx.manual?.doneEventIds ?? [],
    closedLoops: ledger?.closedLoops ?? []
  });
  const out = await generateTimelineUpdateWithAiSdk({ cfg, prompt });
  if (Array.isArray(out.compressionSuggestions)) {
    idx.compressionSuggestions = out.compressionSuggestions
      .map((s) => ({
        startChapter: Math.max(1, Math.floor(Number(s.startChapter || 0))),
        endChapter: Math.max(1, Math.floor(Number(s.endChapter || 0))),
        why: String(s.why || "").trim() || "—"
      }))
      .filter((s) => Number.isFinite(s.startChapter) && Number.isFinite(s.endChapter) && s.endChapter >= s.startChapter)
      .slice(0, 3);
  }
  idx.updatedAt = auditedAt;
  await writeTimelineIndex(getDataDir(), slug, idx);
  await writeStoryTimelineMarkdownFromIndex(getDataDir(), slug, idx);
  return idx;
}

function sseWrite(res: any, payload: any) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function finalizeAuditFromJsonText(slug: string, filename: string, jsonText: string) {
  const run = JSON.parse(jsonText);

  run.chapter = run.chapter || {};
  run.chapter.filename = filename;
  run.chapter.auditedAt = run.chapter.auditedAt || new Date().toISOString();
  run.gistL1 = run.gistL1 || "";
  run.entities = run.entities || { characters: [], events: [] };
  run.consistencyChecks = run.consistencyChecks || [];
  run.causalAnchors = run.causalAnchors || { setups: [], payoffs: [] };
  run.impactAnalysis = run.impactAnalysis || [];
  run.compression = run.compression || { l2Pruning: null, mergeCandidates: null };
  run.ledgerUpdates = run.ledgerUpdates || { openLoops: [], closedLoops: [] };
  run.uiInjection = run.uiInjection || { spotlightCharacters: [], spotlightTags: [] };

  // 绑定分析到“正文快照”（用于前端 dirty 判断）
  try {
    const raw = await readChapter(getDataDir(), slug, filename);
    const normalized = String(raw || "").replace(/\r/g, "");
    const hash = crypto.createHash("sha1").update(normalized, "utf8").digest("hex");
    run.source = { contentHash: hash, contentLength: normalized.length };
    // 若模型输出的 wordCount 不可靠，至少确保存在
    if (!Number.isFinite(Number(run?.chapter?.wordCount))) run.chapter.wordCount = normalized.length;
  } catch {
    // ignore: 不阻断审计落盘
  }

  await writeAuditRun(getDataDir(), slug, filename, run);

  const idx = await readAuditCharactersIndex(getDataDir(), slug);
  const auditedAtIso = String(run?.chapter?.auditedAt || new Date().toISOString());
  const normStr = (v: any) => (typeof v === "string" ? v.trim() : "");
  const uniqStrs = (arr: any) =>
    [...new Set((Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter(Boolean))];
  const mergeStrArr = (a: any, b: any) => uniqStrs([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
  const hasVal = (v: any) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "boolean") return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return false;
  };
  const mergeObjNonEmpty = (prev: any, next: any) => {
    const out: any = { ...(prev && typeof prev === "object" ? prev : {}) };
    if (!next || typeof next !== "object") return out;
    for (const [k, v] of Object.entries(next)) {
      if (!hasVal(v)) continue;
      out[k] = v;
    }
    return out;
  };
  const mergeMask = (a: any, b: any) => {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const out: any[] = [];
    const seen = new Set<string>();
    for (const it of [...arrA, ...arrB]) {
      const ctx = normStr((it as any)?.context);
      const persona = normStr((it as any)?.persona);
      if (!ctx && !persona) continue;
      const key = `${ctx}@@${persona}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ context: ctx, persona });
    }
    return out;
  };
  const mergeRelations = (a: any, b: any) => {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const byTarget = new Map<string, any>();
    for (const r of [...arrA, ...arrB]) {
      const targetName = normStr((r as any)?.targetName);
      if (!targetName) continue;
      const prev = byTarget.get(targetName) || { targetName };
      const merged = {
        ...prev,
        targetName,
        types: mergeStrArr(prev.types, (r as any)?.types),
        emotionalPolarity: hasVal((r as any)?.emotionalPolarity) ? normStr((r as any)?.emotionalPolarity) : prev.emotionalPolarity,
        conflictIndex: hasVal((r as any)?.conflictIndex) ? normStr((r as any)?.conflictIndex) : prev.conflictIndex,
        sharedSecrets: mergeStrArr(prev.sharedSecrets, (r as any)?.sharedSecrets)
      };
      byTarget.set(targetName, merged);
    }
    return [...byTarget.values()].sort((x, y) => String(x.targetName).localeCompare(String(y.targetName), "zh-Hans-CN"));
  };
  const mergeFreeText = (a: any, b: any) => {
    const ta = normStr(a);
    const tb = normStr(b);
    if (!tb) return ta;
    if (!ta) return tb;
    if (ta.includes(tb)) return ta;
    return `${ta}\n${tb}`;
  };

  const byName = new Map<string, any>(
    (idx.characters || [])
      .map((c: any) => ({ ...(c && typeof c === "object" ? c : {}), name: normStr(c?.name) }))
      .filter((c: any) => c.name)
      .map((c: any) => [c.name, c])
  );

  for (const raw of run?.entities?.characters || []) {
    const name = normStr(raw?.name);
    if (!name) continue;
    const prev = byName.get(name);
    const next = raw && typeof raw === "object" ? raw : {};

    const merged: any = prev ? { ...prev } : { name, updatedAt: auditedAtIso };
    const locks = prev?.locks && typeof prev.locks === "object" ? prev.locks : {};

    // 基础字段
    if (hasVal(next.role)) merged.role = normStr(next.role);
    if (!locks.tags && Array.isArray(next.tags)) merged.tags = mergeStrArr(prev?.tags, next.tags);

    // 状态 / 业力账本
    // state 不做锁定：始终以“最新状态”增量覆盖非空字段
    if (next.state && typeof next.state === "object") merged.state = mergeObjNonEmpty(prev?.state, next.state);

    // 社会身份标签
    if (!locks.socialTags && next.socialTags && typeof next.socialTags === "object") {
      const stPrev = prev?.socialTags && typeof prev.socialTags === "object" ? prev.socialTags : {};
      const stNext = next.socialTags as any;
      merged.socialTags = {
        ...stPrev,
        ...(hasVal(stNext.profession) ? { profession: normStr(stNext.profession) } : null),
        ...(hasVal(stNext.class) ? { class: normStr(stNext.class) } : null),
        ...(Array.isArray(stNext.titles) ? { titles: mergeStrArr(stPrev.titles, stNext.titles) } : null),
        ...(Array.isArray(stNext.other) ? { other: mergeStrArr(stPrev.other, stNext.other) } : null)
      };
    }

    // 历史债（列表）
    if (!locks.historicalDebts && Array.isArray(next.historicalDebts))
      merged.historicalDebts = mergeStrArr(prev?.historicalDebts, next.historicalDebts);

    // 发生过的事情：从本章事件按 participants 命中自动抽取（增量 + 去重）
    if (!locks.occurredNotes) {
      const extracted: string[] = [];
      for (const ev of run?.entities?.events || []) {
        if (!ev || typeof ev !== "object") continue;
        const ps = Array.isArray((ev as any).participants) ? (ev as any).participants : [];
        const hit = ps.some((p: any) => String(p || "").trim() === name);
        if (!hit) continue;
        const txt =
          String((ev as any).summary || (ev as any).what || (ev as any).event || (ev as any).item || "").trim() ||
          "";
        if (txt) extracted.push(txt);
      }
      if (extracted.length) merged.occurredNotes = mergeOccurredNotes(prev?.occurredNotes, extracted);
    }

    // 叙事驱动力
    if (!locks.narrativeDrives && next.narrativeDrives && typeof next.narrativeDrives === "object") {
      const ndPrev = prev?.narrativeDrives && typeof prev.narrativeDrives === "object" ? prev.narrativeDrives : {};
      const ndNext = next.narrativeDrives as any;
      merged.narrativeDrives = {
        ...ndPrev,
        ...(hasVal(ndNext.want) ? { want: normStr(ndNext.want) } : null),
        ...(hasVal(ndNext.need) ? { need: normStr(ndNext.need) } : null),
        ...(hasVal(ndNext.moralCompass) ? { moralCompass: normStr(ndNext.moralCompass) } : null),
        ...(Array.isArray(ndNext.flaws) ? { flaws: mergeStrArr(ndPrev.flaws, ndNext.flaws) } : null),
        ...(Array.isArray(ndNext.blindSpots) ? { blindSpots: mergeStrArr(ndPrev.blindSpots, ndNext.blindSpots) } : null)
      };
    }

    // 表现力指纹
    if (!locks.fingerprints && next.fingerprints && typeof next.fingerprints === "object") {
      const fpPrev = prev?.fingerprints && typeof prev.fingerprints === "object" ? prev.fingerprints : {};
      const fpNext = next.fingerprints as any;
      merged.fingerprints = {
        ...fpPrev,
        ...(Array.isArray(fpNext.linguisticStyle) ? { linguisticStyle: mergeStrArr(fpPrev.linguisticStyle, fpNext.linguisticStyle) } : null),
        ...(Array.isArray(fpNext.catchphrases) ? { catchphrases: mergeStrArr(fpPrev.catchphrases, fpNext.catchphrases) } : null),
        ...(Array.isArray(fpNext.mannerisms) ? { mannerisms: mergeStrArr(fpPrev.mannerisms, fpNext.mannerisms) } : null),
        ...(Array.isArray(fpNext.mask) ? { mask: mergeMask(fpPrev.mask, fpNext.mask) } : null)
      };
    }

    // 关系钩子（结构化 + 兜底自由文本）
    if (!locks.relationalHooks && next.relationalHooks && typeof next.relationalHooks === "object") {
      const rhPrev = prev?.relationalHooks && typeof prev.relationalHooks === "object" ? prev.relationalHooks : {};
      const rhNext = next.relationalHooks as any;
      merged.relationalHooks = {
        ...rhPrev,
        ...(Array.isArray(rhNext.relations) ? { relations: mergeRelations(rhPrev.relations, rhNext.relations) } : null),
        ...(hasVal(rhNext.freeText) ? { freeText: mergeFreeText(rhPrev.freeText, rhNext.freeText) } : null)
      };
    }

    // 兼容旧字段：性格分析
    if (hasVal(next.personalityAnalysis)) merged.personalityAnalysis = normStr(next.personalityAnalysis);

    merged.name = name;
    merged.updatedAt = auditedAtIso;
    byName.set(name, merged);
  }

  idx.characters = [...byName.values()].sort((a: any, b: any) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "zh-Hans-CN")
  );
  idx.updatedAt = auditedAtIso;
  (idx as any).version = 2;
  await writeAuditCharactersIndex(getDataDir(), slug, idx);

  // 自动抽取地点：全书共享 placesIndex.json
  const placesIdx = await readAuditPlacesIndex(getDataDir(), slug);
  const placeExisting = new Map<string, any>(
    (placesIdx.places || [])
      .map((p: any) => ({
        ...p,
        name: String(p?.name || "").trim()
      }))
      .filter((p: any) => p.name)
      .map((p: any) => [p.name, p])
  );
  const chapterNum = parseChapterNumberFromFilename(filename);
  const occurrences: Array<{ name: string; note: string }> = [];
  // 1) 从事件里找常见地点字段
  for (const ev of run?.entities?.events || []) {
    if (!ev || typeof ev !== "object") continue;
    const cand =
      (ev as any).place ??
      (ev as any).location ??
      (ev as any).where ??
      (ev as any)["地点"] ??
      (ev as any)["发生地点"];
    const name = String(cand || "").trim();
    if (!name) continue;
    const note =
      String((ev as any).summary || (ev as any).what || (ev as any).event || "").trim() ||
      String(run.gistL1 || "").trim();
    occurrences.push({ name, note });
  }
  // 2) 兜底：从本章出现的角色 state.location 里补
  for (const c of run?.entities?.characters || []) {
    const loc = String(c?.state?.location || "").trim();
    if (!loc) continue;
    const note = String(run.gistL1 || "").trim();
    occurrences.push({ name: loc, note });
  }
  const uniq = new Map<string, string>();
  for (const o of occurrences) {
    if (!uniq.has(o.name)) uniq.set(o.name, o.note);
  }
  for (const [name, note] of uniq) {
    const prev = placeExisting.get(name);
    if (prev) {
      prev.lastSeenAt = run.chapter.auditedAt;
      prev.lastChapter = Number.isFinite(chapterNum) ? chapterNum : prev.lastChapter;
      prev.lastNote = note || prev.lastNote || "";
      prev.updatedAt = run.chapter.auditedAt;
      placeExisting.set(name, prev);
    } else {
      placeExisting.set(name, {
        name,
        description: "",
        lastNote: note || "",
        firstSeenAt: run.chapter.auditedAt,
        lastSeenAt: run.chapter.auditedAt,
        firstChapter: Number.isFinite(chapterNum) ? chapterNum : 0,
        lastChapter: Number.isFinite(chapterNum) ? chapterNum : 0,
        updatedAt: run.chapter.auditedAt
      });
    }
  }
  placesIdx.places = [...placeExisting.values()].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "zh-Hans-CN"));
  if (!Array.isArray(placesIdx.hiddenNames)) placesIdx.hiddenNames = [];
  placesIdx.updatedAt = run.chapter.auditedAt;
  await writeAuditPlacesIndex(getDataDir(), slug, placesIdx);

  // 自动抽取组织：全书共享 orgsIndex.json
  const orgsIdx = await readAuditOrgsIndex(getDataDir(), slug);
  const orgExisting = new Map<string, any>(
    (orgsIdx.orgs || [])
      .map((o: any) => ({ ...o, name: String(o?.name || "").trim() }))
      .filter((o: any) => o.name)
      .map((o: any) => [o.name, o])
  );
  const orgOccurrences: Array<{ name: string; note: string }> = [];
  for (const ev of run?.entities?.events || []) {
    if (!ev || typeof ev !== "object") continue;
    const cand =
      (ev as any).org ??
      (ev as any).organization ??
      (ev as any).faction ??
      (ev as any)["组织"] ??
      (ev as any)["势力"];
    const name = String(cand || "").trim();
    if (!name) continue;
    const note =
      String((ev as any).summary || (ev as any).what || (ev as any).event || "").trim() ||
      String(run.gistL1 || "").trim();
    orgOccurrences.push({ name, note });
  }
  const orgUniq = new Map<string, string>();
  for (const o of orgOccurrences) if (!orgUniq.has(o.name)) orgUniq.set(o.name, o.note);
  for (const [name, note] of orgUniq) {
    const prev = orgExisting.get(name);
    if (prev) {
      prev.lastSeenAt = run.chapter.auditedAt;
      prev.lastChapter = Number.isFinite(chapterNum) ? chapterNum : prev.lastChapter;
      prev.lastNote = note || prev.lastNote || "";
      prev.updatedAt = run.chapter.auditedAt;
      orgExisting.set(name, prev);
    } else {
      orgExisting.set(name, {
        name,
        description: "",
        lastNote: note || "",
        firstSeenAt: run.chapter.auditedAt,
        lastSeenAt: run.chapter.auditedAt,
        firstChapter: Number.isFinite(chapterNum) ? chapterNum : 0,
        lastChapter: Number.isFinite(chapterNum) ? chapterNum : 0,
        updatedAt: run.chapter.auditedAt
      });
    }
  }
  orgsIdx.orgs = [...orgExisting.values()].sort((a: any, b: any) =>
    String(a.name).localeCompare(String(b.name), "zh-Hans-CN")
  );
  if (!Array.isArray(orgsIdx.hiddenNames)) orgsIdx.hiddenNames = [];
  orgsIdx.updatedAt = run.chapter.auditedAt;
  await writeAuditOrgsIndex(getDataDir(), slug, orgsIdx);

  const ledger = await readAuditLedger(getDataDir(), slug);
  ledger.updatedAt = run.chapter.auditedAt;
  ledger.openLoops = ledger.openLoops || [];
  ledger.closedLoops = ledger.closedLoops || [];
  if (run.ledgerUpdates?.openLoops?.length) ledger.openLoops.push(...run.ledgerUpdates.openLoops);
  if (run.ledgerUpdates?.closedLoops?.length) ledger.closedLoops.push(...run.ledgerUpdates.closedLoops);
  await writeAuditLedger(getDataDir(), slug, ledger);

  // 自动沉淀伏笔：全书共享 foreshadowsIndex.json（来源 ledgerUpdates）
  const foIdx = await readAuditForeshadowsIndex(getDataDir(), slug);
  const byId = new Map<string, any>(
    (foIdx.foreshadows || [])
      .map((f: any) => ({ ...f, id: String(f?.id || "").trim() }))
      .filter((f: any) => f.id)
      .map((f: any) => [f.id, f])
  );
  const now = run.chapter.auditedAt;
  const chap = parseChapterNumberFromFilename(filename);

  const normTitle = (x: any) =>
    String(
      x?.title ||
        x?.item ||
        x?.name ||
        x?.description ||
        x?.question ||
        x?.hook ||
        x?.setup ||
        x?.payoff ||
        ""
    ).trim();
  const normProgress = (x: any) =>
    String(
      x?.progress ||
        x?.update ||
        x?.推进 ||
        x?.note ||
        x?.why ||
        x?.summary ||
        x?.expectedResolution ||
        x?.resolution ||
        ""
    ).trim();
  const makeId = (title: string) => title.replace(/\s+/g, " ").slice(0, 160);

  const pushChapter = (f: any) => {
    if (Number.isFinite(chap)) {
      f.firstChapter = Number.isFinite(f.firstChapter) ? Math.min(f.firstChapter, chap) : chap;
      f.lastChapter = Number.isFinite(f.lastChapter) ? Math.max(f.lastChapter, chap) : chap;
      const arr = Array.isArray(f.chapters) ? f.chapters.map((n: any) => Math.floor(Number(n))).filter((n: any) => Number.isFinite(n)) : [];
      if (!arr.includes(chap)) arr.push(chap);
      arr.sort((a: number, b: number) => a - b);
      f.chapters = arr;
    }
  };

  for (const raw of run?.ledgerUpdates?.openLoops || []) {
    const title = normTitle(raw);
    if (!title || title === "[object Object]") continue;
    const id = makeId(title);
    const prev = byId.get(id) || { id, title, status: "open" };
    if (prev.status === "closed") {
      // 已回收的不自动打开；保留人工状态
    } else if (prev.status !== "progress") {
      prev.status = "open";
    }
    const p = normProgress(raw);
    if (p) prev.lastProgress = p;
    pushChapter(prev);
    prev.updatedAt = now;
    byId.set(id, prev);
  }
  for (const raw of run?.ledgerUpdates?.closedLoops || []) {
    const title = normTitle(raw);
    if (!title || title === "[object Object]") continue;
    const id = makeId(title);
    const prev = byId.get(id) || { id, title, status: "closed" };
    prev.status = "closed";
    const p = normProgress(raw);
    if (p) prev.lastProgress = p;
    pushChapter(prev);
    prev.updatedAt = now;
    byId.set(id, prev);
  }

  foIdx.foreshadows = [...byId.values()]
    .filter((f: any) => {
      const t = String(f?.title || "").trim();
      return t && t !== "[object Object]";
    })
    .sort((a: any, b: any) => String(a.title || "").localeCompare(String(b.title || ""), "zh-Hans-CN"));
  if (!Array.isArray(foIdx.hiddenIds)) foIdx.hiddenIds = [];
  foIdx.updatedAt = now;
  await writeAuditForeshadowsIndex(getDataDir(), slug, foIdx);

  return run;
}

async function performAuditWithAiSdk(input: {
  slug: string;
  filename: string;
  modelConfigId: string | null | undefined;
  onEvent?: (e: ReasoningStreamEvent) => void;
}) {
  const { slug, filename, modelConfigId, onEvent } = input;
  const emitPhase = (step: number, label: string) => {
    try {
      onEvent?.({ type: "phase", step, total: 5, label });
    } catch {
      // ignore
    }
  };

  emitPhase(1, "准备输入（读取章节/角色/索引）");
  const settings = await readModelSettings();
  const activeId = modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) throw new Error("未配置模型");

  const chapter = await readChapter(getDataDir(), slug, filename);
  const tl = normalizeTimelineIndex(await readTimelineIndex(getDataDir(), slug).catch(() => ({}) as any));
  const chapNo = parseChapterNumberFromFilename(filename);
  const memoryContext = buildMemoryContextFromTimelineBeforeChapter(tl, Number.isFinite(chapNo) ? chapNo : null);
  const knownCharacters = await listKnownCharacterNames(getDataDir(), slug);
  const knownPlaces = await listKnownPlaceNames(getDataDir(), slug);

  const unifiedPrompt = buildUnifiedAuditPrompt({
    chapterTitle: filename.replace(/\.md$/, ""),
    chapterFilename: filename,
    content: chapter,
    memoryContext,
    existingEntities: { characters: knownCharacters, places: knownPlaces }
  });

  try {
    onEvent?.({ type: "modelPrompt", stage: "audit", prompt: unifiedPrompt });
  } catch {
    // ignore
  }

  emitPhase(2, "生成最终审计结果（JSON）");
  const rawJson = await generateAuditJsonWithAiSdk({ cfg, prompt: unifiedPrompt, onEvent: onEvent ?? (() => {}) });
  const jsonText = stripJsonFence(rawJson);
  emitPhase(3, "解析并保存审计结果");
  const run = await finalizeAuditFromJsonText(slug, filename, jsonText);
  const ledger = await readAuditLedger(getDataDir(), slug);
  // 每次分析后自动更新时间线索引与推荐压缩区间
  emitPhase(4, "更新全书记忆（时间线/推荐压缩）");
  await updateTimelineIndexAfterAudit({ cfg, slug, filename, run, ledger }).catch(() => {});
  await updateProgressIndexAfterAudit({ cfg, slug, filename, run }).catch(() => {});
  emitPhase(5, "完成");
  return run;
}

async function performPolishWithAiSdk(input: {
  slug: string;
  filename: string;
  modelConfigId: string | null | undefined;
  original: string;
  onDelta?: (textDelta: string) => void;
}) {
  const { slug, filename, modelConfigId, onDelta, original } = input;
  const settings = await readModelSettings();
  const activeId = modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) throw new Error("未配置模型");

  const { model, providerOptions } = createAiSdkModel(cfg);
  const prompt = buildPolishPrompt({ original });

  const r = await streamText({
    model,
    messages: [{ role: "user", content: prompt }],
    providerOptions
  });

  for await (const delta of r.textStream) {
    onDelta?.(delta);
  }

  const full = await r.text;
  return { text: full };
}

async function performMobileLayoutWithAiSdk(input: {
  slug: string;
  filename: string;
  modelConfigId: string | null | undefined;
  original: string;
  onDelta?: (textDelta: string) => void;
}) {
  const { slug, filename, modelConfigId, onDelta, original } = input;
  const settings = await readModelSettings();
  const activeId = modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) throw new Error("未配置模型");

  const { model, providerOptions } = createAiSdkModel(cfg);
  const prompt = buildMobileLayoutPrompt({ original });

  const r = await streamText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    providerOptions
  });

  for await (const delta of r.textStream) {
    onDelta?.(delta);
  }

  const full = await r.text;
  return { text: full };
}

async function updateProgressIndexAfterAudit(input: { cfg: ModelConfig; slug: string; filename: string; run: any }) {
  const { cfg, slug, filename, run } = input;
  const prev = await readAuditProgressIndex(getDataDir(), slug);
  const chapNo = parseChapterNumberFromFilename(filename);
  const prompt = buildProgressIndexPrompt({
    chapter: {
      filename,
      title: String(run?.chapter?.title || filename.replace(/\\.md$/, "")),
      chapterNo: Number.isFinite(chapNo) ? chapNo : null,
      auditedAt: String(run?.chapter?.auditedAt || new Date().toISOString())
    },
    auditRun: run,
    prevIndex: prev
  });

  const { model, providerOptions } = createAiSdkModel(cfg);
  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
    providerOptions
  } as any);

  const parsed = JSON.parse(stripJsonFence(String(text || "")));
  const nextSummaryRaw = typeof parsed?.summary === "string" ? String(parsed.summary) : "";
  const nextItemsRaw = Array.isArray(parsed?.items) ? parsed.items : [];
  const now = String(run?.chapter?.auditedAt || new Date().toISOString());

  const normStr = (v: any) => String(v ?? "").trim();
  const uniqStrs = (arr: any) =>
    [...new Set((Array.isArray(arr) ? arr : []).map((x) => normStr(x)).filter(Boolean))].slice(0, 50);
  const normStatus = (s: any) => {
    const t = normStr(s).toLowerCase();
    if (t === "done" || t === "closed") return "done";
    if (t === "progress" || t === "doing") return "progress";
    return "open";
  };
  const clampPriority = (p: any): 1 | 2 | 3 | undefined => {
    const n = Math.floor(Number(p));
    if (n === 1 || n === 2 || n === 3) return n;
    return undefined;
  };
  const makeStableId = (title: string, related: any) => {
    const key = JSON.stringify({ t: title, r: related || {} });
    return crypto.createHash("sha1").update(key).digest("hex").slice(0, 16);
  };
  const normRelated = (r: any) => ({
    characters: uniqStrs(r?.characters),
    places: uniqStrs(r?.places),
    orgs: uniqStrs(r?.orgs),
    chapters: [...new Set((Array.isArray(r?.chapters) ? r.chapters : []).map((x: any) => Math.floor(Number(x))).filter((n: any) => Number.isFinite(n)))].slice(0, 50)
  });
  const keyOf = (title: string, related: any) =>
    JSON.stringify({ title: normStr(title).toLowerCase(), related: normRelated(related) });

  const prevByKey = new Map<string, any>();
  for (const it of Array.isArray(prev?.items) ? prev.items : []) {
    const k = keyOf(it?.title, it?.related);
    if (!k || k === "{}") continue;
    prevByKey.set(k, it);
  }

  const merged: any[] = [];
  const seen = new Set<string>();
  for (const raw of nextItemsRaw) {
    const title = normStr(raw?.title);
    if (!title || title === "[object Object]") continue;
    const related = normRelated(raw?.related);
    const k = keyOf(title, related);
    if (seen.has(k)) continue;
    seen.add(k);

    const prevIt = prevByKey.get(k);
    const status = normStatus(raw?.status ?? prevIt?.status);
    const id = normStr(raw?.id) || normStr(prevIt?.id) || makeStableId(title, related);

    merged.push({
      id,
      title,
      detail: normStr(raw?.detail) || normStr(prevIt?.detail) || undefined,
      status,
      priority: clampPriority(raw?.priority ?? prevIt?.priority),
      related,
      createdAt: normStr(prevIt?.createdAt) || now,
      updatedAt: now
    });
  }

  const keep = merged
    .filter((x) => x && typeof x === "object")
    .sort((a, b) => {
      const pa = a.priority ?? 9;
      const pb = b.priority ?? 9;
      if (pa !== pb) return pa - pb;
      return String(a.title || "").localeCompare(String(b.title || ""), "zh-Hans-CN");
    })
    .slice(0, 30);

  const summary = String(nextSummaryRaw || "").trim() || String(prev?.summary || "").trim() || "";
  const next = {
    version: 1,
    updatedAt: now,
    lastSourceChapter:
      parsed?.lastSourceChapter && typeof parsed.lastSourceChapter === "object"
        ? parsed.lastSourceChapter
        : { filename, chapterNo: Number.isFinite(chapNo) ? chapNo : undefined, title: String(run?.chapter?.title || "") },
    summary,
    items: keep
  };

  await writeAuditProgressIndex(getDataDir(), slug, next as any);
}

async function performExpandWithAiSdk(input: {
  slug: string;
  filename: string;
  modelConfigId: string | null | undefined;
  original: string;
  targetWords: number;
  extraContext: string;
  onDelta?: (textDelta: string) => void;
}) {
  const { slug, modelConfigId, onDelta, original, targetWords, extraContext } = input;
  const settings = await readModelSettings();
  const activeId = modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) throw new Error("未配置模型");

  const idx = normalizeTimelineIndex(await readTimelineIndex(getDataDir(), slug));
  const compressed = (idx.compressedRanges || [])
    .slice()
    .sort((a, b) => (a.startChapter ?? 0) - (b.startChapter ?? 0))
    .slice(-20)
    .map((r) => `第${r.startChapter}-${r.endChapter}章：${String(r.summary || "").trim()}`)
    .filter((s) => s.length > 0);

  const prompt = buildAdjustPrompt({
    targetWords,
    currentWords: approximateWordCount(original),
    compressed,
    extraContext,
    original
  });

  const { model, providerOptions } = createAiSdkModel(cfg);
  const r = await streamText({
    model,
    messages: [{ role: "user", content: prompt }],
    providerOptions
  } as any);

  for await (const delta of r.textStream) {
    onDelta?.(delta);
  }
  const full = await r.text;
  return { text: full };
}

async function performAudit(slug: string, filename: string, modelConfigId: string | null | undefined) {
  const settings = await readModelSettings();
  const activeId = modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) throw new Error("未配置模型");

  const chapter = await readChapter(getDataDir(), slug, filename);
  const { charFiles } = await listStoryFiles(getDataDir(), slug);
  const knownCharacters = charFiles.map((c) => c.title);

  const prompt = buildAuditPrompt({
    chapterTitle: filename.replace(/\.md$/, ""),
    chapterFilename: filename,
    content: chapter,
    knownCharacters
  });

  const raw = await callModel(cfg, prompt);
  const jsonText = stripJsonFence(raw);
  return await finalizeAuditFromJsonText(slug, filename, jsonText);
}

app.get("/api/health", async () => {
  return { ok: true, dataDir: getDataDir() };
});

app.get("/api/settings/model-configs", async () => {
  return await readModelSettings();
});

app.put("/api/settings/model-configs", async (req) => {
  const bodySchema = z.object({
    activeId: z.string().nullable(),
    configs: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          provider: z.enum(["openai", "deepseek", "gemini", "qwen", "ollama", "custom"]),
          baseUrl: z.string(),
          apiKey: z.string(),
          testUrl: z.string(),
          model: z.string().optional(),
          extraHeadersJson: z.string().optional(),
        })
      )
      .default([])
  });
  const body = bodySchema.parse((req as any).body);
  await writeModelSettings({ configs: body.configs as any, activeId: body.activeId });
  return { ok: true };
});

app.get("/api/settings/app", async (): Promise<AppSettingsResponse> => {
  const base = resolveDataDirWithSource();
  const file = await readAppConfigFile();
  const fileDataDir =
    typeof file.dataDir === "string" && file.dataDir.trim() ? path.resolve(file.dataDir.trim()) : null;
  return {
    ...base,
    fileDataDir: base.envLocked ? null : fileDataDir
  };
});

app.put("/api/settings/app", async (req, reply) => {
  const current = resolveDataDirWithSource();
  if (current.envLocked) {
    return reply
      .code(403)
      .send({ error: "已通过环境变量 NOVEL_HELPER_DATA_DIR 指定目录，无法在应用内修改。" });
  }
  const body = z
    .object({
      dataDir: z.string().min(1),
      migrate: z.boolean().optional(),
      deleteSource: z.boolean().optional()
    })
    .parse((req as any).body);
  const source = getDataDir();
  try {
    const normalized = await validateAndNormalizeDataDir(body.dataDir);
    if (path.resolve(normalized) === path.resolve(source)) {
      return reply.code(400).send({ error: "新路径与当前目录相同。" });
    }
    const migrate = body.migrate === true;
    const deleteSource = body.deleteSource === true;

    if (migrate) {
      await assertDirEmpty(normalized);
      try {
        await copyDataDirContents(source, normalized);
        await verifyMigratedData(source, normalized);
      } catch (e) {
        await cleanupDirBestEffort(normalized);
        throw e;
      }
    }

    await writeAppConfigFile(normalized);
    setDataDir(normalized);
    clearDataDirCaches();

    let sourceDeleted = false;
    let deleteSourceWarning: string | undefined;
    if (migrate && deleteSource) {
      try {
        await deleteDataDirTree(source);
        sourceDeleted = true;
      } catch (e: any) {
        deleteSourceWarning = e?.message || String(e);
      }
    }

    const books = await listNovels(getDataDir());
    return {
      ok: true,
      effectiveDataDir: getDataDir(),
      migrated: migrate,
      bookCount: books.length,
      sourceDeleted: migrate && deleteSource ? sourceDeleted : undefined,
      deleteSourceWarning
    };
  } catch (e: any) {
    return reply.code(400).send({ error: e?.message || String(e) });
  }
});

app.post("/api/settings/app/pick-directory", async (req, reply) => {
  const current = resolveDataDirWithSource();
  if (current.envLocked) {
    return reply
      .code(403)
      .send({ error: "已通过环境变量 NOVEL_HELPER_DATA_DIR 指定目录，无法在应用内修改。" });
  }
  try {
    const result = await pickDataDirectory("选择写作数据保存目录");
    if (result.cancelled) return { cancelled: true };
    const normalized = await validateAndNormalizeDataDir(result.path);
    return { cancelled: false, path: normalized };
  } catch (e: any) {
    return reply.code(500).send({ error: e?.message || String(e) });
  }
});

app.post("/api/settings/app/open-directory", async (req, reply) => {
  const body = z.object({ path: z.string().optional() }).parse((req as any).body ?? {});
  const fromBody = body.path?.trim() || null;
  const target = fromBody ?? getDataDir();
  console.log("[novel-helper:open-data-dir] API request", {
    fromBody,
    getDataDir: getDataDir(),
    target
  });
  try {
    const result = await openPathInFileManager(target);
    console.log("[novel-helper:open-data-dir] API response ok", result);
    return result;
  } catch (e: any) {
    console.error("[novel-helper:open-data-dir] API response error", e?.message || e);
    return reply.code(500).send({ error: e?.message || String(e) });
  }
});

// 新路由：books（与目录结构一致）
app.get("/api/books", async () => {
  const novels = await listNovels(getDataDir());
  return { books: novels };
});

app.post("/api/books", async (req, reply) => {
  const bodySchema = z.object({
    title: z.string().min(1),
    slug: z.string().optional(),
    synopsis: z.string().max(20000).optional()
  });
  const body = bodySchema.parse((req as any).body);
  const bookId = crypto.randomUUID();
  const displaySlug = safeSlug(body.slug?.trim() || body.title) || undefined;

  try {
    const meta = await createNovel(getDataDir(), bookId, body.title, body.synopsis, {
      slug: displaySlug
    });
    return { book: novelSummaryFromMeta(meta, 0, []) };
  } catch (e: any) {
    return reply.code(409).send({ message: e?.message || "Conflict" });
  }
});

app.get("/api/books/:bookId", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const books = await listNovels(getDataDir());
  const book = books.find(
    (b) => b.bookId === params.bookId || String(b.slug || "").trim() === params.bookId
  );
  if (!book) return reply.code(404).send({ message: "Not found" });
  return { book };
});

app.patch("/api/books/:bookId", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    synopsis: z.string().max(20000).optional(),
    completed: z.boolean().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    let book: any = null;
    if (body.synopsis !== undefined) {
      book = await updateNovelSynopsis(getDataDir(), params.bookId, body.synopsis);
    }
    if (body.completed !== undefined) {
      book = await updateNovelCompleted(getDataDir(), params.bookId, body.completed);
    }
    if (!book) return reply.code(400).send({ message: "No-op" });
    return { book };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.delete("/api/books/:bookId", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  try {
    await deleteNovel(getDataDir(), params.bookId);
    return { ok: true };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.post("/api/books/:bookId/restore", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  try {
    await restoreNovel(getDataDir(), params.bookId);
    return { ok: true };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.get("/api/books/:bookId/chapters", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const chapters = await listChapters(getDataDir(), params.bookId);
  return { chapters };
});

app.post("/api/books/:bookId/chapters", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    chapterIndex: z.number().int().min(1).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const chapter = await createChapter(getDataDir(), params.bookId, body.title, body.content, body.chapterIndex);
  const allChapters = await listChapters(getDataDir(), params.bookId);
  await ensureOutlineIndex(getDataDir(), params.bookId, allChapters);
  return { chapter };
});

app.get("/api/books/:bookId/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    const content = await readChapter(getDataDir(), params.bookId, params.filename);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/books/:bookId/chapters/:filename", async (req) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    content: z.string()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateChapter(getDataDir(), params.bookId, params.filename, body.content);
  return { ok: true };
});

app.patch("/api/books/:bookId/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    title: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const chapter = await renameChapterTitle(getDataDir(), params.bookId, params.filename, body.title);
    return { chapter };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Rename failed" });
  }
});

app.delete("/api/books/:bookId/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    await deleteChapter(getDataDir(), params.bookId, params.filename);
    const allChapters = await listChapters(getDataDir(), params.bookId);
    await ensureOutlineIndex(getDataDir(), params.bookId, allChapters);
    return { ok: true };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Delete failed" });
  }
});

app.get("/api/books/:bookId/outline", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  try {
    const chapters = await listChapters(getDataDir(), params.bookId);
    const outline = await ensureOutlineIndex(getDataDir(), params.bookId, chapters);
    return { outline };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.patch("/api/books/:bookId/outline", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const body = (req as any).body;
  try {
    const chapters = await listChapters(getDataDir(), params.bookId);
    const filenames = chapters.map((c) => c.filename);
    const idx = normalizeOutlineIndex(body?.outline ?? body);
    const warnings = validateOutlineAgainstChapters(idx, filenames);
    if (warnings.length) return reply.code(400).send({ message: warnings.join("；") });
    const saved = await writeOutlineIndex(getDataDir(), params.bookId, idx);
    return { outline: saved };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/outline/ai", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    mode: z.enum(["snowflake", "fromChapters", "refineChapterPlan", "volumeChapterPlans", "foreshadowAudit"]),
    modelConfigId: z.string().nullable().optional(),
    instruction: z.string().optional(),
    volumeId: z.string().optional(),
    chapterFilename: z.string().optional(),
    options: z
      .object({
        useWorld: z.boolean().optional(),
        useForeshadows: z.boolean().optional(),
        useTimeline: z.boolean().optional(),
        targetVolumes: z.number().int().min(1).max(20).optional(),
        logline: z.string().optional(),
        overwrite: z.boolean().optional()
      })
      .optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  try {
    const settings = await readModelSettings();
    const activeId = body.modelConfigId || settings.activeId;
    const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
    if (!cfg) return reply.code(400).send({ message: "未配置模型" });

    const chapters = await listChapters(getDataDir(), params.bookId);
    const outline = await ensureOutlineIndex(getDataDir(), params.bookId, chapters);
    const { preview, prompt, warnings } = await runOutlineAi({
      dataDir: getDataDir(),
      slug: params.bookId,
      mode: body.mode as OutlineAiMode,
      outline,
      cfg,
      createAiSdkModel,
      instruction: body.instruction,
      volumeId: body.volumeId,
      chapterFilename: body.chapterFilename,
      options: body.options
    });

    const debug = String((req as any).query?.debug || "") === "1" ? { prompt } : undefined;
    return { preview, warnings, debug };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/outline/ai/apply", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    preview: z.any(),
    overwrite: z.boolean().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const chapters = await listChapters(getDataDir(), params.bookId);
    const filenames = chapters.map((c) => c.filename);
    const validFilenames = new Set(filenames);
    const current = await ensureOutlineIndex(getDataDir(), params.bookId, chapters);

    if (body.preview?.report) {
      return reply.code(400).send({ message: "伏笔体检报告不可应用到大纲" });
    }

    let previewInput = body.preview as Partial<OutlineIndex>;
    if (previewInput?.chapterPlans && !("report" in previewInput)) {
      previewInput = enrichOutlineAiPreview(current, previewInput, "fromChapters");
    }

    const { merged, warnings } = mergeOutlinePreview(current, previewInput, {
      overwrite: Boolean(body.overwrite),
      validFilenames
    });
    const valWarnings = validateOutlineAgainstChapters(merged, filenames);
    if (valWarnings.length) return reply.code(400).send({ message: valWarnings.join("；") });
    const saved = await writeOutlineIndex(getDataDir(), params.bookId, merged);
    return { outline: saved, warnings: [...warnings, ...valWarnings] };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.get("/api/books/:bookId/stats", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const querySchema = z.object({ backfill: z.enum(["mtime"]).optional() });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.parse((req as any).query ?? {});
  try {
    const stats = await computeBookStats(getDataDir(), params.bookId, {
      backfillMtime: query.backfill === "mtime"
    });
    return { stats };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Stats failed" });
  }
});

app.get("/api/books/:bookId/story", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const { storyFiles, charFiles } = await listStoryFiles(getDataDir(), params.bookId);
  return { storyFiles, charFiles };
});

app.post("/api/books/:bookId/story/characters", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    name: z.string().min(1),
    role: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).max(30).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const out = await createCharacterCard(getDataDir(), params.bookId, body.name, { role: body.role, tags: body.tags });
    return { character: out };
  } catch (e: any) {
    return reply.code(409).send({ message: e?.message || "Conflict" });
  }
});

app.get("/api/books/:bookId/story/file", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const querySchema = z.object({ path: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.parse((req as any).query);
  try {
    const content = await readStoryFile(getDataDir(), params.bookId, query.path);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/books/:bookId/story/file", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({ path: z.string().min(1), content: z.string() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateStoryFile(getDataDir(), params.bookId, body.path, body.content);
  return { ok: true };
});

app.post("/api/books/:bookId/story/characters/merge", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    primaryPath: z.string().min(1),
    secondaryPaths: z.array(z.string().min(1)).min(1),
    modelConfigId: z.string().nullable().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const isSafeCharacterPath = (p: string) =>
    p.startsWith("story/characters/") && p.endsWith(".md") && !p.includes("..") && !p.includes("\\");
  if (!isSafeCharacterPath(body.primaryPath)) {
    return reply.code(400).send({ message: "primaryPath 非法" });
  }
  const secondary = [...new Set(body.secondaryPaths)];
  if (secondary.includes(body.primaryPath)) {
    return reply.code(400).send({ message: "secondaryPaths 不能包含 primaryPath" });
  }
  for (const p of secondary) {
    if (!isSafeCharacterPath(p)) return reply.code(400).send({ message: `secondaryPath 非法：${p}` });
  }

  try {
    // 读取模型配置（用活动模型）
    const settings = await readModelSettings();
    const activeId = body.modelConfigId ?? settings.activeId;
    const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
    if (!cfg) throw new Error("未配置模型");

    // 先读全量内容（失败则不做任何写入）
    const primaryContent = await readStoryFile(getDataDir(), params.bookId, body.primaryPath);
    const primaryTitle = path.basename(body.primaryPath).replace(/\.md$/, "");
    const secondaryCards: Array<{ path: string; title: string; content: string }> = [];
    for (const p of secondary) {
      const c = await readStoryFile(getDataDir(), params.bookId, p);
      secondaryCards.push({ path: p, title: path.basename(p).replace(/\.md$/, ""), content: c });
    }

    const prompt = buildCharacterCardMergePrompt({
      primaryTitle,
      primaryContent,
      secondary: secondaryCards.map((x) => ({ title: x.title, content: x.content }))
    });
    const raw = await generateCharacterCardMarkdownWithAiSdk({ cfg, prompt });
    const merged = stripMarkdownFence(raw);
    const mergedTrim = merged.trim();
    if (mergedTrim.length < 60 || (!mergedTrim.includes("\n# ") && !mergedTrim.startsWith("# "))) {
      throw new Error("AI 合并失败：返回内容不符合预期（过短或缺少标题）");
    }

    // 先写主卡，成功后再备份搬运次卡
    await updateStoryFile(getDataDir(), params.bookId, body.primaryPath, mergedTrim.endsWith("\n") ? mergedTrim : `${mergedTrim}\n`);

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const mergedDirRel = "story/characters/_merged";
    const mergedDirAbs = path.join(getDataDir(), params.bookId, mergedDirRel);
    await fs.mkdir(mergedDirAbs, { recursive: true });

    const exists = async (p: string) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    };
    const allocDest = async (baseName: string) => {
      const safeBase = baseName.replace(/[\/\\]/g, "_");
      for (let i = 0; i < 50; i++) {
        const name = i === 0 ? `${stamp}_${safeBase}` : `${stamp}_${i}_${safeBase}`;
        const abs = path.join(mergedDirAbs, name);
        if (!(await exists(abs))) return abs;
      }
      throw new Error("备份文件名分配失败（冲突过多）");
    };

    for (const card of secondaryCards) {
      const srcAbs = path.join(getDataDir(), params.bookId, card.path);
      const destAbs = await allocDest(path.basename(card.path));
      await fs.rename(srcAbs, destAbs);
    }

    const { charFiles } = await listStoryFiles(getDataDir(), params.bookId);
    return { ok: true, charFiles };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/chapters/:filename/audit", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({ modelConfigId: z.string().nullable().optional() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  try {
    // 非流式：仍走原逻辑（兼容旧行为）
    const run = await performAudit(params.bookId, params.filename, body.modelConfigId);
    return { run };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/chapters/:filename/audit/stream", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({ modelConfigId: z.string().nullable().optional() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  // 该路由需要接管底层 socket（否则 Fastify 可能提前结束连接，前端表现为 Failed to fetch）
  // @ts-ignore
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  // 立即写一个空事件，尽早建立连接
  sseWrite(reply.raw, { type: "log", text: "连接已建立…\n" });

  const log = (t: string) => sseWrite(reply.raw, { type: "log", text: t.endsWith("\n") ? t : `${t}\n` });

  try {
    log("开始审计…");
    const run = await performAuditWithAiSdk({
      slug: params.bookId,
      filename: params.filename,
      modelConfigId: body.modelConfigId,
      onEvent: (e) => {
        // 章节分析改为单次生成 JSON：不再透传 reasoning/log，减少无关日志
        if (e.type === "phase") sseWrite(reply.raw, e);
        if (e.type === "modelPrompt") sseWrite(reply.raw, e);
      }
    });
    sseWrite(reply.raw, { type: "done", run });
  } catch (e: any) {
    sseWrite(reply.raw, { type: "error", message: e?.message || String(e) });
  } finally {
    reply.raw.end();
  }
});

app.post("/api/books/:bookId/chapters/:filename/mobile-layout/stream", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    original: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  // @ts-ignore
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  sseWrite(reply.raw, { type: "log", text: "连接已建立…\n" });

  try {
    sseWrite(reply.raw, { type: "log", text: "开始 AI 排版…\n" });
    const { text } = await performMobileLayoutWithAiSdk({
      slug: params.bookId,
      filename: params.filename,
      modelConfigId: body.modelConfigId,
      original: body.original || "",
      onDelta: (d) => {
        if (d) sseWrite(reply.raw, { type: "delta", textDelta: d });
      }
    });
    sseWrite(reply.raw, { type: "done", text });
  } catch (e: any) {
    sseWrite(reply.raw, { type: "error", message: e?.message || String(e) });
  } finally {
    reply.raw.end();
  }
});

app.post("/api/books/:bookId/chapters/:filename/polish/stream", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    original: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  // @ts-ignore
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  sseWrite(reply.raw, { type: "log", text: "连接已建立…\n" });

  try {
    sseWrite(reply.raw, { type: "log", text: "开始纠错…\n" });
    const { text } = await performPolishWithAiSdk({
      slug: params.bookId,
      filename: params.filename,
      modelConfigId: body.modelConfigId,
      original: body.original || "",
      onDelta: (d) => {
        if (d) sseWrite(reply.raw, { type: "delta", textDelta: d });
      }
    });
    sseWrite(reply.raw, { type: "done", text });
  } catch (e: any) {
    sseWrite(reply.raw, { type: "error", message: e?.message || String(e) });
  } finally {
    reply.raw.end();
  }
});

app.post("/api/books/:bookId/chapters/:filename/expand/stream", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    original: z.string().optional(),
    targetWords: z.number().int().min(200),
    extraContext: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  // @ts-ignore
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  sseWrite(reply.raw, { type: "log", text: "连接已建立…\n" });

  try {
    sseWrite(reply.raw, { type: "log", text: "开始调整…\n" });
    const { text } = await performExpandWithAiSdk({
      slug: params.bookId,
      filename: params.filename,
      modelConfigId: body.modelConfigId,
      original: body.original || "",
      targetWords: body.targetWords,
      extraContext: body.extraContext || "",
      onDelta: (d) => {
        if (d) sseWrite(reply.raw, { type: "delta", textDelta: d });
      }
    });
    sseWrite(reply.raw, { type: "done", text });
  } catch (e: any) {
    sseWrite(reply.raw, { type: "error", message: e?.message || String(e) });
  } finally {
    reply.raw.end();
  }
});

app.get("/api/books/:bookId/audit/latest", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const querySchema = z.object({ chapter: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.parse((req as any).query);
  try {
    const run = await readAuditRun(getDataDir(), params.bookId, query.chapter);
    if (!run) return reply.code(404).send({ message: "Not found" });
    return { run };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.get("/api/books/:bookId/audit/stale-chapters", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const chapters = await listAuditChapterStale(getDataDir(), params.bookId);
  return { chapters };
});

app.delete("/api/books/:bookId/audit", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  try {
    await clearAuditDir(getDataDir(), params.bookId);
    return { ok: true as const };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.get("/api/books/:bookId/chapters/draft-status", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const outOfSync = await listChapterFilenamesOutOfSyncWithLatestDraft(getDataDir(), params.bookId);
  return { outOfSync };
});

app.get("/api/books/:bookId/chapters/:filename/versions", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1), filename: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  try {
    return await listChapterVersions(getDataDir(), params.bookId, params.filename);
  } catch (e: any) {
    if (e instanceof ChapterVersionError) return reply.code(e.statusCode).send({ message: e.message });
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/chapters/:filename/versions", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({ label: z.string().optional() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body ?? {});
  try {
    const version = await createChapterVersion(getDataDir(), params.bookId, params.filename, {
      label: body.label
    });
    return { version };
  } catch (e: any) {
    if (e instanceof ChapterVersionError) return reply.code(e.statusCode).send({ message: e.message });
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.get("/api/books/:bookId/chapters/:filename/versions/:versionId", async (req, reply) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1),
    versionId: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    return await readChapterVersionContent(
      getDataDir(),
      params.bookId,
      params.filename,
      params.versionId
    );
  } catch (e: any) {
    if (e instanceof ChapterVersionError) return reply.code(e.statusCode).send({ message: e.message });
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/chapters/:filename/versions/:versionId/restore", async (req, reply) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1),
    versionId: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    return await restoreChapterVersion(getDataDir(), params.bookId, params.filename, params.versionId);
  } catch (e: any) {
    if (e instanceof ChapterVersionError) return reply.code(e.statusCode).send({ message: e.message });
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.get("/api/books/:bookId/audit/analysis", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const querySchema = z.object({ chapter: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.parse((req as any).query);
  try {
    const text = await readAuditAnalysisText(getDataDir(), params.bookId, query.chapter);
    return { text };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/audit/analysis/save", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({ chapter: z.string().min(1), text: z.string().default("") });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    await writeAuditAnalysisText(getDataDir(), params.bookId, body.chapter, body.text || "");
    return { ok: true };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.get("/api/books/:bookId/audit/ledger", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const ledger = await readAuditLedger(getDataDir(), params.bookId);
  return { ledger };
});

app.get("/api/books/:bookId/audit/characters", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditCharactersIndex(getDataDir(), params.bookId);
  return { index: idx };
});

app.post("/api/books/:bookId/audit/characters/hide", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({ name: z.string().min(1), hidden: z.boolean() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const idx = await readAuditCharactersIndex(getDataDir(), params.bookId);
  const set = new Set((idx.hiddenNames || []).map((x: any) => String(x)));
  const name = body.name.trim();
  if (body.hidden) set.add(name);
  else set.delete(name);
  idx.hiddenNames = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeAuditCharactersIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/audit/characters/update", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    name: z.string().min(1),
    role: z.string().optional(),
    tags: z.array(z.string()).optional(),
    state: z.any().optional(),
    locks: z
      .object({
        tags: z.boolean().optional(),
        socialTags: z.boolean().optional(),
        historicalDebts: z.boolean().optional(),
        occurredNotes: z.boolean().optional(),
        narrativeDrives: z.boolean().optional(),
        fingerprints: z.boolean().optional(),
        relationalHooks: z.boolean().optional()
      })
      .optional(),
    socialTags: z
      .object({
        profession: z.string().optional(),
        class: z.string().optional(),
        titles: z.array(z.string()).optional(),
        other: z.array(z.string()).optional()
      })
      .optional(),
    historicalDebts: z.array(z.string()).optional(),
    narrativeDrives: z
      .object({
        want: z.string().optional(),
        need: z.string().optional(),
        moralCompass: z.string().optional(),
        flaws: z.array(z.string()).optional(),
        blindSpots: z.array(z.string()).optional()
      })
      .optional(),
    fingerprints: z
      .object({
        linguisticStyle: z.array(z.string()).optional(),
        catchphrases: z.array(z.string()).optional(),
        mannerisms: z.array(z.string()).optional(),
        mask: z.array(z.object({ context: z.string().optional(), persona: z.string().optional() })).optional()
      })
      .optional(),
    relationalHooks: z
      .object({
        relations: z
          .array(
            z.object({
              targetName: z.string().min(1),
              types: z.array(z.string()).optional(),
              emotionalPolarity: z.string().optional(),
              conflictIndex: z.string().optional(),
              sharedSecrets: z.array(z.string()).optional()
            })
          )
          .optional(),
        freeText: z.string().optional()
      })
      .optional(),
    occurredNotes: z.array(z.string()).optional(),
    personalityAnalysis: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const idx = await readAuditCharactersIndex(getDataDir(), params.bookId);
  const name = body.name.trim();
  const i = (idx.characters || []).findIndex((c: any) => String(c?.name || "").trim() === name);
  if (i < 0) return reply.code(404).send({ message: "角色不存在" });
  const now = new Date().toISOString();
  const prev = idx.characters[i] || {};
  const normStr = (v: any) => (typeof v === "string" ? v.trim() : "");
  const uniqStrs = (arr: any) =>
    [...new Set((Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter(Boolean))];
  const mergeStrArr = (a: any, b: any) => uniqStrs([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
  const hasVal = (v: any) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "boolean") return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return false;
  };
  const mergeObjNonEmpty = (p: any, n: any) => {
    const out: any = { ...(p && typeof p === "object" ? p : {}) };
    if (!n || typeof n !== "object") return out;
    for (const [k, v] of Object.entries(n)) {
      if (!hasVal(v)) continue;
      out[k] = v;
    }
    return out;
  };
  const mergeMask = (a: any, b: any) => {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const out: any[] = [];
    const seen = new Set<string>();
    for (const it of [...arrA, ...arrB]) {
      const ctx = normStr((it as any)?.context);
      const persona = normStr((it as any)?.persona);
      if (!ctx && !persona) continue;
      const key = `${ctx}@@${persona}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ context: ctx, persona });
    }
    return out;
  };
  const mergeRelations = (a: any, b: any) => {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const byTarget = new Map<string, any>();
    for (const r of [...arrA, ...arrB]) {
      const targetName = normStr((r as any)?.targetName);
      if (!targetName) continue;
      const prevR = byTarget.get(targetName) || { targetName };
      const mergedR = {
        ...prevR,
        targetName,
        types: mergeStrArr(prevR.types, (r as any)?.types),
        emotionalPolarity: hasVal((r as any)?.emotionalPolarity) ? normStr((r as any)?.emotionalPolarity) : prevR.emotionalPolarity,
        conflictIndex: hasVal((r as any)?.conflictIndex) ? normStr((r as any)?.conflictIndex) : prevR.conflictIndex,
        sharedSecrets: mergeStrArr(prevR.sharedSecrets, (r as any)?.sharedSecrets)
      };
      byTarget.set(targetName, mergedR);
    }
    return [...byTarget.values()].sort((x, y) => String(x.targetName).localeCompare(String(y.targetName), "zh-Hans-CN"));
  };
  const mergeFreeText = (a: any, b: any) => {
    const ta = normStr(a);
    const tb = normStr(b);
    if (!tb) return ta;
    if (!ta) return tb;
    if (ta.includes(tb)) return ta;
    return `${ta}\n${tb}`;
  };

  idx.characters[i] = {
    ...prev,
    name,
    role: body.role !== undefined ? body.role : prev.role,
    tags: body.tags !== undefined ? mergeStrArr(prev.tags, body.tags) : prev.tags,
    state: body.state !== undefined ? mergeObjNonEmpty(prev.state, body.state) : prev.state,
    locks: body.locks !== undefined ? body.locks : prev.locks,
    socialTags:
      body.socialTags !== undefined
        ? {
            ...(prev.socialTags && typeof prev.socialTags === "object" ? prev.socialTags : {}),
            ...(hasVal((body as any).socialTags?.profession) ? { profession: normStr((body as any).socialTags?.profession) } : null),
            ...(hasVal((body as any).socialTags?.class) ? { class: normStr((body as any).socialTags?.class) } : null),
            ...(Array.isArray((body as any).socialTags?.titles)
              ? {
                  titles: mergeStrArr((prev.socialTags as any)?.titles, (body as any).socialTags?.titles)
                }
              : null),
            ...(Array.isArray((body as any).socialTags?.other)
              ? {
                  other: mergeStrArr((prev.socialTags as any)?.other, (body as any).socialTags?.other)
                }
              : null)
          }
        : prev.socialTags,
    historicalDebts: body.historicalDebts !== undefined ? mergeStrArr(prev.historicalDebts, body.historicalDebts) : prev.historicalDebts,
    narrativeDrives:
      body.narrativeDrives !== undefined
        ? {
            ...(prev.narrativeDrives && typeof prev.narrativeDrives === "object" ? prev.narrativeDrives : {}),
            ...(hasVal((body as any).narrativeDrives?.want) ? { want: normStr((body as any).narrativeDrives?.want) } : null),
            ...(hasVal((body as any).narrativeDrives?.need) ? { need: normStr((body as any).narrativeDrives?.need) } : null),
            ...(hasVal((body as any).narrativeDrives?.moralCompass)
              ? { moralCompass: normStr((body as any).narrativeDrives?.moralCompass) }
              : null),
            ...(Array.isArray((body as any).narrativeDrives?.flaws)
              ? { flaws: mergeStrArr((prev.narrativeDrives as any)?.flaws, (body as any).narrativeDrives?.flaws) }
              : null),
            ...(Array.isArray((body as any).narrativeDrives?.blindSpots)
              ? {
                  blindSpots: mergeStrArr((prev.narrativeDrives as any)?.blindSpots, (body as any).narrativeDrives?.blindSpots)
                }
              : null)
          }
        : prev.narrativeDrives,
    fingerprints:
      body.fingerprints !== undefined
        ? {
            ...(prev.fingerprints && typeof prev.fingerprints === "object" ? prev.fingerprints : {}),
            ...(Array.isArray((body as any).fingerprints?.linguisticStyle)
              ? {
                  linguisticStyle: mergeStrArr((prev.fingerprints as any)?.linguisticStyle, (body as any).fingerprints?.linguisticStyle)
                }
              : null),
            ...(Array.isArray((body as any).fingerprints?.catchphrases)
              ? { catchphrases: mergeStrArr((prev.fingerprints as any)?.catchphrases, (body as any).fingerprints?.catchphrases) }
              : null),
            ...(Array.isArray((body as any).fingerprints?.mannerisms)
              ? { mannerisms: mergeStrArr((prev.fingerprints as any)?.mannerisms, (body as any).fingerprints?.mannerisms) }
              : null),
            ...(Array.isArray((body as any).fingerprints?.mask)
              ? { mask: mergeMask((prev.fingerprints as any)?.mask, (body as any).fingerprints?.mask) }
              : null)
          }
        : prev.fingerprints,
    relationalHooks:
      body.relationalHooks !== undefined
        ? {
            ...(prev.relationalHooks && typeof prev.relationalHooks === "object" ? prev.relationalHooks : {}),
            ...(Array.isArray((body as any).relationalHooks?.relations)
              ? { relations: mergeRelations((prev.relationalHooks as any)?.relations, (body as any).relationalHooks?.relations) }
              : null),
            ...(hasVal((body as any).relationalHooks?.freeText)
              ? { freeText: mergeFreeText((prev.relationalHooks as any)?.freeText, (body as any).relationalHooks?.freeText) }
              : null)
          }
        : prev.relationalHooks,
    occurredNotes:
      body.occurredNotes !== undefined ? mergeOccurredNotes(prev.occurredNotes, body.occurredNotes) : prev.occurredNotes,
    personalityAnalysis:
      body.personalityAnalysis !== undefined ? body.personalityAnalysis : prev.personalityAnalysis,
    updatedAt: now
  };
  idx.updatedAt = now;
  await writeAuditCharactersIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/audit/characters/merge", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    primaryName: z.string().min(1),
    secondaryNames: z.array(z.string().min(1)).min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const primaryName = body.primaryName.trim();
  const secondaryNames = [...new Set(body.secondaryNames.map((s: string) => s.trim()).filter(Boolean))].filter(
    (n) => n !== primaryName
  );
  if (!primaryName || secondaryNames.length < 1) {
    return reply.code(400).send({ message: "参数非法" });
  }

  const idx = await readAuditCharactersIndex(getDataDir(), params.bookId);
  const now = new Date().toISOString();
  const normStr = (v: any) => (typeof v === "string" ? v.trim() : "");
  const uniqStrs = (arr: any) =>
    [...new Set((Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter(Boolean))];
  const mergeStrArr = (a: any, b: any) => uniqStrs([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
  const hasVal = (v: any) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "boolean") return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return false;
  };
  const mergeObjNonEmpty = (p: any, n: any) => {
    const out: any = { ...(p && typeof p === "object" ? p : {}) };
    if (!n || typeof n !== "object") return out;
    for (const [k, v] of Object.entries(n)) {
      if (!hasVal(v)) continue;
      out[k] = v;
    }
    return out;
  };
  const mergeMask = (a: any, b: any) => {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const out: any[] = [];
    const seen = new Set<string>();
    for (const it of [...arrA, ...arrB]) {
      const ctx = normStr((it as any)?.context);
      const persona = normStr((it as any)?.persona);
      if (!ctx && !persona) continue;
      const key = `${ctx}@@${persona}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ context: ctx, persona });
    }
    return out;
  };
  const mergeRelations = (a: any, b: any) => {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const byTarget = new Map<string, any>();
    for (const r of [...arrA, ...arrB]) {
      const targetName = normStr((r as any)?.targetName);
      if (!targetName) continue;
      const prevR = byTarget.get(targetName) || { targetName };
      const mergedR = {
        ...prevR,
        targetName,
        types: mergeStrArr(prevR.types, (r as any)?.types),
        emotionalPolarity: hasVal((r as any)?.emotionalPolarity) ? normStr((r as any)?.emotionalPolarity) : prevR.emotionalPolarity,
        conflictIndex: hasVal((r as any)?.conflictIndex) ? normStr((r as any)?.conflictIndex) : prevR.conflictIndex,
        sharedSecrets: mergeStrArr(prevR.sharedSecrets, (r as any)?.sharedSecrets)
      };
      byTarget.set(targetName, mergedR);
    }
    return [...byTarget.values()].sort((x, y) => String(x.targetName).localeCompare(String(y.targetName), "zh-Hans-CN"));
  };
  const mergeFreeText = (a: any, b: any) => {
    const ta = normStr(a);
    const tb = normStr(b);
    if (!tb) return ta;
    if (!ta) return tb;
    if (ta.includes(tb)) return ta;
    return `${ta}\n${tb}`;
  };

  const mergeOne = (input: { idx: any; primaryName: string; secondaryName: string }) => {
    const { idx, primaryName, secondaryName } = input;
    const chars = Array.isArray(idx.characters) ? idx.characters : [];
    const pi = chars.findIndex((c: any) => String(c?.name || "").trim() === primaryName);
    const si = chars.findIndex((c: any) => String(c?.name || "").trim() === secondaryName);
    if (pi < 0 || si < 0) throw new Error("角色不存在");
    const primary = chars[pi] || {};
    const secondary = chars[si] || {};
    const merged = {
      ...primary,
      name: primaryName,
      role: normStr(primary.role) ? primary.role : secondary.role,
      tags: mergeStrArr(primary.tags, secondary.tags),
      state: mergeObjNonEmpty(primary.state, secondary.state),
      socialTags: mergeObjNonEmpty(primary.socialTags, secondary.socialTags),
      historicalDebts: mergeStrArr(primary.historicalDebts, secondary.historicalDebts),
      occurredNotes: mergeOccurredNotes(primary.occurredNotes, secondary.occurredNotes),
      narrativeDrives: mergeObjNonEmpty(primary.narrativeDrives, secondary.narrativeDrives),
      fingerprints: (() => {
        const out: any = mergeObjNonEmpty(primary.fingerprints, secondary.fingerprints);
        out.mask = mergeMask((primary.fingerprints as any)?.mask, (secondary.fingerprints as any)?.mask);
        if (Array.isArray((primary.fingerprints as any)?.linguisticStyle) || Array.isArray((secondary.fingerprints as any)?.linguisticStyle))
          out.linguisticStyle = mergeStrArr((primary.fingerprints as any)?.linguisticStyle, (secondary.fingerprints as any)?.linguisticStyle);
        if (Array.isArray((primary.fingerprints as any)?.catchphrases) || Array.isArray((secondary.fingerprints as any)?.catchphrases))
          out.catchphrases = mergeStrArr((primary.fingerprints as any)?.catchphrases, (secondary.fingerprints as any)?.catchphrases);
        if (Array.isArray((primary.fingerprints as any)?.mannerisms) || Array.isArray((secondary.fingerprints as any)?.mannerisms))
          out.mannerisms = mergeStrArr((primary.fingerprints as any)?.mannerisms, (secondary.fingerprints as any)?.mannerisms);
        return out;
      })(),
      relationalHooks: (() => {
        const out: any = mergeObjNonEmpty(primary.relationalHooks, secondary.relationalHooks);
        out.relations = mergeRelations((primary.relationalHooks as any)?.relations, (secondary.relationalHooks as any)?.relations);
        out.freeText = mergeFreeText((primary.relationalHooks as any)?.freeText, (secondary.relationalHooks as any)?.freeText);
        return out;
      })(),
      personalityAnalysis: normStr(primary.personalityAnalysis) ? primary.personalityAnalysis : secondary.personalityAnalysis,
      locks: hasVal(primary.locks) ? primary.locks : secondary.locks,
      updatedAt: now
    };

    const nextChars = chars.filter((_: any, i: number) => i !== si).map((c: any, i: number) => (i === (si < pi ? pi - 1 : pi) ? merged : c));
    for (const c of nextChars) {
      const rh = c?.relationalHooks;
      if (rh && typeof rh === "object" && Array.isArray((rh as any).relations)) {
        (rh as any).relations = (rh as any).relations
          .map((r: any) => {
            const t = normStr(r?.targetName);
            if (!t) return null;
            return { ...(r || {}), targetName: t === secondaryName ? primaryName : t };
          })
          .filter(Boolean);
      }
    }

    const hiddenSet = new Set((idx.hiddenNames || []).map((x: any) => String(x)));
    hiddenSet.delete(secondaryName);
    idx.hiddenNames = [...hiddenSet];
    idx.characters = nextChars;
    return idx;
  };

  try {
    for (const sec of secondaryNames) mergeOne({ idx, primaryName, secondaryName: sec });
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes("角色不存在")) return reply.code(404).send({ message: "角色不存在" });
    return reply.code(400).send({ message: msg });
  }

  idx.characters = (idx.characters || []).sort((a: any, b: any) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "zh-Hans-CN")
  );
  idx.updatedAt = now;
  await writeAuditCharactersIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx, mergedNames: secondaryNames };
});

app.post("/api/books/:bookId/audit/characters/merge/preview", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    primaryName: z.string().min(1),
    secondaryNames: z.array(z.string().min(1)).min(1),
    modelConfigId: z.string().nullable().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const primaryName = body.primaryName.trim();
  const secondaryNames = [...new Set(body.secondaryNames.map((s: string) => s.trim()).filter(Boolean))].filter(
    (n) => n !== primaryName
  );
  if (!primaryName || secondaryNames.length < 1) return reply.code(400).send({ message: "参数非法" });

  try {
    const settings = await readModelSettings();
    const activeId = body.modelConfigId ?? settings.activeId;
    const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
    if (!cfg) throw new Error("未配置模型");

    const idx = await readAuditCharactersIndex(getDataDir(), params.bookId);
    const chars = Array.isArray(idx.characters) ? idx.characters : [];
    const primary = chars.find((c: any) => String(c?.name || "").trim() === primaryName);
    const secondaryProfiles = secondaryNames
      .map((n) => chars.find((c: any) => String(c?.name || "").trim() === n))
      .filter(Boolean);
    if (!primary || secondaryProfiles.length !== secondaryNames.length) return reply.code(404).send({ message: "角色不存在" });

    const prompt = buildAuditCharacterMergePrompt({
      primaryName,
      primaryProfile: primary,
      secondaryProfiles
    });
    const out = await generateAuditCharacterMergeDraftWithAiSdk({ cfg, prompt });
    const merged = (out as any)?.merged;
    if (!merged || typeof merged !== "object") throw new Error("模型未返回 merged 字段");
    (merged as any).name = primaryName;
    return { ok: true, draft: merged };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/audit/characters/merge/apply", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    primaryName: z.string().min(1),
    secondaryNames: z.array(z.string().min(1)).min(1),
    draft: z.any()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const primaryName = body.primaryName.trim();
  const secondaryNames = [...new Set(body.secondaryNames.map((s: string) => s.trim()).filter(Boolean))].filter(
    (n) => n !== primaryName
  );
  if (!primaryName || secondaryNames.length < 1) return reply.code(400).send({ message: "参数非法" });
  if (!body.draft || typeof body.draft !== "object") return reply.code(400).send({ message: "draft 非法" });

  const idx = await readAuditCharactersIndex(getDataDir(), params.bookId);
  const chars = Array.isArray(idx.characters) ? idx.characters : [];
  const pi = chars.findIndex((c: any) => String(c?.name || "").trim() === primaryName);
  if (pi < 0) return reply.code(404).send({ message: "角色不存在" });
  for (const n of secondaryNames) {
    if (!chars.some((c: any) => String(c?.name || "").trim() === n)) return reply.code(404).send({ message: "角色不存在" });
  }

  const now = new Date().toISOString();
  const normStr = (v: any) => (typeof v === "string" ? v.trim() : "");
  const uniqStrs = (arr: any) =>
    [...new Set((Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter(Boolean))];
  const mergeStrArr = (a: any, b: any) => uniqStrs([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
  const hasVal = (v: any) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "boolean") return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return false;
  };
  const mergeObjNonEmpty = (p: any, n: any) => {
    const out: any = { ...(p && typeof p === "object" ? p : {}) };
    if (!n || typeof n !== "object") return out;
    for (const [k, v] of Object.entries(n)) {
      if (!hasVal(v)) continue;
      out[k] = v;
    }
    return out;
  };

  const primary = chars[pi] || {};
  const draft = body.draft as any;
  const merged = {
    ...primary,
    ...draft,
    name: primaryName,
    // locks 始终以主角色为准，避免 AI 覆盖用户锁定意图
    locks: hasVal(primary.locks) ? primary.locks : draft.locks,
    tags: Array.isArray(draft.tags) ? mergeStrArr([], draft.tags).slice(0, 30) : primary.tags,
    updatedAt: now
  };
  // 清洗对象字段（避免 draft 传 null 直接抹掉）
  merged.state = mergeObjNonEmpty(primary.state, draft.state);
  merged.socialTags = mergeObjNonEmpty(primary.socialTags, draft.socialTags);
  merged.narrativeDrives = mergeObjNonEmpty(primary.narrativeDrives, draft.narrativeDrives);
  merged.fingerprints = mergeObjNonEmpty(primary.fingerprints, draft.fingerprints);
  merged.relationalHooks = mergeObjNonEmpty(primary.relationalHooks, draft.relationalHooks);

  // 替换主角色条目、移除次角色条目
  const nextChars = chars
    .filter((c: any) => !secondaryNames.includes(String(c?.name || "").trim()))
    .map((c: any) => (String(c?.name || "").trim() === primaryName ? merged : c));

  // 修正全局引用：relations[].targetName 指向 secondaryName → primaryName
  for (const c of nextChars) {
    const rh = (c as any)?.relationalHooks;
    if (rh && typeof rh === "object" && Array.isArray((rh as any).relations)) {
      (rh as any).relations = (rh as any).relations
        .map((r: any) => {
          const t = normStr(r?.targetName);
          if (!t) return null;
          return { ...(r || {}), targetName: secondaryNames.includes(t) ? primaryName : t };
        })
        .filter(Boolean);
    }
  }
  // hiddenNames：移除所有 secondary
  const hiddenSet = new Set((idx.hiddenNames || []).map((x: any) => String(x)));
  for (const n of secondaryNames) hiddenSet.delete(n);
  idx.hiddenNames = [...hiddenSet];

  idx.characters = nextChars.sort((a: any, b: any) => String(a?.name || "").localeCompare(String(b?.name || ""), "zh-Hans-CN"));
  idx.updatedAt = now;
  await writeAuditCharactersIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.get("/api/books/:bookId/audit/places", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditPlacesIndex(getDataDir(), params.bookId);
  return { index: idx };
});

app.post("/api/books/:bookId/audit/places/hide", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({ name: z.string().min(1), hidden: z.boolean() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditPlacesIndex(getDataDir(), params.bookId);
  const set = new Set((idx.hiddenNames || []).map((x: any) => String(x)));
  const name = body.name.trim();
  if (body.hidden) set.add(name);
  else set.delete(name);
  idx.hiddenNames = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeAuditPlacesIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/audit/places/update", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    lastNote: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditPlacesIndex(getDataDir(), params.bookId);
  const name = body.name.trim();
  const i = (idx.places || []).findIndex((p: any) => String(p?.name || "").trim() === name);
  if (i < 0) return reply.code(404).send({ message: "地点不存在" });
  const now = new Date().toISOString();
  const prev = idx.places[i] || {};
  idx.places[i] = {
    ...prev,
    name,
    description: body.description !== undefined ? body.description : prev.description,
    lastNote: body.lastNote !== undefined ? body.lastNote : prev.lastNote,
    updatedAt: now
  };
  idx.updatedAt = now;
  await writeAuditPlacesIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/audit/places/merge/preview", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    primaryName: z.string().min(1),
    secondaryNames: z.array(z.string().min(1)).min(1),
    modelConfigId: z.string().nullable().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const primaryName = body.primaryName.trim();
  const secondaryNames = [...new Set(body.secondaryNames.map((s: string) => s.trim()).filter(Boolean))].filter(
    (n) => n !== primaryName
  );
  if (!primaryName || secondaryNames.length < 1) return reply.code(400).send({ message: "参数非法" });

  try {
    const settings = await readModelSettings();
    const activeId = body.modelConfigId ?? settings.activeId;
    const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
    if (!cfg) throw new Error("未配置模型");

    const idx = await readAuditPlacesIndex(getDataDir(), params.bookId);
    const places = Array.isArray(idx.places) ? idx.places : [];
    const primary = places.find((p: any) => String(p?.name || "").trim() === primaryName);
    const secondary = secondaryNames
      .map((n) => places.find((p: any) => String(p?.name || "").trim() === n))
      .filter(Boolean);
    if (!primary || secondary.length !== secondaryNames.length) return reply.code(404).send({ message: "地点不存在" });

    const prompt = buildAuditPlaceMergePrompt({ primaryName, primary, secondary });

    const { model, providerOptions } = createAiSdkModel(cfg);
    const { text } = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
      providerOptions
    } as any);
    const parsed = JSON.parse(stripJsonFence(String(text || "")));
    const merged = (parsed as any)?.merged;
    if (!merged || typeof merged !== "object") throw new Error("模型未返回 merged 字段");
    (merged as any).name = primaryName;
    return { ok: true, draft: merged };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/audit/places/merge/apply", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    primaryName: z.string().min(1),
    secondaryNames: z.array(z.string().min(1)).min(1),
    draft: z.any()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const primaryName = body.primaryName.trim();
  const secondaryNames = [...new Set(body.secondaryNames.map((s: string) => s.trim()).filter(Boolean))].filter(
    (n) => n !== primaryName
  );
  if (!primaryName || secondaryNames.length < 1) return reply.code(400).send({ message: "参数非法" });
  if (!body.draft || typeof body.draft !== "object") return reply.code(400).send({ message: "draft 非法" });

  const idx = await readAuditPlacesIndex(getDataDir(), params.bookId);
  const places = Array.isArray(idx.places) ? idx.places : [];
  const pi = places.findIndex((p: any) => String(p?.name || "").trim() === primaryName);
  if (pi < 0) return reply.code(404).send({ message: "地点不存在" });
  for (const n of secondaryNames) {
    if (!places.some((p: any) => String(p?.name || "").trim() === n)) return reply.code(404).send({ message: "地点不存在" });
  }

  const now = new Date().toISOString();
  const hasVal = (v: any) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "boolean") return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return false;
  };
  const mergeObjNonEmpty = (p: any, n: any) => {
    const out: any = { ...(p && typeof p === "object" ? p : {}) };
    if (!n || typeof n !== "object") return out;
    for (const [k, v] of Object.entries(n)) {
      if (!hasVal(v)) continue;
      out[k] = v;
    }
    return out;
  };

  const primary = places[pi] || {};
  const draft = body.draft as any;
  const merged = {
    ...primary,
    ...draft,
    name: primaryName,
    updatedAt: now
  };
  const cleaned = mergeObjNonEmpty(primary, merged);
  cleaned.name = primaryName;
  cleaned.updatedAt = now;

  const nextPlaces = places
    .filter((p: any) => !secondaryNames.includes(String(p?.name || "").trim()))
    .map((p: any) => (String(p?.name || "").trim() === primaryName ? cleaned : p));

  const hiddenSet = new Set((idx.hiddenNames || []).map((x: any) => String(x)));
  for (const n of secondaryNames) hiddenSet.delete(n);
  idx.hiddenNames = [...hiddenSet];

  idx.places = nextPlaces.sort((a: any, b: any) => String(a?.name || "").localeCompare(String(b?.name || ""), "zh-Hans-CN"));
  idx.updatedAt = now;
  await writeAuditPlacesIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.get("/api/books/:bookId/audit/orgs", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditOrgsIndex(getDataDir(), params.bookId);
  return { index: idx };
});

app.post("/api/books/:bookId/audit/orgs/hide", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({ name: z.string().min(1), hidden: z.boolean() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditOrgsIndex(getDataDir(), params.bookId);
  const set = new Set((idx.hiddenNames || []).map((x: any) => String(x)));
  const name = body.name.trim();
  if (body.hidden) set.add(name);
  else set.delete(name);
  idx.hiddenNames = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeAuditOrgsIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/audit/orgs/update", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    lastNote: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditOrgsIndex(getDataDir(), params.bookId);
  const name = body.name.trim();
  const i = (idx.orgs || []).findIndex((o: any) => String(o?.name || "").trim() === name);
  if (i < 0) return reply.code(404).send({ message: "组织不存在" });
  const now = new Date().toISOString();
  const prev = idx.orgs[i] || {};
  idx.orgs[i] = {
    ...prev,
    name,
    description: body.description !== undefined ? body.description : prev.description,
    lastNote: body.lastNote !== undefined ? body.lastNote : prev.lastNote,
    updatedAt: now
  };
  idx.updatedAt = now;
  await writeAuditOrgsIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.get("/api/books/:bookId/audit/foreshadows", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditForeshadowsIndex(getDataDir(), params.bookId);
  return { index: idx };
});

app.get("/api/books/:bookId/audit/progress", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditProgressIndex(getDataDir(), params.bookId);
  return { index: idx };
});

app.post("/api/books/:bookId/audit/progress/mark", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({ id: z.string().min(1), status: z.enum(["open", "progress", "done"]) });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditProgressIndex(getDataDir(), params.bookId);
  const id = body.id.trim();
  const i = (idx.items || []).findIndex((x: any) => String(x?.id || "").trim() === id);
  if (i < 0) return reply.code(404).send({ message: "事项不存在" });
  const now = new Date().toISOString();
  const prev = idx.items[i] || {};
  idx.items[i] = { ...prev, id, status: body.status, updatedAt: now };
  idx.updatedAt = now;
  await writeAuditProgressIndex(getDataDir(), params.bookId, idx as any);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/audit/progress/cleanupDone", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditProgressIndex(getDataDir(), params.bookId);
  const now = new Date().toISOString();
  idx.items = (idx.items || []).filter((x: any) => String(x?.status || "") !== "done");
  idx.updatedAt = now;
  await writeAuditProgressIndex(getDataDir(), params.bookId, idx as any);
  return { ok: true, index: idx };
});

app.get("/api/books/:bookId/writing-pack", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const querySchema = z.object({ chapter: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.safeParse((req as any).query);
  if (!query.success) return reply.code(400).send({ message: "缺少 chapter" });
  const chapterFilename = query.data.chapter.trim();
  const chapterId = chapterFilename.replace(/\.md$/, "");
  const pack = await readWritingPack(getDataDir(), params.bookId, chapterId);
  return { pack };
});

app.post("/api/books/:bookId/writing-pack/generate", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    chapterFilename: z.string().min(1),
    modelConfigId: z.string().nullable().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const chapterFilename = body.chapterFilename.trim();
  const chapterId = chapterFilename.replace(/\.md$/, "");

  try {
    const chapters = await listChapters(getDataDir(), params.bookId);
    const targetMeta = chapters.find((c: any) => String(c?.filename || "").trim() === chapterFilename);
    const chapterNo = parseChapterNoFromFilename(chapterFilename);
    const chapterTitle = String(targetMeta?.title || "").trim() || chapterFilename.replace(/\.md$/, "");

    const settings = await readModelSettings();
    const activeId = body.modelConfigId ?? settings.activeId;
    const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
    if (!cfg) throw new Error("未配置模型");

    const N = 3;
    const M = 2;
    const K = 12;

    const targetIdx = chapters.findIndex((c: any) => String(c?.filename || "").trim() === chapterFilename);
    const prevMetas = (targetIdx >= 0 ? chapters.slice(0, targetIdx) : chapters).slice(-Math.max(1, N * 2));

    const recentChapters: any[] = [];
    const anchorNames = {
      characters: new Set<string>(),
      places: new Set<string>(),
      orgs: new Set<string>()
    };
    const recentRisks: any[] = [];

    for (const m of prevMetas.slice(-N)) {
      const fn = String(m?.filename || "").trim();
      if (!fn) continue;
      const run = await readAuditRun(getDataDir(), params.bookId, fn).catch(() => null);
      const gist = String((run as any)?.gistL1 || "").trim();
      const chars = Array.isArray((run as any)?.entities?.characters) ? (run as any).entities.characters : [];
      const events = Array.isArray((run as any)?.entities?.events) ? (run as any).entities.events : [];
      const charNames = chars
        .map((c: any) => String(c?.name || "").trim())
        .filter(Boolean)
        .slice(0, 50);
      for (const n of charNames) anchorNames.characters.add(n);

      const pickPlace = (ev: any) =>
        String(ev?.place ?? ev?.location ?? ev?.where ?? ev?.["地点"] ?? ev?.["发生地点"] ?? "").trim();
      const pickOrg = (ev: any) =>
        String(ev?.org ?? ev?.organization ?? ev?.faction ?? ev?.["组织"] ?? ev?.["势力"] ?? "").trim();
      const places = new Set<string>();
      const orgs = new Set<string>();
      for (const ev of events) {
        const pn = pickPlace(ev);
        const on = pickOrg(ev);
        if (pn) places.add(pn);
        if (on) orgs.add(on);
      }
      for (const n of places) anchorNames.places.add(n);
      for (const n of orgs) anchorNames.orgs.add(n);

      const checks = Array.isArray((run as any)?.consistencyChecks) ? (run as any).consistencyChecks : [];
      for (const c of checks.slice(0, 8)) {
        recentRisks.push({
          issue: String(c?.issue || "").trim(),
          severity: String(c?.severity || "").trim(),
          suggestion: String(c?.suggestion || "").trim(),
          basis: `依据：${fn}`
        });
      }

      recentChapters.push({
        filename: fn,
        chapterNo: parseChapterNoFromFilename(fn),
        title: String((run as any)?.chapter?.title || m?.title || "").trim(),
        gistL1: gist,
        entities: {
          characters: charNames,
          places: [...places].slice(0, 40),
          orgs: [...orgs].slice(0, 40)
        }
      });
    }

    const timelineIndex = await readTimelineIndex(getDataDir(), params.bookId).catch(() => null as any);
    const compressedRanges = Array.isArray(timelineIndex?.compressedRanges)
      ? timelineIndex.compressedRanges.slice(-M)
      : [];

    const progressIndex = await readAuditProgressIndex(getDataDir(), params.bookId).catch(() => ({ items: [] } as any));
    const progressAll = Array.isArray((progressIndex as any)?.items) ? (progressIndex as any).items : [];
    const progressOpen = progressAll.filter((x: any) => String(x?.status || "") !== "done");
    const relScore = (it: any) => {
      const rel = it?.related && typeof it.related === "object" ? it.related : {};
      const s = new Set<string>();
      for (const k of ["characters", "places", "orgs"] as const) {
        const arr = Array.isArray((rel as any)[k]) ? (rel as any)[k] : [];
        for (const v of arr) s.add(String(v || "").trim());
      }
      let hit = 0;
      for (const n of s) {
        if (anchorNames.characters.has(n) || anchorNames.places.has(n) || anchorNames.orgs.has(n)) hit++;
      }
      const pr = Number(it?.priority) || 0;
      return hit * 10 + (pr ? 4 - pr : 0);
    };
    const progressCandidates = progressOpen
      .slice()
      .sort((a: any, b: any) => relScore(b) - relScore(a))
      .slice(0, K)
      .map((x: any) => ({
        id: String(x?.id || "").trim(),
        title: String(x?.title || "").trim(),
        detail: String(x?.detail || "").trim(),
        priority: x?.priority,
        related: x?.related ?? undefined,
        status: String(x?.status || "").trim()
      }))
      .filter((x: any) => x.id && x.title);

    const foreshadowsIndex = await readAuditForeshadowsIndex(getDataDir(), params.bookId).catch(() => null as any);
    const hidden = new Set((foreshadowsIndex?.hiddenIds || []).map((x: any) => String(x)));
    const foreshadowsAll = Array.isArray(foreshadowsIndex?.foreshadows) ? foreshadowsIndex.foreshadows : [];
    const foreshadowsOpen = foreshadowsAll.filter(
      (f: any) => !hidden.has(String(f?.id || "")) && String(f?.status || "") !== "closed"
    );
    const foreshadowCandidates = foreshadowsOpen
      .slice()
      .sort((a: any, b: any) => {
        // 相关性（先粗糙：标题命中锚点名）
        const aTitle = String(a?.title || "");
        const bTitle = String(b?.title || "");
        const hit = (t: string) => {
          let n = 0;
          for (const x of anchorNames.characters) if (x && t.includes(x)) n++;
          for (const x of anchorNames.places) if (x && t.includes(x)) n++;
          for (const x of anchorNames.orgs) if (x && t.includes(x)) n++;
          return n;
        };
        const ha = hit(aTitle);
        const hb = hit(bTitle);
        if (hb !== ha) return hb - ha;
        const la = Number(a?.lastChapter) || 0;
        const lb = Number(b?.lastChapter) || 0;
        return la - lb;
      })
      .slice(0, K)
      .map((f: any) => ({
        id: String(f?.id || "").trim(),
        title: String(f?.title || "").trim(),
        status: String(f?.status || "").trim(),
        firstChapter: Number(f?.firstChapter) || undefined,
        lastChapter: Number(f?.lastChapter) || undefined,
        chapters: Array.isArray(f?.chapters) ? f.chapters : undefined,
        lastProgress: String(f?.lastProgress || "").trim(),
        note: String(f?.note || "").trim()
      }))
      .filter((x: any) => x.id && x.title);

    const risks = recentRisks
      .filter((r) => r.issue)
      .slice(0, 20);

    const prompt = buildWritingPackPrompt({
      chapterTarget: { filename: chapterFilename, title: chapterTitle, chapterNo },
      evidence: { recentChapters, compressedRanges, progressCandidates, foreshadowCandidates, risks }
    });

    const { model, providerOptions } = createAiSdkModel(cfg);
    const { text } = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
      providerOptions
    } as any);

    const parsed = JSON.parse(stripJsonFence(String(text || "")));
    const now = new Date().toISOString();
    const pack: WritingPack = {
      version: 1,
      updatedAt: now,
      source: { windowChapters: N, windowCompressedRanges: M, pickedProgress: K, pickedForeshadows: K },
      chapterTarget: { filename: chapterFilename, title: chapterTitle, chapterNo: chapterNo ?? undefined },
      summary5: toCleanLines5((parsed as any)?.summary5),
      lists: {
        progress: clampList(Array.isArray((parsed as any)?.lists?.progress) ? (parsed as any).lists.progress : [], 4)
          .map((x: any) => ({ id: String(x?.id || "").trim(), title: String(x?.title || "").trim(), basis: typeof x?.basis === "string" ? x.basis : undefined }))
          .filter((x: any) => x.id && x.title),
        foreshadows: clampList(Array.isArray((parsed as any)?.lists?.foreshadows) ? (parsed as any).lists.foreshadows : [], 2)
          .map((x: any) => ({ id: String(x?.id || "").trim(), title: String(x?.title || "").trim(), basis: typeof x?.basis === "string" ? x.basis : undefined }))
          .filter((x: any) => x.id && x.title),
        risks: clampList(Array.isArray((parsed as any)?.lists?.risks) ? (parsed as any).lists.risks : [], 3)
          .map((x: any) => ({
            issue: String(x?.issue || "").trim(),
            severity: typeof x?.severity === "string" ? x.severity : undefined,
            basis: typeof x?.basis === "string" ? x.basis : undefined
          }))
          .filter((x: any) => x.issue)
      },
      disclaimer:
        "写作包仅供参考：用于帮助你快速进入状态与回忆当前悬念/欠账；你完全可以不采纳，按自己的创作思路推进。"
    };

    // 最终条数保护（progress<=4, foreshadows<=2, risks<=3 已限制）
    await writeWritingPack(getDataDir(), params.bookId, chapterId, pack);
    return { ok: true, pack };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/chapters/:filename/title/suggest", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    count: z.number().int().min(2).max(8).optional(),
    style: z
      .enum(["normal", "boom", "suspense", "hotblood", "funny", "poetic", "minimal"])
      .optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  try {
    const settings = await readModelSettings();
    const activeId = body.modelConfigId ?? settings.activeId;
    const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
    if (!cfg) throw new Error("未配置模型");

    const raw = await readChapter(getDataDir(), params.bookId, params.filename);
    const content = String(raw || "").slice(0, 12000);
    const n = body.count ?? 5;
    const style = body.style ?? "boom";

    const prompt = buildChapterTitleSuggestPrompt({ style, count: n, content, batchMode: false });

    const { model, providerOptions } = createAiSdkModel(cfg);
    const { text } = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
      providerOptions
    } as any);
    const parsed = JSON.parse(stripJsonFence(String(text || "")));
    const titlesRaw = Array.isArray((parsed as any)?.titles) ? (parsed as any).titles : [];
    const titles = titlesRaw
      .map((t: any) =>
        String(t || "")
          .replace(/[“”"'《》<>]/g, "")
          .replace(/[。！？!?]+$/g, "")
          .trim()
      )
      .map((t: string) => t.replace(/^第\s*\d+\s*章[:：]?\s*/g, "").trim())
      .filter((t: string) => t.length >= 2 && t.length <= 40)
      .slice(0, n);
    if (!titles.length) throw new Error("模型未返回标题候选");
    return { ok: true, titles };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/chapters/:filename/title/suggest/batch", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    count: z.number().int().min(2).max(8).optional(),
    styles: z
      .array(z.enum(["normal", "boom", "suspense", "hotblood", "funny", "poetic", "minimal"]))
      .min(1)
      .max(10)
      .optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const sanitizeTitles = (parsed: any, n: number): string[] => {
    const titlesRaw = Array.isArray(parsed?.titles) ? parsed.titles : [];
    return titlesRaw
      .map((t: any) =>
        String(t || "")
          .replace(/[“”"'《》<>]/g, "")
          .replace(/[。！？!?]+$/g, "")
          .trim()
      )
      .map((t: string) => t.replace(/^第\s*\d+\s*章[:：]?\s*/g, "").trim())
      .filter((t: string) => t.length >= 2 && t.length <= 40)
      .slice(0, n);
  };

  try {
    const settings = await readModelSettings();
    const activeId = body.modelConfigId ?? settings.activeId;
    const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
    if (!cfg) throw new Error("未配置模型");

    const raw = await readChapter(getDataDir(), params.bookId, params.filename);
    const content = String(raw || "").slice(0, 12000);
    const n = body.count ?? 5;
    const styles = body.styles?.length
      ? body.styles
      : (["boom", "suspense", "hotblood", "funny", "poetic", "minimal", "normal"] as const);

    const { model, providerOptions } = createAiSdkModel(cfg);

    const results: Array<{ style: string; titles: string[] }> = [];
    for (const style of styles) {
      const prompt = buildChapterTitleSuggestPrompt({ style: String(style), count: n, content, batchMode: true });

      const { text } = await generateText({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
        providerOptions
      } as any);

      const parsed = JSON.parse(stripJsonFence(String(text || "")));
      const titles = sanitizeTitles(parsed, n);
      results.push({ style: String(style), titles });
    }

    return { ok: true, results };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/search", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    q: z.string().min(1),
    // 兼容旧前端：scope 参数已忽略（现在只搜索章节正文）
    scope: z
      .object({ chapters: z.boolean().optional(), story: z.boolean().optional(), audit: z.boolean().optional() })
      .optional(),
    sort: z.enum(["asc", "desc"]).optional(),
    caseSensitive: z.boolean().optional(),
    wholeWord: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().min(0).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const q = body.q.trim();
  if (!q) return reply.code(400).send({ message: "q 不能为空" });
  const sort = body.sort === "desc" ? "desc" : "asc";
  const caseSensitive = Boolean(body.caseSensitive);
  const wholeWord = Boolean(body.wholeWord);
  const limit = body.limit ?? 200;
  const offset = body.offset ?? 0;

  try {
    const cache = await buildOrRefreshBookSearchCache(params.bookId);
    const hits: SearchHit[] = [];

    const docs = [...cache.docsByPath.values()];
    for (const doc of docs) {
      const lines = doc.lines || [];
      for (let li = 0; li < lines.length; li++) {
        const line = String(lines[li] ?? "");
        if (!line) continue;
        const matches = findAllMatchesInLine(line, q, caseSensitive);
        if (!matches.length) continue;
        const filtered = wholeWord ? matches.filter(([s, e]) => isWholeWordOk(line, s, e)) : matches;
        if (!filtered.length) continue;

        // excerpt：尽量用整行；过长截断并调整 matchRanges
        const maxLen = 200;
        let excerpt = line;
        let ranges = filtered;
        if (excerpt.length > maxLen) {
          const first = filtered[0];
          const center = Math.floor((first[0] + first[1]) / 2);
          const start = Math.max(0, center - Math.floor(maxLen / 2));
          const end = Math.min(line.length, start + maxLen);
          excerpt = line.slice(start, end);
          ranges = filtered
            .map(([s, e]) => [s - start, e - start] as [number, number])
            .filter(([s, e]) => e > 0 && s < excerpt.length)
            .map(([s, e]) => [Math.max(0, s), Math.min(excerpt.length, e)] as [number, number]);
        }

        hits.push({
          kind: "chapters",
          path: doc.relPath,
          title: doc.title,
          lineNo: li + 1,
          excerpt,
          matchRanges: ranges.slice(0, 20)
        });
      }
    }

    const chapterNoOf = (relPath: string): number => {
      // chapters/0008_xxx.md -> 8
      const m = String(relPath || "").match(/^chapters\/(\d+)_/);
      if (m && m[1]) return Number(m[1]) || 0;
      return 0;
    };
    hits.sort((a, b) => {
      const na = chapterNoOf(a.path);
      const nb = chapterNoOf(b.path);
      if (na !== nb) return na - nb;
      const pa = String(a.path || "");
      const pb = String(b.path || "");
      const pcmp = pa.localeCompare(pb, "zh-Hans-CN");
      if (pcmp !== 0) return pcmp;
      return (a.lineNo || 0) - (b.lineNo || 0);
    });
    if (sort === "desc") hits.reverse();

    const total = hits.length;
    const sliced = hits.slice(offset, offset + limit);
    return { total, groups: [{ kind: "chapters", count: total, hits: sliced }] } satisfies SearchResponse;
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:bookId/audit/foreshadows/create", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    title: z.string().min(1),
    status: z.enum(["open", "progress", "closed"]).optional(),
    lastProgress: z.string().optional(),
    note: z.string().optional(),
    chapters: z.array(z.number().int().min(1)).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditForeshadowsIndex(getDataDir(), params.bookId);
  const title = body.title.trim();
  const id = title.replace(/\s+/g, " ").slice(0, 160);
  if ((idx.foreshadows || []).some((f: any) => String(f?.id || "").trim() === id)) {
    return reply.code(409).send({ message: "伏笔已存在（同名）" });
  }
  const now = new Date().toISOString();
  const chapters = (body.chapters || [])
    .map((n) => Math.floor(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 1);
  chapters.sort((a, b) => a - b);
  (idx.foreshadows ||= []).push({
    id,
    title,
    status: body.status || "open",
    firstChapter: chapters.length ? chapters[0] : undefined,
    lastChapter: chapters.length ? chapters[chapters.length - 1] : undefined,
    chapters: chapters.length ? chapters : undefined,
    lastProgress: (body.lastProgress || "").trim() || "",
    note: (body.note || "").trim() || "",
    updatedAt: now
  });
  idx.updatedAt = now;
  await writeAuditForeshadowsIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/audit/foreshadows/update", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    id: z.string().min(1),
    title: z.string().optional(),
    status: z.enum(["open", "progress", "closed"]).optional(),
    lastProgress: z.string().optional(),
    note: z.string().optional(),
    chapters: z.array(z.number().int().min(1)).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditForeshadowsIndex(getDataDir(), params.bookId);
  const id = body.id.trim();
  const i = (idx.foreshadows || []).findIndex((f: any) => String(f?.id || "").trim() === id);
  if (i < 0) return reply.code(404).send({ message: "伏笔不存在" });
  const prev = idx.foreshadows[i] || {};
  const now = new Date().toISOString();
  const chapters = body.chapters
    ? body.chapters
        .map((n) => Math.floor(Number(n)))
        .filter((n) => Number.isFinite(n) && n >= 1)
        .sort((a, b) => a - b)
    : undefined;
  idx.foreshadows[i] = {
    ...prev,
    id,
    title: body.title !== undefined ? body.title.trim() : prev.title,
    status: body.status !== undefined ? body.status : prev.status,
    lastProgress: body.lastProgress !== undefined ? body.lastProgress : prev.lastProgress,
    note: body.note !== undefined ? body.note : prev.note,
    chapters: chapters !== undefined ? (chapters.length ? chapters : undefined) : prev.chapters,
    firstChapter: chapters !== undefined ? (chapters.length ? chapters[0] : undefined) : prev.firstChapter,
    lastChapter:
      chapters !== undefined ? (chapters.length ? chapters[chapters.length - 1] : undefined) : prev.lastChapter,
    updatedAt: now
  };
  idx.updatedAt = now;
  await writeAuditForeshadowsIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/audit/foreshadows/hide", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({ id: z.string().min(1), hidden: z.boolean() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditForeshadowsIndex(getDataDir(), params.bookId);
  const set = new Set((idx.hiddenIds || []).map((x: any) => String(x)));
  const id = body.id.trim();
  if (body.hidden) set.add(id);
  else set.delete(id);
  idx.hiddenIds = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeAuditForeshadowsIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.get("/api/books/:bookId/timeline/index", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readTimelineIndex(getDataDir(), params.bookId);
  return { index: idx };
});

app.post("/api/books/:bookId/timeline/event/mark", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({ id: z.string().min(1), status: z.enum(["open", "done"]) });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const idx = normalizeTimelineIndex(await readTimelineIndex(getDataDir(), params.bookId));
  const set = new Set(idx.manual?.doneEventIds ?? []);
  if (body.status === "done") set.add(body.id);
  else set.delete(body.id);
  idx.manual.doneEventIds = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeTimelineIndex(getDataDir(), params.bookId, idx);
  await writeStoryTimelineMarkdownFromIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/timeline/compress", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    startChapter: z.number().int().min(1),
    endChapter: z.number().int().min(1),
    modelConfigId: z.string().nullable().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const settings = await readModelSettings();
  const activeId = body.modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) return reply.code(400).send({ message: "未配置模型" });

  const a = Math.min(body.startChapter, body.endChapter);
  const b = Math.max(body.startChapter, body.endChapter);

  const idx = normalizeTimelineIndex(await readTimelineIndex(getDataDir(), params.bookId));
  const chapters = idx.chapters.filter((c) => c.chapter >= a && c.chapter <= b);
  if (chapters.length === 0) return reply.code(400).send({ message: "该区间没有已分析的章节摘要" });

  const prompt = buildTimelineRangeCompressPrompt({ startChapter: a, endChapter: b, chapters });

  const { model, providerOptions } = createAiSdkModel(cfg);
  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "low" as const }),
    providerOptions
  } as any);

  const summary = String(text || "").trim();
  if (!summary) return reply.code(400).send({ message: "模型未返回区间摘要" });

  const now = new Date().toISOString();
  const i = idx.compressedRanges.findIndex((r) => r.startChapter === a && r.endChapter === b);
  const row = { startChapter: a, endChapter: b, summary, lastCompressedAt: now };
  if (i >= 0) idx.compressedRanges[i] = row;
  else idx.compressedRanges.push(row);
  idx.compressedRanges.sort((x, y) => x.startChapter - y.startChapter || x.endChapter - y.endChapter);
  idx.updatedAt = now;

  await writeTimelineIndex(getDataDir(), params.bookId, idx);
  await writeStoryTimelineMarkdownFromIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/timeline/range/delete", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({ startChapter: z.number().int().min(1), endChapter: z.number().int().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const a = Math.min(body.startChapter, body.endChapter);
  const b = Math.max(body.startChapter, body.endChapter);
  const idx = normalizeTimelineIndex(await readTimelineIndex(getDataDir(), params.bookId));

  const before = idx.compressedRanges.length;
  idx.compressedRanges = idx.compressedRanges.filter((r) => !(r.startChapter === a && r.endChapter === b));
  if (idx.compressedRanges.length === before) return reply.code(404).send({ message: "区间不存在" });

  idx.updatedAt = new Date().toISOString();
  await writeTimelineIndex(getDataDir(), params.bookId, idx);
  await writeStoryTimelineMarkdownFromIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

// -----------------------------
// 大纲（outline.json）
// -----------------------------

// -----------------------------
// 灵感库（meta/inspiration.json）
// -----------------------------

app.get("/api/books/:bookId/inspiration", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = normalizeInspirationIndex(await readInspirationIndex(getDataDir(), params.bookId));
  return { index: idx };
});

app.post("/api/books/:bookId/inspiration/upsert", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    item: z.object({
      id: z.string().optional(),
      type: z.enum(["naming", "note", "generation"]).optional(),
      subtype: z.string().optional(),
      title: z.string().optional(),
      content: z.string().min(1),
      tags: z.array(z.string()).optional(),
      pinned: z.boolean().optional(),
      status: z.enum(["active", "hidden", "deleted"]).optional(),
      source: z.any().optional(),
      meta: z.any().optional()
    })
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const idx = normalizeInspirationIndex(await readInspirationIndex(getDataDir(), params.bookId));
  const now = new Date().toISOString();
  const incoming = normalizeIdeaItem({ ...body.item, updatedAt: now, createdAt: (body.item as any).createdAt || now });
  if (!incoming) return reply.code(400).send({ message: "Invalid item" });
  const i = idx.items.findIndex((x) => x.id === incoming.id);
  if (i >= 0) {
    idx.items[i] = { ...idx.items[i], ...incoming, id: idx.items[i].id, createdAt: idx.items[i].createdAt, updatedAt: now };
  } else {
    idx.items.unshift(incoming);
  }
  idx.updatedAt = now;
  await writeInspirationIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx, item: incoming };
});

app.post("/api/books/:bookId/inspiration/status", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    id: z.string().min(1),
    status: z.enum(["active", "hidden", "deleted"])
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const idx = normalizeInspirationIndex(await readInspirationIndex(getDataDir(), params.bookId));
  const i = idx.items.findIndex((x) => x.id === body.id);
  if (i < 0) return { ok: false, message: "Not found", index: idx };
  const now = new Date().toISOString();
  idx.items[i] = { ...idx.items[i], status: body.status, updatedAt: now };
  idx.updatedAt = now;
  await writeInspirationIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:bookId/inspiration/purge", async (req) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = normalizeInspirationIndex(await readInspirationIndex(getDataDir(), params.bookId));
  const before = idx.items.length;
  idx.items = idx.items.filter((x) => x.status !== "deleted");
  const purged = before - idx.items.length;
  idx.updatedAt = new Date().toISOString();
  await writeInspirationIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx, purged };
});

app.post("/api/books/:bookId/inspiration/generate", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    kind: z.enum(["character", "place", "org", "item", "event", "lore", "technique", "other"]),
    count: z.number().int().min(1).max(10).optional(),
    useMemory: z.boolean().optional(),
    options: z.any().optional(),
    freeText: z.string().optional(),
    itemOwnerCharacterName: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const settings = await readModelSettings();
  const activeId = body.modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) return reply.code(400).send({ message: "未配置模型" });

  const count = body.count ?? 3;
  const useMemory = Boolean(body.useMemory);
  const kind = body.kind;
  const timelineIndex = await readTimelineIndex(getDataDir(), params.bookId);
  const memoryText = useMemory
    ? kind === "org"
      ? buildMultiChapterCompressedMemoryOnly(timelineIndex)
      : buildMemoryContextFromTimeline(timelineIndex)
    : "";
  const knownCharacterNames = await listKnownCharacterNames(getDataDir(), params.bookId);
  const knownPlaceNames = await listKnownPlaceNames(getDataDir(), params.bookId);
  const opts = body.options ?? {};
  const free = String(body.freeText || "").trim();
  const itemOwnerCharacterName =
    kind === "item" || kind === "technique" ? String(body.itemOwnerCharacterName || "").trim() : "";
  const itemOwnerInfo =
    kind === "item" || kind === "technique"
      ? await resolveItemOwnerInfo(getDataDir(), params.bookId, itemOwnerCharacterName || undefined)
      : null;

  const prompt = buildInspirationPrompt({
    kind,
    count,
    opts,
    free,
    useMemory,
    memoryText,
    knownCharacterNames,
    knownPlaceNames,
    itemOwnerInfo
  });

  const { model, providerOptions } = createAiSdkModel(cfg);
  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "low" as const }),
    providerOptions
  } as any);

  const rawText = String(text || "");
  const arr = safeJsonParse<any[]>(rawText) || [];
  const cards = Array.isArray(arr) ? arr : [];
  if (!cards.length) return reply.code(400).send({ message: "模型未返回有效 JSON 数组" });

  const idx = normalizeInspirationIndex(await readInspirationIndex(getDataDir(), params.bookId));
  const now = new Date().toISOString();
  const items: IdeaItem[] = [];
  const stringifyInspKind =
    kind === "place"
      ? "place"
      : kind === "item"
        ? "item"
        : kind === "org"
          ? "organization"
          : kind === "event"
            ? "event"
            : kind === "lore"
              ? "lore"
              : kind === "technique"
                ? "technique"
                : "";
  for (const c of cards.slice(0, count)) {
    const content = stringifyInspirationContent(stringifyInspKind, c);
    if (!content) continue;
    const it: IdeaItem = {
      id: newId(),
      type: "generation",
      subtype:
        kind === "character"
          ? "character"
          : kind === "place"
            ? "place"
            : kind === "org"
              ? "organization"
              : kind === "item"
                ? "item"
                : kind === "event"
                  ? "event"
                  : kind === "lore"
                    ? "lore"
                    : kind === "technique"
                      ? "technique"
                      : kind,
      title: typeof c?.title === "string" ? c.title : undefined,
      content,
      tags: Array.isArray(c?.tags) ? c.tags.map((x: any) => String(x)).filter(Boolean) : undefined,
      pinned: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
      source: { provider: cfg.provider, model: (cfg.model || "").trim(), prompt },
      meta: {
        usedMemory: useMemory,
        ...(kind === "item" || kind === "technique"
          ? {
              itemOwnerMode: itemOwnerCharacterName ? ("bound" as const) : ("floating" as const),
              ...(itemOwnerCharacterName ? { itemOwnerCharacterName } : {})
            }
          : {})
      }
    };
    items.push(it);
  }
  if (!items.length) return reply.code(400).send({ message: "模型输出为空或不可用" });
  idx.items = [...items, ...idx.items];
  idx.updatedAt = now;
  await writeInspirationIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx, items, debug: { prompt, rawText } };
});

app.post("/api/books/:bookId/inspiration/generate-preview", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    kind: z.enum(["character", "place", "org", "item", "event", "lore", "technique", "other"]),
    count: z.number().int().min(1).max(10).optional(),
    useMemory: z.boolean().optional(),
    options: z.any().optional(),
    freeText: z.string().optional(),
    itemOwnerCharacterName: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const settings = await readModelSettings();
  const activeId = body.modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) return reply.code(400).send({ message: "未配置模型" });

  const count = body.count ?? 3;
  const useMemory = Boolean(body.useMemory);
  const kind = body.kind;
  const timelineIndex = await readTimelineIndex(getDataDir(), params.bookId);
  const memoryText = useMemory
    ? kind === "org"
      ? buildMultiChapterCompressedMemoryOnly(timelineIndex)
      : buildMemoryContextFromTimeline(timelineIndex)
    : "";
  const knownCharacterNames = await listKnownCharacterNames(getDataDir(), params.bookId);
  const knownPlaceNames = await listKnownPlaceNames(getDataDir(), params.bookId);

  const opts = body.options ?? {};
  const free = String(body.freeText || "").trim();
  const itemOwnerCharacterName =
    kind === "item" || kind === "technique" ? String(body.itemOwnerCharacterName || "").trim() : "";
  const itemOwnerInfo =
    kind === "item" || kind === "technique"
      ? await resolveItemOwnerInfo(getDataDir(), params.bookId, itemOwnerCharacterName || undefined)
      : null;

  const prompt = buildInspirationPrompt({
    kind,
    count,
    opts,
    free,
    useMemory,
    memoryText,
    knownCharacterNames,
    knownPlaceNames,
    itemOwnerInfo
  });

  const { model, providerOptions } = createAiSdkModel(cfg);
  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "low" as const }),
    providerOptions
  } as any);

  const rawText = String(text || "");
  const arr = safeJsonParse<any[]>(rawText) || [];
  const cards = Array.isArray(arr) ? arr : [];
  if (!cards.length) return reply.code(400).send({ message: "模型未返回有效 JSON 数组" });

  const now = new Date().toISOString();
  const items: IdeaItem[] = [];
  const stringifyInspKind =
    kind === "place"
      ? "place"
      : kind === "item"
        ? "item"
        : kind === "org"
          ? "organization"
          : kind === "event"
            ? "event"
            : kind === "lore"
              ? "lore"
              : kind === "technique"
                ? "technique"
                : "";
  for (const c of cards.slice(0, count)) {
    const content = stringifyInspirationContent(stringifyInspKind, c);
    if (!content) continue;
    items.push({
      id: newId(),
      type: "generation",
      subtype:
        kind === "character"
          ? "character"
          : kind === "place"
            ? "place"
            : kind === "org"
              ? "organization"
              : kind === "item"
                ? "item"
                : kind === "event"
                  ? "event"
                  : kind === "lore"
                    ? "lore"
                    : kind === "technique"
                      ? "technique"
                      : kind,
      title: typeof c?.title === "string" ? c.title : undefined,
      content,
      tags: Array.isArray(c?.tags) ? c.tags.map((x: any) => String(x)).filter(Boolean) : undefined,
      pinned: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
      source: { provider: cfg.provider, model: (cfg.model || "").trim(), prompt },
      meta: {
        usedMemory: useMemory,
        ...(kind === "item" || kind === "technique"
          ? {
              itemOwnerMode: itemOwnerCharacterName ? ("bound" as const) : ("floating" as const),
              ...(itemOwnerCharacterName ? { itemOwnerCharacterName } : {})
            }
          : {})
      }
    });
  }
  if (!items.length) return reply.code(400).send({ message: "模型输出为空或不可用" });
  return { ok: true, items, debug: { prompt, rawText } };
});

app.post("/api/books/:bookId/inspiration/variant", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    id: z.string().min(1),
    count: z.number().int().min(1).max(10).optional(),
    preset: z.string().optional(),
    freeText: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const settings = await readModelSettings();
  const activeId = body.modelConfigId || settings.activeId;
  const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
  if (!cfg) return reply.code(400).send({ message: "未配置模型" });

  const idx = normalizeInspirationIndex(await readInspirationIndex(getDataDir(), params.bookId));
  const base = idx.items.find((x) => x.id === body.id);
  if (!base) return reply.code(404).send({ message: "原条目不存在" });

  const count = body.count ?? 3;
  const preset = String(body.preset || "").trim();
  const free = String(body.freeText || "").trim();

  const prompt = buildInspirationVariantsPrompt({
    count,
    preset,
    free,
    base: { type: base.type, subtype: base.subtype, title: base.title, content: base.content }
  });

  const { model, providerOptions } = createAiSdkModel(cfg);
  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "low" as const }),
    providerOptions
  } as any);

  const rawText = String(text || "");
  const arr = safeJsonParse<any[]>(rawText) || [];
  const cards = Array.isArray(arr) ? arr : [];
  if (!cards.length) return reply.code(400).send({ message: "模型未返回有效 JSON 数组" });

  const now = new Date().toISOString();
  const items: IdeaItem[] = [];
  for (const c of cards.slice(0, count)) {
    const content = stringifyInspirationContent(String(base.subtype || ""), c);
    if (!content) continue;
    items.push({
      id: newId(),
      type: base.type,
      subtype: base.subtype,
      title: typeof c?.title === "string" ? c.title : base.title,
      content,
      tags: Array.isArray(c?.tags) ? c.tags.map((x: any) => String(x)).filter(Boolean) : base.tags,
      pinned: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
      source: { provider: cfg.provider, model: (cfg.model || "").trim(), prompt },
      meta: { parentId: base.id, variantPolicy: { preset, freeText: free, count } }
    });
  }
  if (!items.length) return reply.code(400).send({ message: "模型输出为空或不可用" });
  idx.items = [...items, ...idx.items];
  idx.updatedAt = now;
  await writeInspirationIndex(getDataDir(), params.bookId, idx);
  return { ok: true, index: idx, items, debug: { prompt, rawText } };
});

// 兼容旧路由：novels -> books
app.get("/api/novels", async () => {
  const novels = await listNovels(getDataDir());
  return { novels };
});

app.post("/api/novels", async (req, reply) => {
  const bodySchema = z.object({
    title: z.string().min(1),
    slug: z.string().optional(),
    synopsis: z.string().max(20000).optional()
  });
  const body = bodySchema.parse((req as any).body);
  const bookId = crypto.randomUUID();
  const displaySlug = safeSlug(body.slug?.trim() || body.title) || undefined;

  try {
    const meta = await createNovel(getDataDir(), bookId, body.title, body.synopsis, { slug: displaySlug });
    return { novel: novelSummaryFromMeta(meta, 0, []) };
  } catch (e: any) {
    return reply.code(409).send({ message: e?.message || "Conflict" });
  }
});

app.get("/api/novels/:bookId/chapters", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const chapters = await listChapters(getDataDir(), params.bookId);
  return { chapters };
});

app.post("/api/novels/:bookId/chapters", async (req, reply) => {
  const paramsSchema = z.object({ bookId: z.string().min(1) });
  const bodySchema = z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    chapterIndex: z.number().int().min(1).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const chapter = await createChapter(getDataDir(), params.bookId, body.title, body.content, body.chapterIndex);
  return { chapter };
});

app.get("/api/novels/:bookId/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    const content = await readChapter(getDataDir(), params.bookId, params.filename);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/novels/:bookId/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    content: z.string()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateChapter(getDataDir(), params.bookId, params.filename, body.content);
  return { ok: true };
});

app.patch("/api/novels/:bookId/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    title: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const chapter = await renameChapterTitle(getDataDir(), params.bookId, params.filename, body.title);
    return { chapter };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Rename failed" });
  }
});

app.delete("/api/novels/:bookId/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    bookId: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    await deleteChapter(getDataDir(), params.bookId, params.filename);
    return { ok: true };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Delete failed" });
  }
});

registerBookSetupRoutes(app, {
  getDataDir,
  readModelSettings: async () => {
    const s = await readModelSettings();
    return { configs: s.configs, activeId: s.activeId };
  },
  createAiSdkModel: (cfg) => createAiSdkModel(cfg as ModelConfig)
});

registerBookNotesRoutes(app, { getDataDir });

await app.listen({ port: PORT, host: "127.0.0.1" });
