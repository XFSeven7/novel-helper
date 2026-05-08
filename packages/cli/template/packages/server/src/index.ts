import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  createBook,
  bookSummaryFromMeta,
  listBooks,
  listChapters,
  createChapter,
  deleteChapter,
  readChapter,
  renameChapterTitle,
  updateChapter,
  listStoryFiles,
  readStoryFile,
  updateStoryFile,
  createCharacterCard,
  updateBookSynopsis,
  updateBookCompleted,
  deleteBook,
  restoreBook,
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
  WritingPack
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

app.get("/api/health", async () => ({ ok: true, dataDir }));

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
    messages: [{ role: "user", content: prompt }],
    ...(cfg.provider === "ollama" ? {} : { reasoning: "high" as const }),
    providerOptions
  } as any);

  let sawReasoningDelta = false;

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

  const existingI = idx.chapters.findIndex((c) => c.filename === filename);
  const row = { chapter: Number.isFinite(n) ? n : 0, filename, title, auditedAt, gistL1 };
  if (existingI >= 0) idx.chapters[existingI] = row;
  else idx.chapters.push(row);
  idx.chapters.sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));

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

    if (hasVal(next.role)) merged.role = normStr(next.role);
    if (!locks.tags && Array.isArray(next.tags)) merged.tags = mergeStrArr(prev?.tags, next.tags);
    if (next.state && typeof next.state === "object") merged.state = mergeObjNonEmpty(prev?.state, next.state);

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

    if (!locks.historicalDebts && Array.isArray(next.historicalDebts))
      merged.historicalDebts = mergeStrArr(prev?.historicalDebts, next.historicalDebts);

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

    if (!locks.relationalHooks && next.relationalHooks && typeof next.relationalHooks === "object") {
      const rhPrev = prev?.relationalHooks && typeof prev.relationalHooks === "object" ? prev.relationalHooks : {};
      const rhNext = next.relationalHooks as any;
      merged.relationalHooks = {
        ...rhPrev,
        ...(Array.isArray(rhNext.relations) ? { relations: mergeRelations(rhPrev.relations, rhNext.relations) } : null),
        ...(hasVal(rhNext.freeText) ? { freeText: mergeFreeText(rhPrev.freeText, rhNext.freeText) } : null)
      };
    }

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
  placesIdx.places = [...placeExisting.values()].sort((a: any, b: any) =>
    String(a.name).localeCompare(String(b.name), "zh-Hans-CN")
  );
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
      const arr = Array.isArray(f.chapters)
        ? f.chapters.map((n: any) => Math.floor(Number(n))).filter((n: any) => Number.isFinite(n))
        : [];
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
  const rawJson = await generateAuditJsonWithAiSdk({ cfg, prompt: auditPrompt });
  const jsonText = stripJsonFence(rawJson);
  emitPhase(4, "解析并保存审计结果");
  const run = await finalizeAuditFromJsonText(slug, filename, jsonText);
  const ledger = await readAuditLedger(dataDir, slug);
  emitPhase(5, "更新全书记忆（时间线/推荐压缩）");
  await updateTimelineIndexAfterAudit({ cfg, slug, filename, run, ledger }).catch(() => {});
  return run;
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

async function performPolishWithAiSdk(input: {
  slug: string;
  filename: string;
  modelConfigId: string | null | undefined;
  original: string;
  onDelta?: (textDelta: string) => void;
}) {
  const { modelConfigId, onDelta, original } = input;
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
    .join("\\n");

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
          extraHeadersJson: z.string().optional()
        })
      )
      .default([])
  });
  const body = bodySchema.parse((req as any).body);
  await writeModelSettings({ configs: body.configs as any, activeId: body.activeId });
  return { ok: true };
});

