import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertTrainingReady, readFeatureSettings, type ModelConfig } from "../featureSettings.js";
import { isValidCategoryId } from "./categories.js";
import {
  appendCategoryChatTurn,
  clearCategoryChat,
  MAX_TRAINING_CHAT_USER_LEN,
  messagesForModel,
  readCategoryChat
} from "./chatStore.js";
import { performCategoryChat } from "./categoryChat.js";
import { generateTrainingQuestions } from "./generateQuestions.js";
import { parseTrainingGradingMode } from "./gradingModes.js";
import { gradeTrainingAttempt } from "./grade.js";
import { getCategoryWithTeaching } from "./teaching.js";
import {
  buildTrainingTree,
  listAllAttempts,
  listAttemptsByQuestion,
  readAttempt,
  readQuestion,
  saveAttempt
} from "./store.js";

export type TrainingRouteDeps = {
  getDataDir: () => string;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
  sseWrite: (res: unknown, payload: unknown) => void;
};

async function requireTraining(reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const file = await readFeatureSettings();
  const ready = assertTrainingReady(file);
  if ("error" in ready) {
    reply.code(403).send({ message: ready.error });
    return null;
  }
  return { file, cfg: ready.cfg };
}

export function registerTrainingRoutes(app: FastifyInstance, deps: TrainingRouteDeps) {
  app.get("/api/training/tree", async (_req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    return buildTrainingTree(deps.getDataDir());
  });

  app.get("/api/training/categories/:id", async (req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse((req as { params: unknown }).params);
    if (!isValidCategoryId(id)) return reply.code(404).send({ message: "题型不存在" });
    const category = await getCategoryWithTeaching(deps.getDataDir(), id);
    return { category };
  });

  app.get("/api/training/categories/:id/chat", async (req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse((req as { params: unknown }).params);
    if (!isValidCategoryId(id)) return reply.code(404).send({ message: "题型不存在" });
    const chat = await readCategoryChat(deps.getDataDir(), id);
    return { messages: chat.messages };
  });

  app.delete("/api/training/categories/:id/chat", async (req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse((req as { params: unknown }).params);
    if (!isValidCategoryId(id)) return reply.code(404).send({ message: "题型不存在" });
    await clearCategoryChat(deps.getDataDir(), id);
    return { ok: true };
  });

  app.post("/api/training/categories/:id/chat/stream", async (req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse((req as { params: unknown }).params);
    if (!isValidCategoryId(id)) return reply.code(404).send({ message: "题型不存在" });

    const body = z
      .object({
        message: z.string().min(1).max(MAX_TRAINING_CHAT_USER_LEN),
        modelConfigId: z.string().nullable().optional()
      })
      .parse((req as { body: unknown }).body);

    const dataDir = deps.getDataDir();
    const category = await getCategoryWithTeaching(dataDir, id);
    const prior = await readCategoryChat(dataDir, id);

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
    deps.sseWrite(reply.raw, { type: "log", text: "连接已建立…\n" });

    try {
      deps.sseWrite(reply.raw, { type: "log", text: "生成回复…\n" });
      const assistantText = await performCategoryChat({
        createAiSdkModel: deps.createAiSdkModel,
        cfg: ctx.cfg,
        category,
        history: prior.messages,
        userMessage: body.message,
        onDelta: (d) => {
          if (d) deps.sseWrite(reply.raw, { type: "delta", textDelta: d });
        }
      });
      if (!assistantText.trim()) {
        throw new Error("模型未返回有效内容");
      }
      const saved = await appendCategoryChatTurn(dataDir, id, body.message, assistantText);
      deps.sseWrite(reply.raw, { type: "done", assistantText, messages: saved.messages });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      deps.sseWrite(reply.raw, { type: "error", message });
    } finally {
      reply.raw.end();
    }
  });

  app.get("/api/training/questions/:id", async (req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse((req as { params: unknown }).params);
    const q = await readQuestion(deps.getDataDir(), id);
    if (!q) return reply.code(404).send({ message: "题目不存在" });
    return { question: q };
  });

  app.post("/api/training/categories/:id/generate-questions", async (req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse((req as { params: unknown }).params);
    if (!isValidCategoryId(id)) return reply.code(404).send({ message: "题型不存在" });

    const body = z.object({ count: z.union([z.literal(1), z.literal(3), z.literal(5)]) }).parse((req as { body: unknown }).body);

    try {
      const questions = await generateTrainingQuestions(
        { getDataDir: deps.getDataDir, createAiSdkModel: deps.createAiSdkModel, cfg: ctx.cfg },
        { categoryId: id, count: body.count }
      );
      return { questions };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(502).send({ message: `出题失败：${msg}` });
    }
  });

  app.post("/api/training/questions/:id/submit", async (req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse((req as { params: unknown }).params);
    const question = await readQuestion(deps.getDataDir(), id);
    if (!question) return reply.code(404).send({ message: "题目不存在" });

    const body = z
      .object({
        text: z.string().min(1).max(2000),
        gradingMode: z.enum(["infernal", "strict", "honest"]).optional()
      })
      .parse((req as { body: unknown }).body);
    const userText = body.text.trim();
    if (userText.length < question.minChars) {
      return reply.code(400).send({ message: `练习至少 ${question.minChars} 字` });
    }
    if (userText.length > question.maxChars) {
      return reply.code(400).send({ message: `练习超过 ${question.maxChars} 字上限` });
    }

    const gradingMode = parseTrainingGradingMode(body.gradingMode);
    const category = await getCategoryWithTeaching(deps.getDataDir(), question.categoryId);
    let result;
    try {
      result = await gradeTrainingAttempt({
        createAiSdkModel: deps.createAiSdkModel,
        cfg: ctx.cfg,
        category,
        question,
        userText,
        gradingMode
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(502).send({ message: `评改失败：${msg}` });
    }

    const attempt = await saveAttempt(deps.getDataDir(), {
      questionId: question.id,
      categoryId: question.categoryId,
      text: userText,
      result,
      gradingMode,
      modelConfigId: ctx.file.featureModels?.training ?? ctx.cfg.id
    });

    return { attempt, result };
  });

  app.get("/api/training/questions/:id/attempts", async (req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse((req as { params: unknown }).params);
    const question = await readQuestion(deps.getDataDir(), id);
    if (!question) return reply.code(404).send({ message: "题目不存在" });
    const attempts = await listAttemptsByQuestion(deps.getDataDir(), id);
    return { question, attempts };
  });

  app.get("/api/training/attempts", async (_req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const attempts = await listAllAttempts(deps.getDataDir());
    return { attempts };
  });

  app.get("/api/training/attempts/:id", async (req, reply) => {
    const ctx = await requireTraining(reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse((req as { params: unknown }).params);
    const attempt = await readAttempt(deps.getDataDir(), id);
    if (!attempt) return reply.code(404).send({ message: "记录不存在" });
    return { attempt };
  });
}
