import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createNovel, novelSummaryFromMeta } from "../fsStore.js";
import { writeOutlineIndex } from "../outlineStore.js";
import { safeSlug } from "../paths.js";
import {
  appendChatTurn,
  applyBookSetupFromChat,
  assistantMessageForStorage,
  chatBookSetupStep,
  dedupeChatHistory,
  redesignMainlineFromChat,
  suggestBookSetupTitle
} from "./ai.js";
import { findModelConfig } from "../featureSettings.js";
import { discardPlan, listPlans, registerPlan, removePlan } from "./planIndex.js";
import {
  applyBookSetupSuggestionToDraft,
  applyDraftPatch,
  applyMainlineStagesFromSuggestion,
  draftToOutlineIndex,
  isValidStepId,
  listMissingForReview,
  syncDraftToBook
} from "./draft.js";
import { createSession, deleteSession, readSession, writeSession } from "./sessionStore.js";
import type { BookSetupDraft, BookSetupStepId } from "./types.js";

function withDedupedStepMessages(draft: BookSetupDraft): BookSetupDraft {
  const stepMessages = { ...draft.stepMessages };
  for (const key of Object.keys(stepMessages) as BookSetupStepId[]) {
    const list = stepMessages[key];
    if (list?.length) stepMessages[key] = dedupeChatHistory(list);
  }
  return { ...draft, stepMessages };
}
import type { OutlineAiModelConfig } from "../outlineAi.js";

export type BookSetupRouteDeps = {
  getDataDir: () => string;
  readModelSettings: () => Promise<{ configs: OutlineAiModelConfig[]; activeId: string | null }>;
  createAiSdkModel: (cfg: OutlineAiModelConfig) => { model: unknown; providerOptions: unknown };
};

async function syncPlanAfterEdit(
  dataDir: string,
  sessionId: string,
  draft: BookSetupDraft,
  body: { draft?: unknown; currentStep?: string }
) {
  const substantive = Boolean(body.draft) || Boolean(body.currentStep);
  if (!substantive) return;
  await registerPlan(dataDir, sessionId, draft);
}

