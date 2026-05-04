import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { ollama } from "ollama-ai-provider-v2";
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
  deleteNovel,
  restoreNovel,
  writeAuditRun,
  readAuditRun,
  readAuditLedger,
  writeAuditLedger,
  readAuditCharactersIndex,
  writeAuditCharactersIndex
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
    model = ollama(modelName);
    providerOptions = { ollama: { think: true } };
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
    prompt,
    reasoning: "high",
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
    prompt,
    temperature: 0.2,
    reasoning: "medium",
    providerOptions
  } as any);

  if (!text?.trim()) throw new Error("模型未返回审计 JSON");
  return text;
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
  const existing = new Set((idx.characters || []).map((c: any) => String(c.name)));
  const chars = (run.entities.characters || [])
    .map((c: any) => ({
      name: String(c.name || "").trim(),
      role: c.role,
      tags: c.tags,
      state: c.state,
      updatedAt: run.chapter.auditedAt
    }))
    .filter((c: any) => c.name);
  for (const c of chars) {
    if (!existing.has(c.name)) (idx.characters ||= []).push(c);
  }
  idx.updatedAt = run.chapter.auditedAt;
  await writeAuditCharactersIndex(dataDir, slug, idx);

  const ledger = await readAuditLedger(dataDir, slug);
  ledger.updatedAt = run.chapter.auditedAt;
  ledger.openLoops = ledger.openLoops || [];
  ledger.closedLoops = ledger.closedLoops || [];
  if (run.ledgerUpdates?.openLoops?.length) ledger.openLoops.push(...run.ledgerUpdates.openLoops);
  if (run.ledgerUpdates?.closedLoops?.length) ledger.closedLoops.push(...run.ledgerUpdates.closedLoops);
  await writeAuditLedger(dataDir, slug, ledger);

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
  return await finalizeAuditFromJsonText(slug, filename, jsonText);
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
    synopsis: z.string().max(20000)
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const book = await updateNovelSynopsis(dataDir, params.slug, body.synopsis);
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

