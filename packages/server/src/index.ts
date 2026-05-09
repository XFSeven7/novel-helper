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
  TimelineIndex,
  WritingPack,
  readInspirationIndex,
  writeInspirationIndex,
  InspirationIndex,
  IdeaItem
} from "./fsStore.js";
import { resolveDataDir, safeSlug } from "./paths.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  preflightContinue: false
});

const PORT = Number(process.env.PORT || 3177);
const dataDir = resolveDataDir(process.env.NOVEL_HELPER_DATA_DIR);

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

function settingsDir() {
  return path.join(dataDir, "_settings");
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

/** 地点卡 / 道具卡等允许 content 为结构化对象；落库与 UI 统一为字符串 */
function stringifyInspirationContent(subtypeOrKind: string, card: any): string {
  const raw = card?.content;
  if (raw == null) return "";
  if (
    (subtypeOrKind === "place" || subtypeOrKind === "item") &&
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

function truncateForPrompt(s: string, max: number): string {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 8)) + "…（截断）";
}

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

/** 空名 → null（无主/待定语义由提示词侧说明）；找不到卡仍返回弱约束对象 */
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

function buildInspirationPrompt(input: {
  kind: "naming" | "character" | "place" | "org" | "item" | "other";
  count: number;
  opts: any;
  free: string;
  useMemory: boolean;
  memoryText: string;
  knownCharacterNames: string[];
  knownPlaceNames?: string[];
  itemOwnerInfo?: object | null;
}): string {
  const { kind, count, opts, free, useMemory, memoryText, knownCharacterNames, knownPlaceNames, itemOwnerInfo } = input;

  const characterDirectorPreamble = [
    "你是一位拥有‘全知视角’的叙事逻辑架构师与叙事导演。你负责在给定的世界观与剧情框架下，策划具备高逻辑粘性、强冲突张力的【角色灵感卡片】。",
    "",
    "通用叙事法则",
    "1. 补位逻辑：生成的角色必须作为‘剧情催化剂’或‘逻辑闭环点’。禁止生成背景板，每个角色必须携带能推动现有矛盾演变的信息、资源或动机。",
    "2. 业力链接：角色严禁是逻辑孤岛。他们必须通过利益、情感或契约与【已知角色】或【当前冲突点】产生直接关联。",
    "3. 阶级与生态位：角色设定必须严格对齐当前世界的社会阶层与力量体系，体现该环境下特有的生存压力或职业质感。",
    "4. 叙事守恒：角色的‘付出’与‘获得’、‘伤势’与‘地位’应符合因果律。描述细节需真实、具体，拒绝虚浮的形容词。",
    ""
  ];

  const schemaHintBase = [
    "请严格输出 JSON 数组（不要解释、不要 markdown、不要代码块）。",
    "每个元素字段：{ title: string, content: string, tags?: string[] }。"
  ];

  const memoryBlock = useMemory
    ? "【参考全书记忆】（用于一致性与避重复）\n" + memoryText
    : "【参考全书记忆】（未启用）";

  const commonBase = [
    ...(kind === "character" ? characterDirectorPreamble : ["你是网络小说写作助手。", ""]),
    ...schemaHintBase,
    "",
    memoryBlock,
    ""
  ];

  const taskMetaLines = [`【数量】生成 ${count} 条。`, free ? `【要求】${free}` : null].filter(Boolean) as string[];

  const characterLine = knownCharacterNames.length
    ? "【当前书籍已存在角色名（禁止重复创建/禁止同名）】\n" + knownCharacterNames.join("、")
    : "【当前书籍已存在角色名】（空）";

  const placeLine =
    Array.isArray(knownPlaceNames) && knownPlaceNames.length
      ? "【当前书籍已存在地点名（尽量引用以保持一致；避免凭空造新地名）】\n" + knownPlaceNames.join("、")
      : "【当前书籍已存在地点名】（空）";

  // 避免“生成地点却带角色名单 / 生成角色却带地点名单”造成干扰：
  // - character: 只带角色名
  // - place: 只带地点名
  // 其他类型：根据通用性同时提供（可改为按需再细分）
  const contextLines =
    kind === "character"
      ? ["", characterLine, ""]
      : kind === "place"
        ? ["", placeLine, ""]
        : kind === "naming"
          ? ["", characterLine, ""]
          : ["", characterLine, placeLine, ""];

  const common = [...commonBase, ...contextLines];

  if (kind === "character") {
    return [
      ...common,
      "【任务】只生成【角色卡】，不要生成场景/道具/地点/组织条目。",
      ...taskMetaLines,
      "【角色卡硬性要求】",
      "- title 必须是角色名（2-4字为主，避免现代跳戏，避免生僻字）。",
      "- 禁止生成与“已存在角色名”同名的角色；如发生冲突，请改名后再输出。",
      "- content 必须包含以下小标题（用中文，允许为空但必须出现）：",
      "  - 性格",
      "  - 背景",
      "  - 动机（Want/Need）",
      "  - 能力与限制",
      "  - 关系钩子（必须明确关联至少1个已知角色/势力，并写出具体冲突点）",
      "  - 口癖与动作特征",
      "- tags：2-4个（生态位/阵营/职业/标签）。",
      "",
      "现在输出 JSON 数组："
    ].join("\n");
  }

  if (kind === "place") {
    const memorySnapshot =
      useMemory && String(memoryText || "").trim()
        ? String(memoryText).trim()
        : "（未启用全书记忆或无可用快照。）";
    const coreDirection =
      free || "设计一个能承载当前矛盾冲突、且具备探索深度的场景。";
    const optsBlock =
      opts && typeof opts === "object" && Object.keys(opts).length
        ? ["【结构化可选项（来自用户 JSON）】", JSON.stringify(opts, null, 2), ""].join("\n")
        : "";

    return [
      "你是一位顶尖的叙事场景设计师。你负责在给定的世界观框架下，策划具备强功能性、高辨识度且能激发冲突的【场景/地点灵感卡片】。",
      "",
      "地点设计逻辑",
      "1. 容器原则：地点不仅是空间，更是‘矛盾的容器’。它必须为角色提供交互的可能性（如：藏身、交易、对峙）。",
      "2. 资源与限制：每个地点必须明确‘它能提供什么’（资源/庇护）以及‘它禁止什么’（危险/规则）。",
      "3. 叙事余波：地点应带有历史或事件的痕迹，体现世界观的宏观逻辑（如：战乱后的废墟、繁荣背后的阴影）。",
      "4. 空间层次：描述需具备空间感（由远及近、由表及里），拒绝平铺直叙的形容词堆砌。",
      "",
      "## Context Injection (上下文对齐)",
      "【全书记忆快照】",
      memorySnapshot,
      "",
      placeLine,
      optsBlock ? optsBlock : "",
      "## Task Requirements (任务定义)",
      `- 生成数量：${count}`,
      `- 核心方向：${coreDirection}`,
      "",
      "只生成【地点卡】；不要以角色或道具作为卡片主体。title 必须与【当前书籍已存在地点名】中的任一条不同（禁止同名）。",
      "",
      "## Output Format (JSON Array)",
      "请严格输出 JSON 数组（顶层为数组，长度等于生成数量），禁止任何解释说明、禁止 markdown、禁止代码块。每个对象必须包含：",
      "{",
      '  "title": "地点名称(需符合世界观风格)",',
      '  "tags": ["环境类型", "危险等级", "功能属性"],',
      '  "content": {',
      '    "atmosphere": "核心氛围描述(通过光线、气味、温度等具体感官切入)",',
      '    "layout": "空间布局简述(关键坐标点或视野层级)",',
      '    "functions": "该地点能为角色提供的实际用途(如：疗伤、情报、隐匿)",',
      '    "hazards": "该地点的潜在威胁、禁忌或环境限制(剧情压制力)",',
      '    "hidden_hooks": "此处隐藏的秘密、伏笔或可能关联的业力点(与已知剧情挂钩)",',
      '    "sensory_fingerprints": {',
      '      "sound": "独特的背景声响",',
      '      "visual": "具有视觉冲击力的标志性景物",',
      '      "smell": "空气中弥漫的特征气味"',
      "    },",
      '    "relationship_hooks": [',
      '      { "target": "已知势力/角色", "nature": "关联性质(如：领地、禁区、接头点)", "description": "具体的逻辑联系" }',
      "    ]",
      "  }",
      "}",
      "",
      "若缺少已知关联信息，relationship_hooks 仍须输出数组（可为空数组 []），不得省略 content 内任一字段；字段内容尽量具体，避免空字符串占位。"
    ].join("\n");
  }

  if (kind === "org") {
    return [
      ...common,
      "【任务】只生成【组织卡】，不要生成角色/道具为主体。",
      ...taskMetaLines,
      "要求：title=组织名；content需包含：理念/结构/手段资源/当前矛盾/与主角线切入点(至少2条)。",
      "现在输出 JSON 数组："
    ].join("\n");
  }

  if (kind === "item") {
    const memorySnapshot =
      useMemory && String(memoryText || "").trim()
        ? String(memoryText).trim()
        : "（未启用全书记忆或无可用快照。）";
    const coreDirection = free || "设计一件能推动矛盾、并与当前叙事张力相匹配的关键道具或器物。";
    const optsBlock =
      opts && typeof opts === "object" && Object.keys(opts).length
        ? ["【结构化可选项（来自用户 JSON）】", JSON.stringify(opts, null, 2), ""].join("\n")
        : "";
    const ownershipBlock =
      itemOwnerInfo != null
        ? [
            "## Ownership Logic（有主 / 已绑定持有者）",
            "下列 JSON 为【指定持有者】自审核角色卡组装的精简信息（可能已截断）。道具的叙事钩子、使用习惯与代价应优先与该持有者的心理动机、关系网与当前状态相容；禁止把道具写成与持有者完全无关的孤立设定。",
            JSON.stringify(itemOwnerInfo, null, 2),
            ""
          ].join("\n")
        : [
            "## Ownership Logic（无主 / 待定归属）",
            "用户未指定持有者：道具应为「可先收灵感、后分配角色」的待定归属物。",
            "语义说明：这是「归属尚未在工具中绑定」，不是要求你假设世界上绝对无人认领；允许写成路边遗物、组织公物、无主赃物等。",
            "请让 ownership_status 明确写出当前叙事上的归属状态（如：无主/公物/来历不明/暂由某人保管但非心认之主 等）。",
            ""
          ].join("\n");

    return [
      "你是一位顶尖的叙事道具与器物设计师。你负责在给定的世界观与剧情框架下，策划具备功能张力、代价清晰、可反复在章节中回收的【道具灵感卡片】。",
      "",
      "道具设计逻辑",
      "1. 业力工具：道具必须改变信息、资源或权力平衡；禁止纯装饰品式设定。",
      "2. 触发与代价：写清如何生效、对谁有效、失败或滥用的反噬/限制。",
      "3. 叙事可回收：提供可在多章复用的钩子，而非一次性说明文。",
      "4. 归属一致：有主时与持有者动机咬合；无主时保留可被多角色争夺或认领的空间。",
      "",
      "## Context Injection（上下文对齐）",
      "【全书记忆快照】",
      memorySnapshot,
      "",
      "（本任务不注入全书角色名列表与地点名列表；若用户指定持有者，其信息仅见下方 Ownership 段。）",
      "",
      optsBlock ? optsBlock : "",
      ownershipBlock,
      "## Task Requirements（任务定义）",
      `- 生成数量：${count}`,
      `- 核心方向：${coreDirection}`,
      "",
      "只生成【道具卡】；不要以角色或地点作为卡片主体。title 为器物/道具名称，符合世界观即可。",
      "",
      "## Output Format（JSON Array）",
      "请严格输出 JSON 数组（顶层为数组，长度等于生成数量），禁止任何解释说明、禁止 markdown、禁止代码块。每个对象必须包含：",
      "{",
      '  "title": "道具名称(符合世界观)",',
      '  "tags": ["器物类型", "风险等级", "叙事功能"],',
      '  "content": {',
      '    "appearance": "外观与质感（具体可见可触，避免空泛形容词）",',
      '    "ownership_status": "归属与流转状态（与 Ownership Logic 一致）",',
      '    "functions": "核心效果与典型使用方式（含触发条件）",',
      '    "limitations": "限制、代价、反噬或失效条件（必填）",',
      '    "origin": "来历、传闻或获取路径（可与全书记忆挂钩）",',
      '    "narrative_hooks": "可跨章复用的剧情切入点（2-4 条，可用换行分隔）",',
      '    "relationship_hooks": [',
      '      { "target": "角色/势力/地点", "nature": "关联性质", "description": "具体叙事联系" }',
      "    ]",
      "  }",
      "}",
      "",
      "relationship_hooks 必须输出数组（可为空数组 []）；不得省略 content 内任一字段；字段内容尽量具体，避免空字符串占位。"
    ].join("\n");
  }

  if (kind === "naming") {
    return [
      ...common,
      "【任务】只生成【名字候选】。",
      ...taskMetaLines,
      "要求：title=名字；content=一句话理由或适用对象（可短）。tags可包含：风格/类型（可选）。",
      "现在输出 JSON 数组："
    ].join("\n");
  }

  return [
    ...common,
    "【任务】生成可直接落地写作的灵感卡片（非角色卡专用）。",
    ...taskMetaLines,
    "现在输出 JSON 数组："
  ].join("\n");
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
  const bookDir = path.join(dataDir, key);

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

function buildWritingPackPrompt(input: {
  chapterTarget: { filename: string; title?: string; chapterNo?: number | null };
  evidence: {
    recentChapters: any[];
    compressedRanges: any[];
    progressCandidates: any[];
    foreshadowCandidates: any[];
    risks: any[];
  };
}) {
  const schema = {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: {
      windowChapters: 3,
      windowCompressedRanges: 2,
      pickedProgress: 12,
      pickedForeshadows: 12
    },
    chapterTarget: {
      filename: input.chapterTarget.filename,
      title: input.chapterTarget.title,
      chapterNo: input.chapterTarget.chapterNo ?? undefined
    },
    summary5: [
      "现状态势（事实，1句）",
      "现状态势（事实，1句）",
      "读者期待（爽点，参考，1句）",
      "读者期待（悬疑/推进，参考，1句）",
      "下一章可能方向（推测，1句，含两个并列方向，用分号隔开，句式含“可能/可以考虑”，末尾加“（参考）”）"
    ],
    lists: {
      progress: [{ id: "progressId", title: "进行中标题", basis: "依据：来自progress/近章/压缩块" }],
      foreshadows: [{ id: "foreshadowId", title: "伏笔标题", basis: "依据：来自foreshadow/近章/压缩块" }],
      risks: [{ issue: "一致性风险描述", severity: "low|medium|high", basis: "依据：来自近章一致性/设定" }]
    },
    disclaimer: "写作包仅供参考：用于帮助你快速进入状态与回忆当前悬念/欠账；你完全可以不采纳，按自己的创作思路推进。"
  };

  return [
    "你是网文小说写作助手。现在要为“新建章节”生成一份【短写作包】（给作者参考，不要指挥作者）。",
    "",
    "硬性要求：",
    "- 严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    "- summary5 必须恰好 5 句，每句尽量短。",
    "- 清单总计不超过 9 条：progress<=4、foreshadows<=2、risks<=3。",
    "- 口吻必须是“参考/可能/可关注”，禁止使用“必须/应该”。",
    "- 不要新增新角色/新设定/新关键道具；只能基于给定证据做概括与推测（推测必须标注为参考）。",
    "",
    "目标章节：",
    JSON.stringify(
      { filename: input.chapterTarget.filename, title: input.chapterTarget.title, chapterNo: input.chapterTarget.chapterNo ?? null },
      null,
      2
    ),
    "",
    "可用证据（只基于这些内容）：",
    JSON.stringify(input.evidence, null, 2),
    "",
    "输出 schema：",
    JSON.stringify(schema, null, 2),
    "",
    "现在输出 JSON："
  ].join("\n");
}

function buildAuditPrompt(input: {
  chapterTitle: string;
  chapterFilename: string;
  content: string;
  knownCharacters: string[];
}) {
  const RELATION_ENUMS = {
    narrative: ["Ally", "Mentor", "Antagonist", "Rival", "Support", "Harbinger"],
    tie: ["KindredSpirit", "LoveInterest", "Kinship", "ArchNemesis", "MutualDisdain", "Admiration", "Indebtedness"],
    hidden: ["Judas", "Guardian", "Foil"],
    karma: ["Contractual", "Symbiotic", "InformationGap"]
  } as const;
  const RELATION_ENUM_IDS = [
    ...RELATION_ENUMS.narrative.map((x) => `narrative.${x}`),
    ...RELATION_ENUMS.tie.map((x) => `tie.${x}`),
    ...RELATION_ENUMS.hidden.map((x) => `hidden.${x}`),
    ...RELATION_ENUMS.karma.map((x) => `karma.${x}`)
  ];
  return [
    "你是小说写作助手，负责“章节审计(Chapter Auditing)”工作流。",
    "请严格输出 JSON（不要解释、不要 markdown、不要代码块），字段需符合下面 schema。",
    "",
    "你需要对角色做“降噪提取（带保质期）”：",
    "- 基础设定（姓名/种族/出身等）：仅在首次出现或你非常确定时才填；不确定就留空。",
    "- 业力账本（状态/伤疤/仇恨/承诺/历史债）：每次审计都尽量更新为“最新状态”。",
    "- 瞬时情绪（愤怒/尴尬/激动等）：不要写入角色画像（可忽略）。",
    "- 对话风格/口癖：采样保留，只提炼 3-7 条关键特征即可。",
    "- 关系钩子：优先结构化到 relations（按对方角色名）；无法结构化时再写到 freeText。",
    "- 关系类型标签：你需要为 relations 选择受控枚举 types（多选，可空）。不确定就留空。",
    "",
    "关系类型受控枚举（relations[].types 只能从这里选，格式为 group.Item）：",
    RELATION_ENUM_IDS.join("、"),
    "",
    "已知角色名单（仅供参考，可能不全）：",
    input.knownCharacters.length ? input.knownCharacters.join("、") : "（空）",
    "",
    "章节：",
    `${input.chapterFilename} · ${input.chapterTitle}`,
    "",
    "正文：",
    input.content,
    "",
    "输出 JSON schema（可额外增加字段，但不要省略这些字段）：",
    JSON.stringify(
      {
        chapter: {
          filename: input.chapterFilename,
          id: input.chapterFilename.replace(/\\.md$/, ""),
          title: input.chapterTitle,
          wordCount: 0,
          auditedAt: new Date().toISOString()
        },
        gistL1: "300字内梗概",
        entities: {
          characters: [
            {
              name: "角色名",
              newOrExisting: "new/existing/unknown",
              tags: ["可枚举标签（可空）"],
              state: { location: "", injuries: "", items: [], moneyChange: 0 },
              socialTags: { profession: "", class: "", titles: ["头衔"], other: ["其他社会标签"] },
              historicalDebts: ["重大决策/承诺/债（列表）"],
              narrativeDrives: {
                want: "显性目标",
                need: "隐性成长",
                moralCompass: "道德罗盘/默认倾向",
                flaws: ["缺陷/盲点"],
                blindSpots: ["认知局限/误以为正确的事"]
              },
              fingerprints: {
                linguisticStyle: ["句式/语气特征（3-7条）"],
                catchphrases: ["口头禅（可空）"],
                mannerisms: ["标志性动作（可空）"],
                mask: [{ context: "在谁面前/什么场景", persona: "呈现出的面具/人设" }]
              },
              relationalHooks: {
                relations: [
                  {
                    targetName: "对方角色名",
                    types: RELATION_ENUM_IDS.slice(0, 2),
                    emotionalPolarity: "喜爱/厌恶/恐惧/亏欠/复杂等",
                    conflictIndex: "资源/信念/目标冲突点",
                    sharedSecrets: ["共享秘密（可空）"]
                  }
                ],
                freeText: "无法结构化的关系线索（可空）"
              },
              evidenceQuotes: ["原文证据短句"]
            }
          ],
          events: [{ type: "冲突/对话/战斗/交易/发现", summary: "", participants: [], stakes: "", resolved: false }]
        },
        consistencyChecks: [{ rule: "", issue: "", severity: "low/medium/high", suggestion: "" }],
        causalAnchors: { setups: [], payoffs: [] },
        impactAnalysis: [
          { item: "", impactScore: 0, why: "", futureImplications: ["对后续剧情的影响与建议"] }
        ],
        compression: { l2Pruning: null, mergeCandidates: null },
        ledgerUpdates: { openLoops: [], closedLoops: [] },
        uiInjection: { spotlightCharacters: [], spotlightTags: [] }
      },
      null,
      2
    )
  ].join("\n");
}

function buildThinkingPrompt(input: {
  chapterTitle: string;
  chapterFilename: string;
  content: string;
  knownCharacters: string[];
}) {
  return [
    "你是小说写作助手，正在进行「章节审计」的内部思考（给用户看的）。",
    "要求：",
    "- 用中文，条理清晰；用小标题 + 要点列表即可。",
    "- **禁止输出 JSON / 代码块 / markdown fence**。",
    "- 可以先发散思考，但最后要给出一个简短的行动清单（不超过 10 条）。",
    "",
    "你需要覆盖的思考维度（可按顺序展开）：",
    "1) 本章发生了什么（人物、地点、冲突、转折）",
    "2) 与已知角色名单的矛盾风险（点名指出疑点）",
    "3) 设定一致性风险（战力/境界/道具/金钱等若可从文本推断）",
    "4) 因果锚点：本章埋了什么坑、收了什么坑（setup/payoff）",
    "5) 对后续剧情的影响力排序（最重要 3 条）",
    "",
    "已知角色名单（仅供参考，可能不全）：",
    input.knownCharacters.length ? input.knownCharacters.join("、") : "（空）",
    "",
    "章节：",
    `${input.chapterFilename} · ${input.chapterTitle}`,
    "",
    "正文：",
    input.content
  ].join("\n");
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

function buildCharacterCardMergePrompt(input: {
  primaryTitle: string;
  primaryContent: string;
  secondary: Array<{ title: string; content: string }>;
}) {
  const secondaryBlock = input.secondary
    .map((x, i) => [`【次卡 ${i + 1}】标题：${x.title}`, "内容：", x.content].join("\n"))
    .join("\n\n");
  return [
    "你是小说写作助手。现在要把“同一个角色”的多张角色卡，合并成一张最终角色卡（Markdown）。",
    "",
    "输出要求（必须严格遵守）：",
    "- 只输出 Markdown 纯文本：不要代码块，不要 ``` fence，不要多余解释。",
    "- 必须包含极简 YAML frontmatter，且只允许两个字段：role、tags。例如：",
    "---",
    "role: 配角",
    "tags: [盟友, 反派]",
    "---",
    "- frontmatter 之后必须有一个 H1：# 角色名（用主卡标题作为角色名）。",
    "- tags：从所有卡中合并去重，最多 30 个。",
    "- role：优先沿用主卡的 role；如果主卡没有 role，再从次卡选择最合适的一个。",
    "- 正文请融合去重，尽量保持结构清晰，建议包含：目标/动机/弱点/外貌/关系（可为空但保留条目）。",
    "",
    `主卡标题：${input.primaryTitle}`,
    "【主卡内容】",
    input.primaryContent,
    "",
    secondaryBlock ? "【次卡列表】\n" + secondaryBlock : "【次卡列表】（空）",
    "",
    "现在开始输出最终合并后的角色卡 Markdown："
  ].join("\n");
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

function buildAuditCharacterMergePrompt(input: {
  primaryName: string;
  primaryProfile: any;
  secondaryProfiles: any[];
}) {
  return [
    "你是小说写作助手。现在要把“同一个角色”被拆分成的多个【角色画像条目】合并为一个。",
    "",
    "请严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    "输出 JSON schema：",
    JSON.stringify(
      {
        merged: {
          name: input.primaryName,
          role: "主角/配角/反派等（可空）",
          tags: ["标签（可空，最多 30）"],
          state: { "任意字段": "任意值（可空对象）" },
          socialTags: { profession: "职业", class: "阶级", titles: ["头衔"], other: ["其他标签"] },
          historicalDebts: ["历史债（可空）"],
          occurredNotes: ["发生过的事情（可空）"],
          narrativeDrives: {
            want: "想要",
            need: "需要",
            moralCompass: "道德罗盘",
            flaws: ["缺点"],
            blindSpots: ["认知盲点"]
          },
          fingerprints: {
            linguisticStyle: ["句式/语气特征"],
            catchphrases: ["口头禅"],
            mannerisms: ["标志性动作"],
            mask: [{ context: "在何场景", persona: "面具/人设" }]
          },
          relationalHooks: {
            relations: [
              {
                targetName: "对方角色名（必须是字符串）",
                types: ["可选标签"],
                emotionalPolarity: "情感倾向",
                conflictIndex: "冲突点",
                sharedSecrets: ["共享秘密"]
              }
            ],
            freeText: "兜底自由文本"
          },
          personalityAnalysis: "性格分析（可空）"
        }
      },
      null,
      2
    ),
    "",
    "合并规则：",
    "- name 必须等于主角色名。",
    "- 去重融合：同义信息合并为更清晰、更稳定的一份，不要把冲突信息都堆叠；不确定的可以留空。",
    "- tags 最多 30 个。",
    "- relations.targetName 若出现“被合并角色名”，请改为主角色名。",
    "",
    "主角色条目（primary）：",
    JSON.stringify(input.primaryProfile || {}, null, 2),
    "",
    "待合并条目（secondary list）：",
    JSON.stringify(input.secondaryProfiles || [], null, 2),
    "",
    "现在输出 JSON："
  ].join("\n");
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
  const timeoutMs = 90_000;
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
      ? `AI SDK：JSON阶段超时（>${Math.floor(timeoutMs / 1000)}s），已中断。请检查模型服务/网络/限流。`
      : `AI SDK：JSON阶段失败：${e?.message || String(e)}`;
    emitLog(msg);
    throw e;
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

function buildTimelineUpdatePrompt(input: {
  bookSlug: string;
  recentChapterSummaries: Array<{ chapter: number; title: string; gistL1: string }>;
  compressedRanges: Array<{ startChapter: number; endChapter: number; summary: string }>;
  doneEventIds: string[];
  closedLoops: any[];
}) {
  return [
    "你是小说写作助手，负责维护「时间线 Timeline」与「压缩摘要」索引。",
    "你会收到：最近若干章的摘要（gistL1）、已存在的压缩区间摘要、以及已完成事件列表。",
    "",
    "任务：",
    "1) 给出 1-3 个「推荐压缩章节区间」：例如 3-7 章，并说明 why（简短）。",
    "2) （可选）给出少量关键事件 events（用于时间线），但**不要重复已完成事件**；无法确定可输出空数组。",
    "",
    "严格输出 JSON，不要解释、不要 markdown、不要代码块。JSON schema：",
    JSON.stringify(
      {
        compressionSuggestions: [{ startChapter: 3, endChapter: 7, why: "为什么适合压缩（不超过 40 字）" }],
        events: [
          {
            id: "evt-xxx（可选）",
            title: "事件标题",
            startChapter: 3,
            endChapter: 3,
            summary: "事件摘要（不超过 80 字）",
            status: "open"
          }
        ]
      },
      null,
      2
    ),
    "",
    "输入（recentChapterSummaries）：",
    JSON.stringify(input.recentChapterSummaries, null, 2),
    "",
    "输入（compressedRanges）：",
    JSON.stringify(input.compressedRanges, null, 2),
    "",
    "输入（doneEventIds）：",
    JSON.stringify(input.doneEventIds, null, 2),
    "",
    "输入（closedLoops）：",
    JSON.stringify(input.closedLoops, null, 2)
  ].join("\n");
}

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
  const idx = normalizeTimelineIndex(await readTimelineIndex(dataDir, slug));
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
  await writeTimelineIndex(dataDir, slug, idx);
  await writeStoryTimelineMarkdownFromIndex(dataDir, slug, idx);
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
    const raw = await readChapter(dataDir, slug, filename);
    const normalized = String(raw || "").replace(/\r/g, "");
    const hash = crypto.createHash("sha1").update(normalized, "utf8").digest("hex");
    run.source = { contentHash: hash, contentLength: normalized.length };
    // 若模型输出的 wordCount 不可靠，至少确保存在
    if (!Number.isFinite(Number(run?.chapter?.wordCount))) run.chapter.wordCount = normalized.length;
  } catch {
    // ignore: 不阻断审计落盘
  }

  await writeAuditRun(dataDir, slug, filename, run);

  const idx = await readAuditCharactersIndex(dataDir, slug);
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
      if (extracted.length) merged.occurredNotes = mergeStrArr(prev?.occurredNotes, extracted);
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
  await writeAuditCharactersIndex(dataDir, slug, idx);

  // 自动抽取地点：全书共享 placesIndex.json
  const placesIdx = await readAuditPlacesIndex(dataDir, slug);
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
  await writeAuditPlacesIndex(dataDir, slug, placesIdx);

  // 自动抽取组织：全书共享 orgsIndex.json
  const orgsIdx = await readAuditOrgsIndex(dataDir, slug);
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
  await writeAuditOrgsIndex(dataDir, slug, orgsIdx);

  const ledger = await readAuditLedger(dataDir, slug);
  ledger.updatedAt = run.chapter.auditedAt;
  ledger.openLoops = ledger.openLoops || [];
  ledger.closedLoops = ledger.closedLoops || [];
  if (run.ledgerUpdates?.openLoops?.length) ledger.openLoops.push(...run.ledgerUpdates.openLoops);
  if (run.ledgerUpdates?.closedLoops?.length) ledger.closedLoops.push(...run.ledgerUpdates.closedLoops);
  await writeAuditLedger(dataDir, slug, ledger);

  // 自动沉淀伏笔：全书共享 foreshadowsIndex.json（来源 ledgerUpdates）
  const foIdx = await readAuditForeshadowsIndex(dataDir, slug);
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
  await writeAuditForeshadowsIndex(dataDir, slug, foIdx);

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

  const chapter = await readChapter(dataDir, slug, filename);
  const { charFiles } = await listStoryFiles(dataDir, slug);
  const knownCharacters = charFiles.map((c) => c.title);

  const thinkingPrompt = buildThinkingPrompt({
    chapterTitle: filename.replace(/\.md$/, ""),
    chapterFilename: filename,
    content: chapter,
    knownCharacters
  });

  const auditPrompt = buildAuditPrompt({
    chapterTitle: filename.replace(/\.md$/, ""),
    chapterFilename: filename,
    content: chapter,
    knownCharacters
  });

  emitPhase(2, "正在思考中...");
  await streamThinkingTraceWithAiSdk({
    cfg,
    prompt: thinkingPrompt,
    onEvent: onEvent ?? (() => {})
  });

  emitPhase(3, "生成结构化审计结果（JSON）");
  const rawJson = await generateAuditJsonWithAiSdk({ cfg, prompt: auditPrompt, onEvent: onEvent ?? (() => {}) });
  const jsonText = stripJsonFence(rawJson);
  emitPhase(4, "解析并保存审计结果");
  const run = await finalizeAuditFromJsonText(slug, filename, jsonText);
  const ledger = await readAuditLedger(dataDir, slug);
  // 每次分析后自动更新时间线索引与推荐压缩区间
  emitPhase(5, "更新全书记忆（时间线/推荐压缩）");
  await updateTimelineIndexAfterAudit({ cfg, slug, filename, run, ledger }).catch(() => {});
  await updateProgressIndexAfterAudit({ cfg, slug, filename, run }).catch(() => {});
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
  const prompt = [
    "你是一位中文小说编辑。请对下面的章节正文进行润色：",
    "- 不改变剧情事实与信息顺序（不加戏、不删关键事件）",
    "- 保留人名/地名/专有名词一致",
    "- 优化语病、重复、节奏与描写，增强可读性",
    "- 输出只要润色后的正文，不要解释、不要加标题",
    "",
    "【原文】",
    original || "",
    ""
  ].join("\n");

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

function buildProgressIndexPrompt(input: {
  chapter: { filename: string; title: string; chapterNo: number | null; auditedAt: string };
  auditRun: any;
  prevIndex: any;
}) {
  return [
    "你是小说写作助手。现在要维护一份“进行中事项清单”，只记录还在推进中的线索/冲突/待办，不要记录已完成的事。",
    "同时，请先给出一段“当前正在进行的事情（总述）”，用 3~8 句概括全书目前最主要的推进与悬念（不要写已完结事项）。",
    "",
    "请严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    "输出 schema：",
    JSON.stringify(
      {
        summary: "当前正在进行的事情（总述，3~8句）",
        lastSourceChapter: { filename: input.chapter.filename, chapterNo: input.chapter.chapterNo ?? undefined, title: input.chapter.title },
        items: [
          {
            id: "稳定 id（尽量沿用旧的；新建时可留空，服务端会生成）",
            title: "一句话描述正在进行的事项（必填）",
            detail: "可选：更具体的推进/当前状态/下一步",
            status: "open|progress|done（done 表示已完成，将不会展示）",
            priority: "1|2|3（1最高，可选）",
            related: {
              characters: ["相关角色名（可选）"],
              places: ["相关地点名（可选）"],
              orgs: ["相关组织名（可选）"],
              chapters: ["相关章节号（可选）"]
            }
          }
        ]
      },
      null,
      2
    ),
    "",
    "规则：",
    "- 只维护与“当前仍在进行中”的事项；已完成的标记 done 或从 items 移除。",
    "- 与旧 items 表达同一件事的，必须复用/更新旧条目（避免重复）。",
    "- summary 必须只包含“仍在进行中”的主线推进与悬念，不要写已经解决的结果。",
    "- title 要简短清晰，detail 可写推进与下一步（避免冗长）。",
    "- items 数量控制在 5~20 条，优先保留最重要的。",
    "",
    "当前章节信息：",
    JSON.stringify(input.chapter, null, 2),
    "",
    "本次审计结果（摘要/实体/影响/一致性/伏笔更新等）：",
    JSON.stringify(input.auditRun || {}, null, 2),
    "",
    "旧的 progressIndex（用于续写/去重/更新状态）：",
    JSON.stringify(input.prevIndex || {}, null, 2),
    "",
    "现在输出 JSON："
  ].join("\n");
}

async function updateProgressIndexAfterAudit(input: { cfg: ModelConfig; slug: string; filename: string; run: any }) {
  const { cfg, slug, filename, run } = input;
  const prev = await readAuditProgressIndex(dataDir, slug);
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

  await writeAuditProgressIndex(dataDir, slug, next as any);
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

  const idx = normalizeTimelineIndex(await readTimelineIndex(dataDir, slug));
  const compressed = (idx.compressedRanges || [])
    .slice()
    .sort((a, b) => (a.startChapter ?? 0) - (b.startChapter ?? 0))
    .slice(-20)
    .map((r) => `第${r.startChapter}-${r.endChapter}章：${String(r.summary || "").trim()}`)
    .filter((s) => s.length > 0);

  const prompt = [
    "你是一位中文小说写作助手。请在不改变剧情事实与信息顺序的前提下，对下面的章节正文进行扩写。",
    "要求：",
    `- 目标字数：约 ${Math.max(200, Math.floor(targetWords))} 字（允许 ±10%）`,
    "- 保留人名/地名/专有名词一致；不加戏、不引入新设定；不改变叙事视角",
    "- 扩写方式：补充环境氛围、动作细节、心理活动、对话节奏、过渡段落，但不要啰嗦重复",
    "- 输出只要扩写后的正文，不要解释、不要加标题",
    "",
    "【已发生的事情（时间线压缩摘要）】",
    compressed.length ? compressed.join("\n") : "（暂无）",
    "",
    extraContext?.trim() ? "【补充信息（当前发生的事情）】\n" + extraContext.trim() : "",
    extraContext?.trim() ? "" : "",
    "【原文】",
    original || "",
    ""
  ]
    .filter((x) => x !== "")
    .join("\n");

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

  const chapter = await readChapter(dataDir, slug, filename);
  const { charFiles } = await listStoryFiles(dataDir, slug);
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
  return { ok: true, dataDir };
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

// 新路由：books（与目录结构一致）
app.get("/api/books", async () => {
  const novels = await listNovels(dataDir);
  return { books: novels };
});

app.post("/api/books", async (req, reply) => {
  const bodySchema = z.object({
    title: z.string().min(1),
    slug: z.string().optional(),
    synopsis: z.string().max(20000).optional()
  });
  const body = bodySchema.parse((req as any).body);
  const slug = safeSlug(body.slug?.trim() || body.title);
  if (!slug) return reply.code(400).send({ message: "Invalid slug/title" });

  try {
    const meta = await createNovel(dataDir, slug, body.title, body.synopsis);
    return { book: novelSummaryFromMeta(meta, 0, []) };
  } catch (e: any) {
    return reply.code(409).send({ message: e?.message || "Conflict" });
  }
});

app.get("/api/books/:slug", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const books = await listNovels(dataDir);
  const book = books.find((b: any) => String(b?.slug || "").trim() === params.slug);
  if (!book) return reply.code(404).send({ message: "Not found" });
  return { book };
});

app.patch("/api/books/:slug", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    synopsis: z.string().max(20000).optional(),
    completed: z.boolean().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    let book: any = null;
    if (body.synopsis !== undefined) {
      book = await updateNovelSynopsis(dataDir, params.slug, body.synopsis);
    }
    if (body.completed !== undefined) {
      book = await updateNovelCompleted(dataDir, params.slug, body.completed);
    }
    if (!book) return reply.code(400).send({ message: "No-op" });
    return { book };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.delete("/api/books/:slug", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  try {
    await deleteNovel(dataDir, params.slug);
    return { ok: true };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.post("/api/books/:slug/restore", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  try {
    await restoreNovel(dataDir, params.slug);
    return { ok: true };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.get("/api/books/:slug/chapters", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const chapters = await listChapters(dataDir, params.slug);
  return { chapters };
});

app.post("/api/books/:slug/chapters", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    chapterIndex: z.number().int().min(1).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const chapter = await createChapter(dataDir, params.slug, body.title, body.content, body.chapterIndex);
  return { chapter };
});

app.get("/api/books/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    const content = await readChapter(dataDir, params.slug, params.filename);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/books/:slug/chapters/:filename", async (req) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    content: z.string()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateChapter(dataDir, params.slug, params.filename, body.content);
  return { ok: true };
});

app.patch("/api/books/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    title: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const chapter = await renameChapterTitle(dataDir, params.slug, params.filename, body.title);
    return { chapter };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Rename failed" });
  }
});

app.delete("/api/books/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    await deleteChapter(dataDir, params.slug, params.filename);
    return { ok: true };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Delete failed" });
  }
});

app.get("/api/books/:slug/story", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const { storyFiles, charFiles } = await listStoryFiles(dataDir, params.slug);
  return { storyFiles, charFiles };
});

app.post("/api/books/:slug/story/characters", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    name: z.string().min(1),
    role: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).max(30).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const out = await createCharacterCard(dataDir, params.slug, body.name, { role: body.role, tags: body.tags });
    return { character: out };
  } catch (e: any) {
    return reply.code(409).send({ message: e?.message || "Conflict" });
  }
});

