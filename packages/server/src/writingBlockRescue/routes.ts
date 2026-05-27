import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { performWritingBlockRescue, type RescueDeps } from "./rescue.js";

export function registerWritingBlockRescueRoutes(app: FastifyInstance, deps: RescueDeps) {
  app.post("/api/writing-block/rescue", async (req, reply) => {
    const body = z
      .object({
        bookId: z.string().min(1),
        chapterFilename: z.string().min(1),
        length: z.enum(["short", "mid", "long"]),
        moreChaos: z.boolean().optional(),
        cursorHint: z.string().optional(),
        entropyCardId: z.string().optional(),
        injectEntropy: z.boolean().optional()
      })
      .parse((req as { body: unknown }).body);
    try {
      const { result, context } = await performWritingBlockRescue(deps, body);
      return { result, context };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ message: msg });
    }
  });
}
