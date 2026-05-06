import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
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
  readTimelineIndex,
  writeTimelineIndex,
  writeStoryTimelineMarkdownFromIndex,
  TimelineIndex
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

function buildAuditPrompt(input: {
  chapterTitle: string;
  chapterFilename: string;
  content: string;
  knownCharacters: string[];
}) {
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

  emitLog("AI SDK：开始流式输出思考过程…");
  const result = await streamText({
    model,
    // 用 messages 走 chat/completions 流式；Ollama 的流式输出更稳定
    messages: [{ role: "user", content: prompt }],
    ...(cfg.provider === "ollama" ? {} : { reasoning: "high" as const }),
    providerOptions
  } as any);

  let sawReasoningDelta = false;

  // 同步消费 fullStream：reasoning（若有）与正文增量并行到达，避免“先读完流再等 textStream”导致一次性输出
  for await (const part of result.fullStream as any) {
    if (part.type === "reasoning" && typeof part.textDelta === "string" && part.textDelta) {
      if (looksLikeAuditJsonFragment(part.textDelta)) {
        if (!warnedAuditJsonAsThinking) {
          warnedAuditJsonAsThinking = true;
          emitLog("提示：模型在「思考」通道输出了疑似审计 JSON，已忽略该片段（JSON 将在第二阶段静默生成）。");
        }
        continue;
      }
      sawReasoningDelta = true;
      onEvent({ type: "reasoning", textDelta: part.textDelta });
      continue;
    }
    if (part.type === "text-delta" && typeof part.textDelta === "string" && part.textDelta) {
      // 没有原生 reasoning 时，把正文增量当作“可展示思考”
      if (!sawReasoningDelta) {
        if (looksLikeAuditJsonFragment(part.textDelta)) {
          if (!warnedAuditJsonAsThinking) {
            warnedAuditJsonAsThinking = true;
            emitLog("提示：模型在「思考」通道输出了疑似审计 JSON，已忽略该片段（JSON 将在第二阶段静默生成）。");
          }
        } else {
          onEvent({ type: "reasoning", textDelta: part.textDelta });
        }
      }
      continue;
    }
    if (part.type === "error") {
      throw new Error(part.error?.message || "模型调用失败");
    }
  }

  // 兜底：极少数 provider 可能只在结束时聚合出 text（但仍应尽量走上面的增量）
  if (!sawReasoningDelta) {
    try {
      const t = await (result as any).text;
      if (typeof t === "string" && t.trim()) {
        if (looksLikeAuditJsonFragment(t)) {
          emitLog("提示：思考阶段聚合文本疑似审计 JSON，已跳过展示。");
        } else {
          onEvent({ type: "reasoning", textDelta: t });
        }
      }
    } catch {
      // ignore
    }
  }
}

/** 第二步：静默生成审计 JSON（不透传到 UI）。 */
async function generateAuditJsonWithAiSdk(input: { cfg: ModelConfig; prompt: string }): Promise<string> {
  const { cfg, prompt } = input;
  const { model, providerOptions } = createAiSdkModel(cfg);

  const { text } = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    ...(cfg.provider === "ollama" ? {} : { reasoning: "medium" as const }),
    providerOptions
  } as any);

  if (!text?.trim()) throw new Error("模型未返回审计 JSON");
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

    // 基础字段
    if (hasVal(next.role)) merged.role = normStr(next.role);
    if (Array.isArray(next.tags)) merged.tags = mergeStrArr(prev?.tags, next.tags);

    // 状态 / 业力账本
    if (next.state && typeof next.state === "object") merged.state = mergeObjNonEmpty(prev?.state, next.state);

    // 社会身份标签
    if (next.socialTags && typeof next.socialTags === "object") {
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
    if (Array.isArray(next.historicalDebts)) merged.historicalDebts = mergeStrArr(prev?.historicalDebts, next.historicalDebts);

    // 发生过的事情：从本章事件按 participants 命中自动抽取（增量 + 去重）
    {
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
    if (next.narrativeDrives && typeof next.narrativeDrives === "object") {
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
    if (next.fingerprints && typeof next.fingerprints === "object") {
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
    if (next.relationalHooks && typeof next.relationalHooks === "object") {
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

  await streamThinkingTraceWithAiSdk({
    cfg,
    prompt: thinkingPrompt,
    onEvent: onEvent ?? (() => {})
  });

  const rawJson = await generateAuditJsonWithAiSdk({ cfg, prompt: auditPrompt });
  const jsonText = stripJsonFence(rawJson);
  const run = await finalizeAuditFromJsonText(slug, filename, jsonText);
  const ledger = await readAuditLedger(dataDir, slug);
  // 每次分析后自动更新时间线索引与推荐压缩区间
  await updateTimelineIndexAfterAudit({ cfg, slug, filename, run, ledger }).catch(() => {});
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