app.get("/api/books", async () => {
  const books = await listBooks(dataDir);
  return { books };
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
    const book = await createBook(dataDir, slug, body.title, body.synopsis);
    return { book: bookSummaryFromMeta(book, 0, []) };
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
      book = await updateBookSynopsis(dataDir, params.slug, body.synopsis);
    }
    if (body.completed !== undefined) {
      book = await updateBookCompleted(dataDir, params.slug, body.completed);
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
    await deleteBook(dataDir, params.slug);
    return { ok: true };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.post("/api/books/:slug/restore", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  try {
    await restoreBook(dataDir, params.slug);
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
    chapterIndex: z.number().int().min(1).optional(),
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const chapter = await createChapter(dataDir, params.slug, body.title, body.content, body.chapterIndex);
  return { chapter };
});

app.get("/api/books/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  try {
    const content = await readChapter(dataDir, params.slug, params.filename);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/books/:slug/chapters/:filename", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({ content: z.string() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateChapter(dataDir, params.slug, params.filename, body.content);
  return { ok: true };
});

app.patch("/api/books/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
  const bodySchema = z.object({ title: z.string().min(1) });
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
  const paramsSchema = z.object({ slug: z.string().min(1), filename: z.string().min(1) });
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
    const character = await createCharacterCard(dataDir, params.slug, body.name, { role: body.role, tags: body.tags });
    return { character };
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
    const settings = await readModelSettings();
    const activeId = body.modelConfigId ?? settings.activeId;
    const cfg = settings.configs.find((c) => c.id === activeId) || settings.configs[0];
    if (!cfg) throw new Error("未配置模型");

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
  sseWrite(reply.raw, { type: "log", text: "连接已建立…\\n" });

  try {
    sseWrite(reply.raw, { type: "log", text: "开始扩写…\\n" });
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
  const normMask = (arr: any) =>
    (Array.isArray(arr) ? arr : [])
      .map((it: any) => ({ context: normStr(it?.context), persona: normStr(it?.persona) }))
      .filter((it: any) => it.context || it.persona);
  const normRelations = (arr: any) =>
    (Array.isArray(arr) ? arr : [])
      .map((r: any) => ({
        targetName: normStr(r?.targetName),
        types: Array.isArray(r?.types) ? uniqStrs(r.types) : undefined,
        emotionalPolarity: normStr(r?.emotionalPolarity) || undefined,
        conflictIndex: normStr(r?.conflictIndex) || undefined,
        sharedSecrets: Array.isArray(r?.sharedSecrets) ? uniqStrs(r.sharedSecrets) : undefined
      }))
      .filter((r: any) => r.targetName);

  idx.characters[i] = {
    ...prev,
    name,
    role: body.role !== undefined ? body.role : prev.role,
    tags: body.tags !== undefined ? uniqStrs(body.tags) : prev.tags,
    state: body.state !== undefined ? mergeObjNonEmpty(prev.state, body.state) : prev.state,
    locks: (body as any).locks !== undefined ? (body as any).locks : prev.locks,
    socialTags:
      body.socialTags !== undefined
        ? {
            profession: normStr((body as any).socialTags?.profession) || undefined,
            class: normStr((body as any).socialTags?.class) || undefined,
            titles: Array.isArray((body as any).socialTags?.titles) ? uniqStrs((body as any).socialTags?.titles) : [],
            other: Array.isArray((body as any).socialTags?.other) ? uniqStrs((body as any).socialTags?.other) : []
          }
        : prev.socialTags,
    historicalDebts: body.historicalDebts !== undefined ? uniqStrs(body.historicalDebts) : prev.historicalDebts,
    narrativeDrives:
      body.narrativeDrives !== undefined
        ? {
            want: normStr((body as any).narrativeDrives?.want) || undefined,
            need: normStr((body as any).narrativeDrives?.need) || undefined,
            moralCompass: normStr((body as any).narrativeDrives?.moralCompass) || undefined,
            flaws: Array.isArray((body as any).narrativeDrives?.flaws) ? uniqStrs((body as any).narrativeDrives?.flaws) : [],
            blindSpots: Array.isArray((body as any).narrativeDrives?.blindSpots)
              ? uniqStrs((body as any).narrativeDrives?.blindSpots)
              : []
          }
        : prev.narrativeDrives,
    fingerprints:
      body.fingerprints !== undefined
        ? {
            linguisticStyle: Array.isArray((body as any).fingerprints?.linguisticStyle)
              ? uniqStrs((body as any).fingerprints?.linguisticStyle)
              : [],
            catchphrases: Array.isArray((body as any).fingerprints?.catchphrases) ? uniqStrs((body as any).fingerprints?.catchphrases) : [],
            mannerisms: Array.isArray((body as any).fingerprints?.mannerisms) ? uniqStrs((body as any).fingerprints?.mannerisms) : [],
            mask: normMask((body as any).fingerprints?.mask)
          }
        : prev.fingerprints,
    relationalHooks:
      body.relationalHooks !== undefined
        ? {
            relations: normRelations((body as any).relationalHooks?.relations),
            freeText: normStr((body as any).relationalHooks?.freeText) || undefined
          }
        : prev.relationalHooks,
    occurredNotes: (body as any).occurredNotes !== undefined ? uniqStrs((body as any).occurredNotes) : prev.occurredNotes,
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

    const risks = recentRisks.filter((r) => r.issue).slice(0, 20);
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
          .map((x: any) => ({
            id: String(x?.id || "").trim(),
            title: String(x?.title || "").trim(),
            basis: typeof x?.basis === "string" ? x.basis : undefined
          }))
          .filter((x: any) => x.id && x.title),
        foreshadows: clampList(Array.isArray((parsed as any)?.lists?.foreshadows) ? (parsed as any).lists.foreshadows : [], 2)
          .map((x: any) => ({
            id: String(x?.id || "").trim(),
            title: String(x?.title || "").trim(),
            basis: typeof x?.basis === "string" ? x.basis : undefined
          }))
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

await app.listen({ port: PORT, host: "127.0.0.1" });

