import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { performWritingGuidanceChat, type WritingGuidanceChatDeps } from "./chat.js";
import {
  addNotebook,
  addSession,
  appendChatTurn,
  deleteNotebook,
  deleteSession,
  ensureGuidanceIndex,
  getSessionForChat,
  patchNotebook,
  patchSession,
  reorderSessions
} from "./store.js";
import { MAX_GUIDANCE_SESSION_MESSAGES, MAX_GUIDANCE_USER_MESSAGE_LEN } from "./types.js";

export type WritingGuidanceRouteDeps = WritingGuidanceChatDeps & {
  getDataDir: () => string;
  sseWrite: (res: unknown, payload: unknown) => void;
};

export function registerWritingGuidanceRoutes(app: FastifyInstance, deps: WritingGuidanceRouteDeps) {
  const bookIdParam = z.object({ bookId: z.string().min(1) });

  app.get("/api/books/:bookId/writing-guidance", async (req) => {
    const { bookId } = bookIdParam.parse((req as { params: unknown }).params);
    const index = await ensureGuidanceIndex(deps.getDataDir(), bookId);
    return { index };
  });

  app.post("/api/books/:bookId/writing-guidance/notebooks", async (req) => {
    const { bookId } = bookIdParam.parse((req as { params: unknown }).params);
    const body = z.object({ name: z.string().min(1) }).parse((req as { body: unknown }).body);
    const index = await addNotebook(deps.getDataDir(), bookId, body.name);
    return { index };
  });

  app.patch("/api/books/:bookId/writing-guidance/notebooks/:notebookId", async (req, reply) => {
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

  app.delete("/api/books/:bookId/writing-guidance/notebooks/:notebookId", async (req, reply) => {
    const params = bookIdParam
      .extend({ notebookId: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    try {
      const { index } = await deleteNotebook(deps.getDataDir(), params.bookId, params.notebookId);
      return { index };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const sessionCount = (e as { sessionCount?: number }).sessionCount;
      if (msg === "Notebook has sessions" && typeof sessionCount === "number") {
        return reply.code(409).send({
          message: "该笔记本下仍有指导会话，请先迁移或删除",
          sessionCount
        });
      }
      if (msg === "Cannot delete built-in notebook") {
        return reply.code(400).send({ message: "「常用」笔记本不可删除" });
      }
      if (msg === "Not found") return reply.code(404).send({ message: msg });
      return reply.code(400).send({ message: msg });
    }
  });

  app.post("/api/books/:bookId/writing-guidance/sessions", async (req, reply) => {
    const { bookId } = bookIdParam.parse((req as { params: unknown }).params);
    const body = z
      .object({
        notebookId: z.string().min(1),
        title: z.string().optional()
      })
      .parse((req as { body: unknown }).body);
    try {
      const { index, sessionId } = await addSession(deps.getDataDir(), bookId, body);
      return { index, sessionId };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Notebook not found") return reply.code(400).send({ message: msg });
      return reply.code(400).send({ message: msg });
    }
  });

  app.patch("/api/books/:bookId/writing-guidance/sessions/:sessionId", async (req, reply) => {
    const params = bookIdParam
      .extend({ sessionId: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    const body = z
      .object({
        title: z.string().min(1).optional(),
        notebookId: z.string().min(1).optional()
      })
      .parse((req as { body: unknown }).body);
    try {
      const index = await patchSession(deps.getDataDir(), params.bookId, params.sessionId, body);
      return { index };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Not found") return reply.code(404).send({ message: msg });
      return reply.code(400).send({ message: msg });
    }
  });

  app.post("/api/books/:bookId/writing-guidance/sessions/reorder", async (req, reply) => {
    const { bookId } = bookIdParam.parse((req as { params: unknown }).params);
    const body = z
      .object({
        notebookId: z.string().min(1),
        sessionIds: z.array(z.string().min(1)).min(1)
      })
      .parse((req as { body: unknown }).body);
    try {
      const index = await reorderSessions(deps.getDataDir(), bookId, body.notebookId, body.sessionIds);
      return { index };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Not found" || msg.includes("mismatch")) {
        return reply.code(400).send({ message: msg });
      }
      return reply.code(400).send({ message: msg });
    }
  });

  app.delete("/api/books/:bookId/writing-guidance/sessions/:sessionId", async (req, reply) => {
    const params = bookIdParam
      .extend({ sessionId: z.string().min(1) })
      .parse((req as { params: unknown }).params);
    try {
      const index = await deleteSession(deps.getDataDir(), params.bookId, params.sessionId);
      return { index };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Not found") return reply.code(404).send({ message: msg });
      return reply.code(400).send({ message: msg });
    }
  });

  app.post(
    "/api/books/:bookId/writing-guidance/sessions/:sessionId/chat/stream",
    async (req, reply) => {
      const params = bookIdParam
        .extend({ sessionId: z.string().min(1) })
        .parse((req as { params: unknown }).params);
      const body = z
        .object({
          modelConfigId: z.string().nullable().optional(),
          userMessage: z.string().min(1).max(MAX_GUIDANCE_USER_MESSAGE_LEN)
        })
        .parse((req as { body: unknown }).body);

      const dataDir = deps.getDataDir();
      let session;
      try {
        const index = await ensureGuidanceIndex(dataDir, params.bookId);
        session = getSessionForChat(index, params.sessionId);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "Not found") return reply.code(404).send({ message: msg });
        if (msg === "Session message limit") {
          return reply.code(400).send({ message: "本会话已达上限，请新建指导" });
        }
        return reply.code(400).send({ message: msg });
      }

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
        deps.sseWrite(reply.raw, { type: "log", text: "生成写作指导…\n" });
        const assistantText = await performWritingGuidanceChat(deps, {
          modelConfigId: body.modelConfigId,
          history: session.messages,
          userMessage: body.userMessage,
          onDelta: (d) => {
            if (d) deps.sseWrite(reply.raw, { type: "delta", textDelta: d });
          }
        });
        if (!assistantText.trim()) {
          throw new Error("模型未返回有效内容");
        }
        const index = await appendChatTurn(
          dataDir,
          params.bookId,
          params.sessionId,
          body.userMessage,
          assistantText
        );
        deps.sseWrite(reply.raw, { type: "done", assistantText, index });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        deps.sseWrite(reply.raw, { type: "error", message });
      } finally {
        reply.raw.end();
      }
    }
  );
}
