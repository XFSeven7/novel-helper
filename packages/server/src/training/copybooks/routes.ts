import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertTrainingModuleEnabled, readFeatureSettings } from "../../featureSettings.js";
import {
  completeChapter,
  importCopybook,
  listCopybooksWithProgress,
  readChapterText,
  readCopybookMeta,
  readCopybookProgress,
  saveChapterProgress,
  saveChapterSource
} from "./store.js";

export type CopybookRouteDeps = { getDataDir: () => string };

async function requireCopybookModule(reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const file = await readFeatureSettings();
  const ready = assertTrainingModuleEnabled(file);
  if ("error" in ready) {
    reply.code(403).send({ message: ready.error });
    return null;
  }
  return file;
}

export function registerCopybookRoutes(app: FastifyInstance, deps: CopybookRouteDeps) {
  app.get("/api/training/copybooks", async (_req, reply) => {
    if (!(await requireCopybookModule(reply))) return;
    return listCopybooksWithProgress(deps.getDataDir());
  });

  app.post("/api/training/copybooks/import", async (req, reply) => {
    if (!(await requireCopybookModule(reply))) return;
    const part = await req.file();
    if (!part) return reply.code(400).send({ message: "缺少 file 字段" });
    const chunks: Buffer[] = [];
    for await (const chunk of part.file) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    try {
      const book = await importCopybook(deps.getDataDir(), part.filename || "import.txt", buf);
      const singleChapterFallback =
        book.chapterCount === 1 && book.chapters[0]?.title === "全文";
      return { book, singleChapterFallback };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes("20MB") ? 413 : 400;
      return reply.code(code).send({ message: msg });
    }
  });

  app.get("/api/training/copybooks/:bookId/chapters/:index", async (req, reply) => {
    if (!(await requireCopybookModule(reply))) return;
    const { bookId, index } = z
      .object({ bookId: z.string(), index: z.coerce.number().int().min(0) })
      .parse((req as { params: unknown }).params);
    const meta = await readCopybookMeta(deps.getDataDir(), bookId);
    if (!meta) return reply.code(404).send({ message: "书目不存在" });
    if (!meta.chapters[index]) return reply.code(404).send({ message: "章节不存在" });
    try {
      const { title, text } = await readChapterText(deps.getDataDir(), bookId, index);
      const progress = await readCopybookProgress(deps.getDataDir(), bookId);
      const chProg = progress.chapters[String(index)];
      return {
        title,
        text,
        index,
        draftText: chProg?.draftText ?? "",
        cursorPos: chProg?.cursorPos ?? 0,
        status: chProg?.status ?? "not_started"
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(404).send({ message: msg });
    }
  });

  app.put("/api/training/copybooks/:bookId/chapters/:index/source", async (req, reply) => {
    if (!(await requireCopybookModule(reply))) return;
    const { bookId, index } = z
      .object({ bookId: z.string(), index: z.coerce.number().int().min(0) })
      .parse((req as { params: unknown }).params);
    const body = z.object({ sourceText: z.string() }).parse((req as { body: unknown }).body);
    const meta = await readCopybookMeta(deps.getDataDir(), bookId);
    if (!meta) return reply.code(404).send({ message: "书目不存在" });
    if (!meta.chapters[index]) return reply.code(404).send({ message: "章节不存在" });
    try {
      await saveChapterSource(deps.getDataDir(), bookId, index, body.sourceText);
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ message: msg });
    }
  });

  app.put("/api/training/copybooks/:bookId/chapters/:index/progress", async (req, reply) => {
    if (!(await requireCopybookModule(reply))) return;
    const { bookId, index } = z
      .object({ bookId: z.string(), index: z.coerce.number().int().min(0) })
      .parse((req as { params: unknown }).params);
    const body = z
      .object({ draftText: z.string(), cursorPos: z.number().int().min(0) })
      .parse((req as { body: unknown }).body);
    const meta = await readCopybookMeta(deps.getDataDir(), bookId);
    if (!meta) return reply.code(404).send({ message: "书目不存在" });
    if (!meta.chapters[index]) return reply.code(404).send({ message: "章节不存在" });
    try {
      await saveChapterProgress(deps.getDataDir(), bookId, index, body);
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ message: msg });
    }
  });

  app.post("/api/training/copybooks/:bookId/chapters/:index/complete", async (req, reply) => {
    if (!(await requireCopybookModule(reply))) return;
    const { bookId, index } = z
      .object({ bookId: z.string(), index: z.coerce.number().int().min(0) })
      .parse((req as { params: unknown }).params);
    const body = z
      .object({
        draftText: z.string(),
        durationSec: z.number().int().min(0).optional()
      })
      .parse((req as { body: unknown }).body);
    const meta = await readCopybookMeta(deps.getDataDir(), bookId);
    if (!meta) return reply.code(404).send({ message: "书目不存在" });
    if (!meta.chapters[index]) return reply.code(404).send({ message: "章节不存在" });
    try {
      const progress = await completeChapter(deps.getDataDir(), bookId, index, body);
      return { progress: progress.chapters[String(index)] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ message: msg });
    }
  });
}