async function trySyncLinkedBook(
  dataDir: string,
  draft: BookSetupDraft
): Promise<string | undefined> {
  const bookId = draft.linkedBookId?.trim();
  if (!bookId) return undefined;
  try {
    await syncDraftToBook(dataDir, bookId, draft);
    return undefined;
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function afterSessionPersist(
  dataDir: string,
  sessionId: string,
  draft: BookSetupDraft,
  body?: { draft?: unknown; currentStep?: string }
): Promise<{ syncWarning?: string }> {
  const syncWarning = await trySyncLinkedBook(dataDir, draft);
  if (!draft.linkedBookId?.trim() && body) {
    await syncPlanAfterEdit(dataDir, sessionId, draft, body);
  }
  return syncWarning ? { syncWarning } : {};
}

export function registerBookSetupRoutes(app: FastifyInstance, deps: BookSetupRouteDeps) {
  app.get("/api/book-setup/plans", async () => {
    const plans = await listPlans(deps.getDataDir());
    return { plans };
  });

  app.delete("/api/book-setup/plans/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse((req as { params: unknown }).params);
    const draft = await readSession(deps.getDataDir(), params.id);
    if (!draft) {
      await removePlan(deps.getDataDir(), params.id);
      return reply.code(204).send();
    }
    await discardPlan(deps.getDataDir(), params.id);
    return reply.code(204).send();
  });

  app.post("/api/book-setup/sessions", async () => {
    const dataDir = deps.getDataDir();
    const { sessionId, draft } = await createSession(dataDir);
    return { sessionId, draft };
  });

  app.get("/api/book-setup/sessions/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse((req as { params: unknown }).params);
    const draft = await readSession(deps.getDataDir(), params.id);
    if (!draft) return reply.code(404).send({ message: "Session not found or expired" });
    return { draft: withDedupedStepMessages(draft) };
  });

  app.patch("/api/book-setup/sessions/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse((req as { params: unknown }).params);
    const body = z
      .object({
        draft: z.record(z.string(), z.unknown()).optional(),
        currentStep: z.string().optional()
      })
      .parse((req as { body: unknown }).body);

    const existing = await readSession(deps.getDataDir(), params.id);
    if (!existing) return reply.code(404).send({ message: "Session not found or expired" });

    let next = existing;
    if (body.draft) {
      next = applyDraftPatch(existing, body.draft as Partial<BookSetupDraft>);
    }
    if (body.currentStep && isValidStepId(body.currentStep)) {
      next = applyDraftPatch(next, { currentStep: body.currentStep });
    }
    const dataDir = deps.getDataDir();
    const saved = await writeSession(dataDir, params.id, withDedupedStepMessages(next));
    const extra = await afterSessionPersist(dataDir, params.id, saved, body);
    return { draft: saved, ...extra };
  });

  app.post("/api/book-setup/sessions/:id/suggest-title", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse((req as { params: unknown }).params);
    const body = z
      .object({
        modelConfigId: z.string().nullable().optional()
      })
      .optional()
      .parse((req as { body: unknown }).body);

    const dataDir = deps.getDataDir();
    const draft = await readSession(dataDir, params.id);
    if (!draft) return reply.code(404).send({ message: "Session not found or expired" });

    const settings = await deps.readModelSettings();
    const activeId = body?.modelConfigId ?? settings.activeId;
    if (!activeId) {
      return reply.code(400).send({ message: "请先在设置中配置并选择 AI 模型" });
    }
    const cfg = findModelConfig(settings, activeId);
    if (!cfg) return reply.code(400).send({ message: "模型配置不存在" });

    const { title } = await suggestBookSetupTitle({
      draft,
      cfg,
      createAiSdkModel: deps.createAiSdkModel
    });
    const merged = applyDraftPatch(draft, { title });
    const saved = await writeSession(dataDir, params.id, merged);
    const extra = await afterSessionPersist(dataDir, params.id, saved, { draft: merged });
    return { title, draft: saved, ...extra };
  });

  app.post("/api/book-setup/sessions/:id/chat", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse((req as { params: unknown }).params);
    const body = z
      .object({
        stepId: z.string().min(1),
        message: z.string().min(1),
        modelConfigId: z.string().nullable().optional()
      })
      .parse((req as { body: unknown }).body);

    if (!isValidStepId(body.stepId)) {
      return reply.code(400).send({ message: "Invalid stepId" });
    }

    const draft = await readSession(deps.getDataDir(), params.id);
    if (!draft) return reply.code(404).send({ message: "Session not found or expired" });

    const settings = await deps.readModelSettings();
    const activeId = body.modelConfigId ?? settings.activeId;
    if (!activeId) {
      return reply.code(400).send({ message: "请先在设置中配置并选择 AI 模型" });
    }
    const cfg = findModelConfig(settings, activeId);
    if (!cfg) return reply.code(400).send({ message: "模型配置不存在" });

    const chat = await chatBookSetupStep({
      draft,
      stepId: body.stepId as BookSetupStepId,
      message: body.message,
      cfg,
      createAiSdkModel: deps.createAiSdkModel
    });

    const prior = dedupeChatHistory(draft.stepMessages[body.stepId as BookSetupStepId] ?? []);
    const assistantText = assistantMessageForStorage(chat, chat.assistantMessage);
    const history = appendChatTurn(prior, body.message, assistantText);

    let next = applyDraftPatch(draft, {
      stepMessages: { ...draft.stepMessages, [body.stepId]: history },
      nextQuestion: chat.nextQuestion,
      missingFields: chat.missingFields ?? draft.missingFields
    });
    if (body.stepId === "mainline" && chat.suggestion?.mainlineStages !== undefined) {
      next = applyMainlineStagesFromSuggestion(next, chat.suggestion.mainlineStages);
    }
    const dataDir = deps.getDataDir();
    const saved = withDedupedStepMessages(next);
    await writeSession(dataDir, params.id, saved);
    const extra = await afterSessionPersist(dataDir, params.id, saved, { draft: saved });

    return { ...chat, draft: saved, ...extra };
  });

  app.post("/api/book-setup/sessions/:id/apply-step", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse((req as { params: unknown }).params);
    const body = z
      .object({
        stepId: z.string().min(1),
        modelConfigId: z.string().nullable().optional()
      })
      .parse((req as { body: unknown }).body);

    if (!isValidStepId(body.stepId)) {
      return reply.code(400).send({ message: "Invalid stepId" });
    }
    if (body.stepId === "review") {
      return reply.code(400).send({ message: "总览步不支持应用" });
    }

    const draft = await readSession(deps.getDataDir(), params.id);
    if (!draft) return reply.code(404).send({ message: "Session not found or expired" });

    const settings = await deps.readModelSettings();
    const activeId = body.modelConfigId ?? settings.activeId;
    if (!activeId) {
      return reply.code(400).send({ message: "请先在设置中配置并选择 AI 模型" });
    }
    const cfg = findModelConfig(settings, activeId);
    if (!cfg) return reply.code(400).send({ message: "模型配置不存在" });

    let result = await applyBookSetupFromChat({
      draft,
      stepId: body.stepId as BookSetupStepId,
      cfg,
      createAiSdkModel: deps.createAiSdkModel
    });

    let merged = draft;
    if (result.suggestion && Object.keys(result.suggestion).length > 0) {
      merged = applyBookSetupSuggestionToDraft(draft, body.stepId as BookSetupStepId, result.suggestion);
      merged = withDedupedStepMessages(merged);
      const dataDir = deps.getDataDir();
      await writeSession(dataDir, params.id, merged);
      const extra = await afterSessionPersist(dataDir, params.id, merged, { draft: merged });
      result = { ...result, draft: merged, ...extra };
    }

    return result;
  });

  app.post("/api/book-setup/sessions/:id/redesign-mainline", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse((req as { params: unknown }).params);
    const body = z
      .object({
        modelConfigId: z.string().nullable().optional()
      })
      .optional()
      .parse((req as { body: unknown }).body);

    const draft = await readSession(deps.getDataDir(), params.id);
    if (!draft) return reply.code(404).send({ message: "Session not found or expired" });

    const settings = await deps.readModelSettings();
    const activeId = body?.modelConfigId ?? settings.activeId;
    if (!activeId) {
      return reply.code(400).send({ message: "请先在设置中配置并选择 AI 模型" });
    }
    const cfg = findModelConfig(settings, activeId);
    if (!cfg) return reply.code(400).send({ message: "模型配置不存在" });

    let result = await redesignMainlineFromChat({
      draft,
      cfg,
      createAiSdkModel: deps.createAiSdkModel
    });

    if (result.suggestion?.mainlineStages === undefined) {
      return reply.code(422).send({
        message: result.assistantMessage || "未能生成新的主线阶段，请继续对话后重试"
      });
    }

    let merged = applyBookSetupSuggestionToDraft(draft, "mainline", result.suggestion);
    const prior = dedupeChatHistory(draft.stepMessages.mainline ?? []);
    const assistantText = assistantMessageForStorage(
      result,
      `【已重新整理主线阶段】\n${result.assistantMessage}`
    );
    const stepHistory = appendChatTurn(prior, "（重新整理主线阶段）", assistantText);
    merged = applyDraftPatch(merged, {
      stepMessages: { ...merged.stepMessages, mainline: stepHistory }
    });
    merged = withDedupedStepMessages(merged);
    const dataDir = deps.getDataDir();
    await writeSession(dataDir, params.id, merged);
    const extra = await afterSessionPersist(dataDir, params.id, merged, { draft: merged });
    result = { ...result, draft: merged, ...extra };

    return result;
  });

  app.post("/api/book-setup/sessions/:id/commit", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse((req as { params: unknown }).params);
    const body = z
      .object({
        title: z.string().min(1).optional(),
        slug: z.string().optional()
      })
      .optional()
      .parse((req as { body: unknown }).body);

    const draft = await readSession(deps.getDataDir(), params.id);
    if (!draft) return reply.code(404).send({ message: "Session not found or expired" });

    if (draft.linkedBookId?.trim()) {
      return reply.code(400).send({ message: "本书已创建，修改将自动同步" });
    }

    const title = (body?.title ?? draft.title)?.trim();
    if (!title) return reply.code(400).send({ message: "书名不能为空" });

    const merged = applyDraftPatch(draft, {
      title,
      slug: body?.slug?.trim() || draft.slug
    });
    if (!merged.readyToCreate) {
      return reply.code(400).send({
        message: "草案尚未满足创建条件",
        missing: listMissingForReview(merged)
      });
    }

    const displaySlug = safeSlug(merged.slug?.trim() || title) || undefined;
    const bookId = crypto.randomUUID();
    const dataDir = deps.getDataDir();
    const metaSynopsis = merged.metaSynopsis?.trim() || merged.concept?.trim() || "";

    try {
      const meta = await createNovel(dataDir, bookId, title, metaSynopsis || undefined, {
        slug: displaySlug,
        setupSessionId: params.id
      });
      const outline = draftToOutlineIndex(merged);
      await writeOutlineIndex(dataDir, bookId, outline);
      const archived = applyDraftPatch(merged, { linkedBookId: bookId });
      await writeSession(dataDir, params.id, archived);
      await removePlan(dataDir, params.id);
      const book = novelSummaryFromMeta(meta, 0, []);
      return { book, bookId };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/already exists|Conflict/i.test(msg)) {
        return reply.code(409).send({ message: `书籍已存在: ${bookId}` });
      }
      return reply.code(500).send({ message: msg });
    }
  });

  app.delete("/api/book-setup/sessions/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse((req as { params: unknown }).params);
    const dataDir = deps.getDataDir();
    await removePlan(dataDir, params.id);
    await deleteSession(dataDir, params.id);
    return reply.code(204).send();
  });
}
