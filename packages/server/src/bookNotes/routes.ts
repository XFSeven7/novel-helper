import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  addEntry,
  addNotebook,
  deleteEntry,
  deleteNotebook,
  ensureNotesIndex,
  patchEntry,
  patchNotebook
} from "./store.js";

export type BookNotesRouteDeps = {
  getDataDir: () => string;
};

export function registerBookNotesRoutes(app: FastifyInstance, deps: BookNotesRouteDeps) {
  const bookIdParam = z.object({ bookId: z.string().min(1) });

  app.get("/api/books/:bookId/notes", async (req) => {
    const { bookId } = bookIdParam.parse((req as { params: unknown }).params);
    const index = await ensureNotesIndex(deps.getDataDir(), bookId);
    return { index };
  });

  app.post("/api/books/:bookId/notes/notebooks", async (req) => {
    const { bookId } = bookIdParam.parse((req as { params: unknown }).params);
    const body = z.object({ name: z.string().min(1) }).parse((req as { body: unknown }).body);
    const index = await addNotebook(deps.getDataDir(), bookId, body.name);
    return { index };
  });

  app.patch("/api/books/:bookId/notes/notebooks/:notebookId", async (req, reply) => {
    const params = bookIdParam
      .extend({ notebookId: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        order: z.number().int().optional()
      })
      .parse((req as { body: unknown }).body);
    try {
      const index = await patchNotebook(deps.getDataDir(), params.bookId, params.notebookId, body);
      return { index };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Not found") return reply.code(404).send({ message: msg });
      return reply.code(400).send({ message: msg });
    }
  });

  app.delete("/api/books/:bookId/notes/notebooks/:notebookId", async (req, reply) => {
    const params = bookIdParam
      .extend({ notebookId: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    try {
      const { index } = await deleteNotebook(deps.getDataDir(), params.bookId, params.notebookId);
      return { index };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const entryCount = (e as { entryCount?: number }).entryCount;
      if (msg === "Notebook has entries" && typeof entryCount === "number") {
        return reply.code(409).send({ message: "该笔记本下仍有备注，请先迁移或删除", entryCount });
      }
      if (msg === "Cannot delete built-in notebook") {
        return reply.code(400).send({ message: "「规划」笔记本不可删除" });
      }
      if (msg === "Not found") return reply.code(404).send({ message: msg });
      return reply.code(400).send({ message: msg });
    }
  });

  app.post("/api/books/:bookId/notes/entries", async (req, reply) => {
    const { bookId } = bookIdParam.parse((req as { params: unknown }).params);
    const body = z
      .object({
        notebookId: z.string().min(1),
        content: z.string().min(1).max(8000)
      })
      .parse((req as { body: unknown }).body);
    try {
      const index = await addEntry(deps.getDataDir(), bookId, body.notebookId, body.content);
      return { index };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Notebook not found") return reply.code(400).send({ message: msg });
      if (msg === "Content required") return reply.code(400).send({ message: "内容不能为空" });
      return reply.code(400).send({ message: msg });
    }
  });

  app.patch("/api/books/:bookId/notes/entries/:entryId", async (req, reply) => {
    const params = bookIdParam
      .extend({ entryId: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    const body = z
      .object({
        content: z.string().min(1).max(8000).optional(),
        pinned: z.boolean().optional(),
        notebookId: z.string().min(1).optional()
      })
      .parse((req as { body: unknown }).body);
    try {
      const index = await patchEntry(deps.getDataDir(), params.bookId, params.entryId, body);
      return { index };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Not found") return reply.code(404).send({ message: msg });
      return reply.code(400).send({ message: msg === "Content required" ? "内容不能为空" : msg });
    }
  });

  app.delete("/api/books/:bookId/notes/entries/:entryId", async (req, reply) => {
    const params = bookIdParam
      .extend({ entryId: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    try {
      const index = await deleteEntry(deps.getDataDir(), params.bookId, params.entryId);
      return { index };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Not found") return reply.code(404).send({ message: msg });
      return reply.code(400).send({ message: msg });
    }
  });
}