app.get("/api/books/:slug/story/file", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const querySchema = z.object({ path: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.parse((req as any).query);
  try {
    const content = await readStoryFile(dataDir, params.slug, query.path);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/books/:slug/story/file", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ path: z.string().min(1), content: z.string() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateStoryFile(dataDir, params.slug, body.path, body.content);
  return { ok: true };
});

app.post("/api/books/:slug/story/characters/merge", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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
    const primaryContent = await readStoryFile(dataDir, params.slug, body.primaryPath);
    const primaryTitle = path.basename(body.primaryPath).replace(/\.md$/, "");
    const secondaryCards: Array<{ path: string; title: string; content: string }> = [];
    for (const p of secondary) {
      const c = await readStoryFile(dataDir, params.slug, p);
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
    await updateStoryFile(dataDir, params.slug, body.primaryPath, mergedTrim.endsWith("\n") ? mergedTrim : `${mergedTrim}\n`);

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const mergedDirRel = "story/characters/_merged";
    const mergedDirAbs = path.join(dataDir, params.slug, mergedDirRel);
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
      const srcAbs = path.join(dataDir, params.slug, card.path);
      const destAbs = await allocDest(path.basename(card.path));
      await fs.rename(srcAbs, destAbs);
    }

    const { charFiles } = await listStoryFiles(dataDir, params.slug);
    return { ok: true, charFiles };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:slug/chapters/:filename/audit", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({ modelConfigId: z.string().nullable().optional() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  try {
    // 非流式：仍走原逻辑（兼容旧行为）
    const run = await performAudit(params.slug, params.filename, body.modelConfigId);
    return { run };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:slug/chapters/:filename/audit/stream", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
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
      slug: params.slug,
      filename: params.filename,
      modelConfigId: body.modelConfigId,
      onEvent: (e) => {
        if (e.type === "reasoning") sseWrite(reply.raw, e);
        if (e.type === "log") sseWrite(reply.raw, e);
        if (e.type === "phase") sseWrite(reply.raw, e);
      }
    });
    sseWrite(reply.raw, { type: "done", run });
  } catch (e: any) {
    sseWrite(reply.raw, { type: "error", message: e?.message || String(e) });
  } finally {
    reply.raw.end();
  }
});

