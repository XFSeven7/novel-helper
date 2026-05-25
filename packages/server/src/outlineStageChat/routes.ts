import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listChapters } from "../fsStore.js";
import { ensureOutlineIndex } from "../outlineStore.js";
import { performStageChat, type StageChatDeps } from "./chat.js";
import { buildStageChatContextBlock } from "./context.js";
import { appendStageChatTurn, turnsForModel } from "./store.js";
import { findStageNode, stageRoots } from "./stageTree.js";
import { MAX_STAGE_CHAT_USER_LEN } from "./types.js";

export type OutlineStageChatRouteDeps = StageChatDeps & {
  getDataDir: () => string;
  sseWrite: (res: unknown, payload: unknown) => void;
};

export function registerOutlineStageChatRoutes(app: FastifyInstance, deps: OutlineStageChatRouteDeps) {
  const bookIdParam = z.object({ bookId: z.string().min(1) });

  app.post(
    "/api/books/:bookId/outline/stages/:stageId/chat/stream",
    async (req, reply) => {
      const params = bookIdParam
        .extend({ stageId: z.string().min(1) })
        .parse((req as { params: unknown }).params);
      const body = z
        .object({
          modelConfigId: z.string().nullable().optional(),
          userMessage: z.string().min(1).max(MAX_STAGE_CHAT_USER_LEN)
        })
        .parse((req as { body: unknown }).body);

      const dataDir = deps.getDataDir();
      const chapters = await listChapters(dataDir, params.bookId);
      const outline = await ensureOutlineIndex(dataDir, params.bookId, chapters);
      const found = findStageNode(stageRoots(outline.book.mainlineStages), params.stageId);
      if (!found) return reply.code(404).send({ message: "Not found" });

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
        deps.sseWrite(reply.raw, { type: "log", text: "生成阶段策划…\n" });
        const contextBlock = await buildStageChatContextBlock(
          dataDir,
          params.bookId,
          outline,
          params.stageId
        );
        const history = turnsForModel(found.node.chatTurns ?? []);
        const assistantText = await performStageChat(deps, {
          modelConfigId: body.modelConfigId,
          contextBlock,
          history,
          userMessage: body.userMessage,
          onDelta: (d) => {
            if (d) deps.sseWrite(reply.raw, { type: "delta", textDelta: d });
          }
        });
        if (!assistantText.trim()) {
          throw new Error("模型未返回有效内容");
        }
        const saved = await appendStageChatTurn(
          dataDir,
          params.bookId,
          params.stageId,
          body.userMessage,
          assistantText
        );
        deps.sseWrite(reply.raw, { type: "done", assistantText, outline: saved });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        deps.sseWrite(reply.raw, { type: "error", message });
      } finally {
        reply.raw.end();
      }
    }
  );
}
