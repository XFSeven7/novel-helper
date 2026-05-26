import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  assertReaderCommentsReady,
  normalizeReaderCommentsOptions,
  readFeatureSettings,
  writeFeatureSettings,
  type FeatureSettingsFile,
  type ModelConfig
} from "../featureSettings.js";
import { validateCommentsPerChapterRange } from "../readerPersonas/commentsRange.js";
import { inviteNewReaders } from "../readerPersonas/invite.js";
import { getReaderPersonaPoolStats } from "../readerPersonas/poolStats.js";
import { loadEffectivePersonas, readCustomPersonas } from "../readerPersonas/store.js";
import { generateChapterReaderComments, nicknameMap } from "./generate.js";
import { addAuthorReply, maybeNpcFollowUp, maybeReaderToReaderReply } from "./reply.js";
import { readChapterComments, writeChapterComments } from "./store.js";
import { isReaderCommentsGenerationInFlight } from "./background.js";
import { deleteThread, normalizeCommentsFile, setThreadPinned } from "./threadOps.js";

export type ReaderCommentsRouteDeps = {
  getDataDir: () => string;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
};

let inviteInFlight = false;

export function registerReaderCommentsRoutes(app: FastifyInstance, deps: ReaderCommentsRouteDeps) {
  const bookIdParam = z.object({ bookId: z.string().min(1) });

  app.get("/api/settings/feature-models", async () => {
    const file = await readFeatureSettings();
    const readerComments = normalizeReaderCommentsOptions(file.readerComments);
    const readerPersonaPool = await getReaderPersonaPoolStats(deps.getDataDir(), {
      min: readerComments.commentsPerChapterMin,
      max: readerComments.commentsPerChapterMax
    });
    return {
      configs: file.configs,
      activeId: file.activeId,
      featureModels: file.featureModels ?? {},
      features: file.features ?? { readerCommentsEnabled: false },
      readerComments,
      readerPersonaPool
    };
  });

  app.put("/api/settings/feature-models", async (req, reply) => {
    const body = z
      .object({
        configs: z.array(z.any()).optional(),
        activeId: z.string().nullable().optional(),
        featureModels: z
          .object({
            organize: z.string().nullable().optional(),
            readerComments: z.string().nullable().optional()
          })
          .optional(),
        features: z.object({ readerCommentsEnabled: z.boolean().optional() }).optional(),
        readerComments: z
          .object({
            maxAiCommentsPerChapter: z.number().optional(),
            commentsPerChapterMin: z.number().int().optional(),
            commentsPerChapterMax: z.number().int().optional(),
            useChapterAnalysisInput: z.boolean().optional(),
            npcReplyProbability: z.number().optional(),
            readerReplyReaderProbability: z.number().optional(),
            inviteCooldownMs: z.number().optional()
          })
          .optional()
      })
      .parse((req as { body: unknown }).body);

    if (
      body.readerComments &&
      !validateCommentsPerChapterRange({
        min: body.readerComments.commentsPerChapterMin,
        max: body.readerComments.commentsPerChapterMax
      })
    ) {
      return reply.code(400).send({ message: "最少条数不能大于最多条数" });
    }

    const current = await readFeatureSettings();
    const next: FeatureSettingsFile = {
      configs: body.configs ?? current.configs,
      activeId: body.activeId !== undefined ? body.activeId : current.activeId,
      featureModels: { ...current.featureModels, ...body.featureModels },
      features: { ...current.features, ...body.features },
      readerComments: normalizeReaderCommentsOptions({
        ...current.readerComments,
        ...(body.readerComments as FeatureSettingsFile["readerComments"])
      })
    };
    if (next.featureModels?.organize) next.activeId = next.featureModels.organize;
    await writeFeatureSettings(next);
    return { ok: true };
  });

  app.get("/api/books/:bookId/chapters/:filename/reader-comments", async (req, reply) => {
    const params = bookIdParam
      .extend({ filename: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    const settings = await readFeatureSettings();
    if (!settings.features?.readerCommentsEnabled) {
      return reply.code(403).send({ message: "模拟评论未开启" });
    }
    const dataDir = deps.getDataDir();
    const raw = await readChapterComments(dataDir, params.bookId, params.filename);
    const file = raw ? normalizeCommentsFile(raw) : null;
    const pool = await loadEffectivePersonas(dataDir);
    return {
      comments: file,
      nicknames: nicknameMap(pool),
      generating: isReaderCommentsGenerationInFlight(params.bookId, params.filename)
    };
  });

  app.patch("/api/books/:bookId/chapters/:filename/reader-comments/threads/:threadId", async (req, reply) => {
    const params = bookIdParam
      .extend({ filename: z.string().min(1), threadId: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    const body = z.object({ pinned: z.boolean() }).parse((req as { body: unknown }).body);

    const settings = await readFeatureSettings();
    if (!settings.features?.readerCommentsEnabled) {
      return reply.code(403).send({ message: "模拟评论未开启" });
    }

    const dataDir = deps.getDataDir();
    let file = await readChapterComments(dataDir, params.bookId, params.filename);
    if (!file) return reply.code(404).send({ message: "暂无评论" });

    file = setThreadPinned(file, params.threadId, body.pinned);
    await writeChapterComments(dataDir, params.bookId, params.filename, file);
    const pool = await loadEffectivePersonas(dataDir);
    return { comments: file, nicknames: nicknameMap(pool) };
  });

  app.delete("/api/books/:bookId/chapters/:filename/reader-comments/threads/:threadId", async (req, reply) => {
    const params = bookIdParam
      .extend({ filename: z.string().min(1), threadId: z.string().min(1) })
      .parse((req as { params: unknown }).params);

    const settings = await readFeatureSettings();
    if (!settings.features?.readerCommentsEnabled) {
      return reply.code(403).send({ message: "模拟评论未开启" });
    }

    const dataDir = deps.getDataDir();
    let file = await readChapterComments(dataDir, params.bookId, params.filename);
    if (!file) return reply.code(404).send({ message: "暂无评论" });

    file = deleteThread(file, params.threadId);
    await writeChapterComments(dataDir, params.bookId, params.filename, file);
    const pool = await loadEffectivePersonas(dataDir);
    return { comments: file, nicknames: nicknameMap(pool) };
  });

  app.post("/api/books/:bookId/chapters/:filename/reader-comments/generate", async (req, reply) => {
    const params = bookIdParam
      .extend({ filename: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    const body = z.object({ force: z.boolean().optional() }).parse((req as { body?: unknown }).body ?? {});

    const settings = await readFeatureSettings();
    const ready = assertReaderCommentsReady(settings);
    if ("error" in ready) return reply.code(400).send({ message: ready.error });

    const dataDir = deps.getDataDir();
    const pool = await loadEffectivePersonas(dataDir);
    const existing = await readChapterComments(dataDir, params.bookId, params.filename);
    const comments = await generateChapterReaderComments({
      dataDir,
      bookId: params.bookId,
      chapterFilename: params.filename,
      pool,
      options: normalizeReaderCommentsOptions(settings.readerComments),
      cfg: ready.cfg,
      createAiSdkModel: deps.createAiSdkModel,
      force: body.force ?? false,
      existing
    });
    await writeChapterComments(dataDir, params.bookId, params.filename, comments);
    return { comments, nicknames: nicknameMap(pool) };
  });

  app.post("/api/books/:bookId/chapters/:filename/reader-comments/reply", async (req, reply) => {
    const params = bookIdParam
      .extend({ filename: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    const body = z
      .object({ threadId: z.string().min(1), text: z.string().min(1).max(2000) })
      .parse((req as { body: unknown }).body);

    const settings = await readFeatureSettings();
    const ready = assertReaderCommentsReady(settings);
    if ("error" in ready) return reply.code(400).send({ message: ready.error });

    const dataDir = deps.getDataDir();
    let file = await readChapterComments(dataDir, params.bookId, params.filename);
    if (!file) return reply.code(404).send({ message: "请先生成本章评论" });

    const pool = await loadEffectivePersonas(dataDir);
    const opts = normalizeReaderCommentsOptions(settings.readerComments);
    let result = addAuthorReply(file, body.threadId, body.text);
    file = result.file;
    file = maybeNpcFollowUp(file, body.threadId, pool, opts);
    file = maybeReaderToReaderReply(file, body.threadId, pool, opts);
    await writeChapterComments(dataDir, params.bookId, params.filename, file);
    return { comments: file, nicknames: nicknameMap(pool) };
  });

  app.post("/api/books/:bookId/reader-personas/invite", async (req, reply) => {
    bookIdParam.parse((req as { params: unknown }).params);
    const body = z.object({ count: z.number().int().min(10).max(30).default(20) }).parse(
      (req as { body?: unknown }).body ?? {}
    );

    const settings = await readFeatureSettings();
    const ready = assertReaderCommentsReady(settings);
    if ("error" in ready) return reply.code(400).send({ message: ready.error });

    if (inviteInFlight) {
      return reply.code(409).send({ message: "邀请进行中", inviteInFlight: true });
    }

    const custom = await readCustomPersonas(deps.getDataDir());
    const opts = normalizeReaderCommentsOptions(settings.readerComments);
    if (custom.lastInviteAt) {
      const elapsed = Date.now() - new Date(custom.lastInviteAt).getTime();
      if (elapsed < opts.inviteCooldownMs) {
        return reply.code(429).send({ message: "邀请冷却中，请稍后再试" });
      }
    }

    inviteInFlight = true;
    try {
      const { added } = await inviteNewReaders({
        dataDir: deps.getDataDir(),
        count: body.count,
        cfg: ready.cfg,
        createAiSdkModel: deps.createAiSdkModel
      });
      return { ok: true, added };
    } finally {
      inviteInFlight = false;
    }
  });
}