app.post("/api/books/:slug/chapters/:filename/polish/stream", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
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
    sseWrite(reply.raw, { type: "log", text: "开始润色…\n" });
    const { text } = await performPolishWithAiSdk({
      slug: params.slug,
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

app.post("/api/books/:slug/chapters/:filename/expand/stream", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
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
    sseWrite(reply.raw, { type: "log", text: "开始扩写…\n" });
    const { text } = await performExpandWithAiSdk({
      slug: params.slug,
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

app.get("/api/books/:slug/audit/latest", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const querySchema = z.object({ chapter: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.parse((req as any).query);
  try {
    const run = await readAuditRun(dataDir, params.slug, query.chapter);
    if (!run) return reply.code(404).send({ message: "Not found" });
    return { run };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.get("/api/books/:slug/audit/analysis", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const querySchema = z.object({ chapter: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.parse((req as any).query);
  try {
    const text = await readAuditAnalysisText(dataDir, params.slug, query.chapter);
    return { text };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:slug/audit/analysis/save", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ chapter: z.string().min(1), text: z.string().default("") });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    await writeAuditAnalysisText(dataDir, params.slug, body.chapter, body.text || "");
    return { ok: true };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.get("/api/books/:slug/audit/ledger", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const ledger = await readAuditLedger(dataDir, params.slug);
  return { ledger };
});

app.get("/api/books/:slug/audit/characters", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditCharactersIndex(dataDir, params.slug);
  return { index: idx };
});

app.post("/api/books/:slug/audit/characters/hide", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ name: z.string().min(1), hidden: z.boolean() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const idx = await readAuditCharactersIndex(dataDir, params.slug);
  const set = new Set((idx.hiddenNames || []).map((x: any) => String(x)));
  const name = body.name.trim();
  if (body.hidden) set.add(name);
  else set.delete(name);
  idx.hiddenNames = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeAuditCharactersIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/audit/characters/update", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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

  const idx = await readAuditCharactersIndex(dataDir, params.slug);
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
    occurredNotes: body.occurredNotes !== undefined ? mergeStrArr(prev.occurredNotes, body.occurredNotes) : prev.occurredNotes,
    personalityAnalysis:
      body.personalityAnalysis !== undefined ? body.personalityAnalysis : prev.personalityAnalysis,
    updatedAt: now
  };
  idx.updatedAt = now;
  await writeAuditCharactersIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/audit/characters/merge", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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

  const idx = await readAuditCharactersIndex(dataDir, params.slug);
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
      occurredNotes: mergeStrArr(primary.occurredNotes, secondary.occurredNotes),
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
  await writeAuditCharactersIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx, mergedNames: secondaryNames };
});

app.post("/api/books/:slug/audit/characters/merge/preview", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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

    const idx = await readAuditCharactersIndex(dataDir, params.slug);
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

app.post("/api/books/:slug/audit/characters/merge/apply", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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

  const idx = await readAuditCharactersIndex(dataDir, params.slug);
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
  await writeAuditCharactersIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.get("/api/books/:slug/audit/places", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditPlacesIndex(dataDir, params.slug);
  return { index: idx };
});

app.post("/api/books/:slug/audit/places/hide", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ name: z.string().min(1), hidden: z.boolean() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditPlacesIndex(dataDir, params.slug);
  const set = new Set((idx.hiddenNames || []).map((x: any) => String(x)));
  const name = body.name.trim();
  if (body.hidden) set.add(name);
  else set.delete(name);
  idx.hiddenNames = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeAuditPlacesIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/audit/places/update", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    lastNote: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditPlacesIndex(dataDir, params.slug);
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
  await writeAuditPlacesIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/audit/places/merge/preview", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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

    const idx = await readAuditPlacesIndex(dataDir, params.slug);
    const places = Array.isArray(idx.places) ? idx.places : [];
    const primary = places.find((p: any) => String(p?.name || "").trim() === primaryName);
    const secondary = secondaryNames
      .map((n) => places.find((p: any) => String(p?.name || "").trim() === n))
      .filter(Boolean);
    if (!primary || secondary.length !== secondaryNames.length) return reply.code(404).send({ message: "地点不存在" });

    const prompt = [
      "你是小说写作助手。现在要把“同一个地点”被拆分成的多个【地点条目】合并为一个。",
      "",
      "请严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
      "输出 JSON schema：",
      JSON.stringify(
        {
          merged: {
            name: primaryName,
            description: "地点描述（可空）",
            lastNote: "发生的事简述（可空）",
            group: "可选分组名（可空）"
          }
        },
        null,
        2
      ),
      "",
      "合并规则：",
      "- name 必须等于主地点名。",
      "- 对 description/lastNote 去重融合，不要机械拼接重复句。",
      "- 如果 group 缺失，可根据地名推断一个大类（例如“青石村”）。",
      "",
      "主地点条目（primary）：",
      JSON.stringify(primary || {}, null, 2),
      "",
      "待合并条目（secondary list）：",
      JSON.stringify(secondary || [], null, 2),
      "",
      "现在输出 JSON："
    ].join("\n");

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

app.post("/api/books/:slug/audit/places/merge/apply", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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

  const idx = await readAuditPlacesIndex(dataDir, params.slug);
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
  await writeAuditPlacesIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.get("/api/books/:slug/audit/orgs", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditOrgsIndex(dataDir, params.slug);
  return { index: idx };
});

app.post("/api/books/:slug/audit/orgs/hide", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ name: z.string().min(1), hidden: z.boolean() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditOrgsIndex(dataDir, params.slug);
  const set = new Set((idx.hiddenNames || []).map((x: any) => String(x)));
  const name = body.name.trim();
  if (body.hidden) set.add(name);
  else set.delete(name);
  idx.hiddenNames = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeAuditOrgsIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/audit/orgs/update", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    lastNote: z.string().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditOrgsIndex(dataDir, params.slug);
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
  await writeAuditOrgsIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.get("/api/books/:slug/audit/foreshadows", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditForeshadowsIndex(dataDir, params.slug);
  return { index: idx };
});

app.get("/api/books/:slug/audit/progress", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditProgressIndex(dataDir, params.slug);
  return { index: idx };
});

app.post("/api/books/:slug/audit/progress/mark", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ id: z.string().min(1), status: z.enum(["open", "progress", "done"]) });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditProgressIndex(dataDir, params.slug);
  const id = body.id.trim();
  const i = (idx.items || []).findIndex((x: any) => String(x?.id || "").trim() === id);
  if (i < 0) return reply.code(404).send({ message: "事项不存在" });
  const now = new Date().toISOString();
  const prev = idx.items[i] || {};
  idx.items[i] = { ...prev, id, status: body.status, updatedAt: now };
  idx.updatedAt = now;
  await writeAuditProgressIndex(dataDir, params.slug, idx as any);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/audit/progress/cleanupDone", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readAuditProgressIndex(dataDir, params.slug);
  const now = new Date().toISOString();
  idx.items = (idx.items || []).filter((x: any) => String(x?.status || "") !== "done");
  idx.updatedAt = now;
  await writeAuditProgressIndex(dataDir, params.slug, idx as any);
  return { ok: true, index: idx };
});

app.get("/api/books/:slug/writing-pack", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const querySchema = z.object({ chapter: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.safeParse((req as any).query);
  if (!query.success) return reply.code(400).send({ message: "缺少 chapter" });
  const chapterFilename = query.data.chapter.trim();
  const chapterId = chapterFilename.replace(/\.md$/, "");
  const pack = await readWritingPack(dataDir, params.slug, chapterId);
  return { pack };
});

app.post("/api/books/:slug/writing-pack/generate", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    chapterFilename: z.string().min(1),
    modelConfigId: z.string().nullable().optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const chapterFilename = body.chapterFilename.trim();
  const chapterId = chapterFilename.replace(/\.md$/, "");

  try {
    const chapters = await listChapters(dataDir, params.slug);
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
      const run = await readAuditRun(dataDir, params.slug, fn).catch(() => null);
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

    const timelineIndex = await readTimelineIndex(dataDir, params.slug).catch(() => null as any);
    const compressedRanges = Array.isArray(timelineIndex?.compressedRanges)
      ? timelineIndex.compressedRanges.slice(-M)
      : [];

    const progressIndex = await readAuditProgressIndex(dataDir, params.slug).catch(() => ({ items: [] } as any));
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

    const foreshadowsIndex = await readAuditForeshadowsIndex(dataDir, params.slug).catch(() => null as any);
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
    await writeWritingPack(dataDir, params.slug, chapterId, pack);
    return { ok: true, pack };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || String(e) });
  }
});

app.post("/api/books/:slug/chapters/:filename/title/suggest", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
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

    const raw = await readChapter(dataDir, params.slug, params.filename);
    const content = String(raw || "").slice(0, 12000);
    const n = body.count ?? 5;
    const style = body.style ?? "boom";

    const styleGuide: Record<string, string> = {
      normal: "中性、清晰、信息充分，略带网文味。",
      boom: "爆点强、爽感强、冲突感强：更抓眼球，允许更有张力的动词与短语，但不要浮夸堆叠。",
      suspense: "悬疑钩子强、疑问感强：强调信息差、反转、谜团，不要直接揭底。",
      hotblood: "热血燃向：强调逆袭、硬刚、突破、压迫与反击的气势。",
      funny: "轻松幽默：带一点反差和俏皮，但不要网络烂梗、不要太口水。",
      poetic: "文艺质感：更有画面感与意象，但仍要像章节标题，不写散文句。",
      minimal: "极简有力：4~10字优先，短促、干脆、像刀一样。"
    };

    const prompt = [
      "你是网文小说编辑。请根据下面“章节正文”生成多个章节标题候选。",
      `风格：${style}（${styleGuide[style] || styleGuide.boom}）`,
      "",
      "硬性要求：",
      "- 只输出 JSON（不要解释、不要 markdown、不要代码块）。",
      `- 生成 ${n} 个候选标题，放在 titles 数组里。`,
      "- 标题必须是中文为主，简短有力，尽量 8~18 个字，不要书名号，不要句号。",
      "- 标题要有“网文章节点”的味道：更像预告/钩子/名场面，而不是流水账概括。",
      "- 不要捏造本章未出现的关键新设定/新角色。",
      "- 尽量让每个候选标题风格一致但表达角度不同（冲突/反转/目标/代价/人物）。",
      "",
      "输出 schema：",
      JSON.stringify({ titles: new Array(n).fill("标题候选") }, null, 2),
      "",
      "章节正文（可能截断）：",
      content,
      "",
      "现在输出 JSON："
    ].join("\n");

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

app.post("/api/books/:slug/chapters/:filename/title/suggest/batch", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
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

  const styleGuide: Record<string, string> = {
    normal: "中性、清晰、信息充分，略带网文味。",
    boom: "爆点强、爽感强、冲突感强：更抓眼球，允许更有张力的动词与短语，但不要浮夸堆叠。",
    suspense: "悬疑钩子强、疑问感强：强调信息差、反转、谜团，不要直接揭底。",
    hotblood: "热血燃向：强调逆袭、硬刚、突破、压迫与反击的气势。",
    funny: "轻松幽默：带一点反差和俏皮，但不要网络烂梗、不要太口水。",
    poetic: "文艺质感：更有画面感与意象，但仍要像章节标题，不写散文句。",
    minimal: "极简有力：4~10字优先，短促、干脆、像刀一样。"
  };
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

    const raw = await readChapter(dataDir, params.slug, params.filename);
    const content = String(raw || "").slice(0, 12000);
    const n = body.count ?? 5;
    const styles = body.styles?.length
      ? body.styles
      : (["boom", "suspense", "hotblood", "funny", "poetic", "minimal", "normal"] as const);

    const { model, providerOptions } = createAiSdkModel(cfg);

    const results: Array<{ style: string; titles: string[] }> = [];
    for (const style of styles) {
      const prompt = [
        "你是网文小说编辑。请根据下面“章节正文”生成多个章节标题候选。",
        `风格：${style}（${styleGuide[String(style)] || styleGuide.boom}）`,
        "",
        "硬性要求：",
        "- 只输出 JSON（不要解释、不要 markdown、不要代码块）。",
        `- 生成 ${n} 个候选标题，放在 titles 数组里。`,
        "- 标题必须是中文为主，简短有力，尽量 8~18 个字（极简风格可更短），不要书名号，不要句号。",
        "- 标题要有“网文章节点”的味道：更像预告/钩子/名场面，而不是流水账概括。",
        "- 不要捏造本章未出现的关键新设定/新角色。",
        "- 尽量让每个候选标题风格一致但表达角度不同（冲突/反转/目标/代价/人物）。",
        "",
        "输出 schema：",
        JSON.stringify({ titles: new Array(n).fill("标题候选") }, null, 2),
        "",
        "章节正文（可能截断）：",
        content,
        "",
        "现在输出 JSON："
      ].join("\n");

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

app.post("/api/books/:slug/search", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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
    const cache = await buildOrRefreshBookSearchCache(params.slug);
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

app.post("/api/books/:slug/audit/foreshadows/create", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    title: z.string().min(1),
    status: z.enum(["open", "progress", "closed"]).optional(),
    lastProgress: z.string().optional(),
    note: z.string().optional(),
    chapters: z.array(z.number().int().min(1)).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditForeshadowsIndex(dataDir, params.slug);
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
  await writeAuditForeshadowsIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/audit/foreshadows/update", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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
  const idx = await readAuditForeshadowsIndex(dataDir, params.slug);
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
  await writeAuditForeshadowsIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/audit/foreshadows/hide", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ id: z.string().min(1), hidden: z.boolean() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const idx = await readAuditForeshadowsIndex(dataDir, params.slug);
  const set = new Set((idx.hiddenIds || []).map((x: any) => String(x)));
  const id = body.id.trim();
  if (body.hidden) set.add(id);
  else set.delete(id);
  idx.hiddenIds = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeAuditForeshadowsIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.get("/api/books/:slug/timeline/index", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = await readTimelineIndex(dataDir, params.slug);
  return { index: idx };
});

app.post("/api/books/:slug/timeline/event/mark", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ id: z.string().min(1), status: z.enum(["open", "done"]) });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const idx = normalizeTimelineIndex(await readTimelineIndex(dataDir, params.slug));
  const set = new Set(idx.manual?.doneEventIds ?? []);
  if (body.status === "done") set.add(body.id);
  else set.delete(body.id);
  idx.manual.doneEventIds = [...set];
  idx.updatedAt = new Date().toISOString();
  await writeTimelineIndex(dataDir, params.slug, idx);
  await writeStoryTimelineMarkdownFromIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/timeline/compress", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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

  const idx = normalizeTimelineIndex(await readTimelineIndex(dataDir, params.slug));
  const chapters = idx.chapters.filter((c) => c.chapter >= a && c.chapter <= b);
  if (chapters.length === 0) return reply.code(400).send({ message: "该区间没有已分析的章节摘要" });

  const prompt = [
    "你是小说写作助手，负责把多个章节的摘要压缩成一个更高层级的区间摘要。",
    "要求：",
    "- 用中文输出，不要 markdown，不要列表编号，控制在 250-500 字。",
    "- 不要重复已完成事件；如果无法判断完成与否，保持中性描述。",
    "",
    `区间：第 ${a}-${b} 章`,
    "",
    "该区间内每章摘要（gistL1）：",
    JSON.stringify(
      chapters.map((c) => ({ chapter: c.chapter, title: c.title, gistL1: c.gistL1 })),
      null,
      2
    )
  ].join("\n");

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

  await writeTimelineIndex(dataDir, params.slug, idx);
  await writeStoryTimelineMarkdownFromIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/timeline/range/delete", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ startChapter: z.number().int().min(1), endChapter: z.number().int().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const a = Math.min(body.startChapter, body.endChapter);
  const b = Math.max(body.startChapter, body.endChapter);
  const idx = normalizeTimelineIndex(await readTimelineIndex(dataDir, params.slug));

  const before = idx.compressedRanges.length;
  idx.compressedRanges = idx.compressedRanges.filter((r) => !(r.startChapter === a && r.endChapter === b));
  if (idx.compressedRanges.length === before) return reply.code(404).send({ message: "区间不存在" });

  idx.updatedAt = new Date().toISOString();
  await writeTimelineIndex(dataDir, params.slug, idx);
  await writeStoryTimelineMarkdownFromIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

// -----------------------------
// 灵感库（meta/inspiration.json）
// -----------------------------

app.get("/api/books/:slug/inspiration", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = normalizeInspirationIndex(await readInspirationIndex(dataDir, params.slug));
  return { index: idx };
});

app.post("/api/books/:slug/inspiration/upsert", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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

  const idx = normalizeInspirationIndex(await readInspirationIndex(dataDir, params.slug));
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
  await writeInspirationIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx, item: incoming };
});

app.post("/api/books/:slug/inspiration/status", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    id: z.string().min(1),
    status: z.enum(["active", "hidden", "deleted"])
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);

  const idx = normalizeInspirationIndex(await readInspirationIndex(dataDir, params.slug));
  const i = idx.items.findIndex((x) => x.id === body.id);
  if (i < 0) return { ok: false, message: "Not found", index: idx };
  const now = new Date().toISOString();
  idx.items[i] = { ...idx.items[i], status: body.status, updatedAt: now };
  idx.updatedAt = now;
  await writeInspirationIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx };
});

app.post("/api/books/:slug/inspiration/purge", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const idx = normalizeInspirationIndex(await readInspirationIndex(dataDir, params.slug));
  const before = idx.items.length;
  idx.items = idx.items.filter((x) => x.status !== "deleted");
  const purged = before - idx.items.length;
  idx.updatedAt = new Date().toISOString();
  await writeInspirationIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx, purged };
});

app.post("/api/books/:slug/inspiration/generate", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    kind: z.enum(["naming", "character", "place", "org", "item", "other"]),
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
  const memoryText = useMemory ? buildMemoryContextFromTimeline(await readTimelineIndex(dataDir, params.slug)) : "";
  const knownCharacterNames = await listKnownCharacterNames(dataDir, params.slug);
  const knownPlaceNames = await listKnownPlaceNames(dataDir, params.slug);

  const kind = body.kind;
  const opts = body.options ?? {};
  const free = String(body.freeText || "").trim();
  const itemOwnerCharacterName = kind === "item" ? String(body.itemOwnerCharacterName || "").trim() : "";
  const itemOwnerInfo =
    kind === "item" ? await resolveItemOwnerInfo(dataDir, params.slug, itemOwnerCharacterName || undefined) : null;

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

  const idx = normalizeInspirationIndex(await readInspirationIndex(dataDir, params.slug));
  const now = new Date().toISOString();
  const items: IdeaItem[] = [];
  for (const c of cards.slice(0, count)) {
    const content = stringifyInspirationContent(kind === "place" ? "place" : kind === "item" ? "item" : "", c);
    if (!content) continue;
    const it: IdeaItem = {
      id: newId(),
      type: kind === "naming" ? "naming" : "generation",
      subtype:
        kind === "character"
          ? "character"
          : kind === "place"
            ? "place"
            : kind === "org"
              ? "organization"
              : kind === "item"
                ? "item"
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
        ...(kind === "item"
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
  await writeInspirationIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx, items, debug: { prompt, rawText } };
});

app.post("/api/books/:slug/inspiration/generate-preview", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    modelConfigId: z.string().nullable().optional(),
    kind: z.enum(["naming", "character", "place", "org", "item", "other"]),
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
  const memoryText = useMemory ? buildMemoryContextFromTimeline(await readTimelineIndex(dataDir, params.slug)) : "";
  const knownCharacterNames = await listKnownCharacterNames(dataDir, params.slug);
  const knownPlaceNames = await listKnownPlaceNames(dataDir, params.slug);

  const kind = body.kind;
  const opts = body.options ?? {};
  const free = String(body.freeText || "").trim();
  const itemOwnerCharacterName = kind === "item" ? String(body.itemOwnerCharacterName || "").trim() : "";
  const itemOwnerInfo =
    kind === "item" ? await resolveItemOwnerInfo(dataDir, params.slug, itemOwnerCharacterName || undefined) : null;

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
  for (const c of cards.slice(0, count)) {
    const content = stringifyInspirationContent(kind === "place" ? "place" : kind === "item" ? "item" : "", c);
    if (!content) continue;
    items.push({
      id: newId(),
      type: kind === "naming" ? "naming" : "generation",
      subtype:
        kind === "character"
          ? "character"
          : kind === "place"
            ? "place"
            : kind === "org"
              ? "organization"
              : kind === "item"
                ? "item"
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
        ...(kind === "item"
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

app.post("/api/books/:slug/inspiration/variant", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
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

  const idx = normalizeInspirationIndex(await readInspirationIndex(dataDir, params.slug));
  const base = idx.items.find((x) => x.id === body.id);
  if (!base) return reply.code(404).send({ message: "原条目不存在" });

  const count = body.count ?? 3;
  const preset = String(body.preset || "").trim();
  const free = String(body.freeText || "").trim();

  const schemaHint = [
    "请严格输出 JSON 数组（不要解释、不要 markdown、不要代码块）。",
    "数组长度 = count。",
    "每个元素字段：{ title?: string, content: string, tags?: string[] }。",
    "content 是对原内容的改写/变体，不能只是同义句，要体现变体策略。"
  ].join("\n");

  const prompt = [
    "你是网络小说写作助手。现在要对“已有灵感卡”生成多个变体版本。",
    schemaHint,
    "",
    `count = ${count}`,
    preset ? `预设变体选项 preset = ${preset}` : "预设变体选项 preset = （空）",
    free ? `自由输入 freeText = ${free}` : "自由输入 freeText = （空）",
    "",
    "【原卡】",
    `type=${base.type} subtype=${base.subtype || ""} title=${base.title || ""}`,
    base.content,
    "",
    "现在输出 JSON 数组："
  ].join("\n");

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
  await writeInspirationIndex(dataDir, params.slug, idx);
  return { ok: true, index: idx, items, debug: { prompt, rawText } };
});

// 兼容旧路由：novels -> books
app.get("/api/novels", async () => {
  const novels = await listNovels(dataDir);
  return { novels };
});

app.post("/api/novels", async (req, reply) => {
  const bodySchema = z.object({
    title: z.string().min(1),
    slug: z.string().optional(),
    synopsis: z.string().max(20000).optional()
  });
  const body = bodySchema.parse((req as any).body);
  const slug = safeSlug(body.slug?.trim() || body.title);
  if (!slug) return reply.code(400).send({ message: "Invalid slug/title" });

  try {
    const meta = await createNovel(dataDir, slug, body.title, body.synopsis);
    return { novel: novelSummaryFromMeta(meta, 0, []) };
  } catch (e: any) {
    return reply.code(409).send({ message: e?.message || "Conflict" });
  }
});

app.get("/api/novels/:slug/chapters", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const chapters = await listChapters(dataDir, params.slug);
  return { chapters };
});

app.post("/api/novels/:slug/chapters", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    chapterIndex: z.number().int().min(1).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const chapter = await createChapter(dataDir, params.slug, body.title, body.content, body.chapterIndex);
  return { chapter };
});

app.get("/api/novels/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    const content = await readChapter(dataDir, params.slug, params.filename);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/novels/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    content: z.string()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateChapter(dataDir, params.slug, params.filename, body.content);
  return { ok: true };
});

app.patch("/api/novels/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    title: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const chapter = await renameChapterTitle(dataDir, params.slug, params.filename, body.title);
    return { chapter };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Rename failed" });
  }
});

app.delete("/api/novels/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    await deleteChapter(dataDir, params.slug, params.filename);
    return { ok: true };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Delete failed" });
  }
});

await app.listen({ port: PORT, host: "127.0.0.1" });
