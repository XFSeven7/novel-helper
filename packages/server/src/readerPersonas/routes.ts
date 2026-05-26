import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  assertReaderCommentsReady,
  readFeatureSettings,
  type ModelConfig
} from "../featureSettings.js";
import { inviteNewReaders } from "./invite.js";
import { listReaderPersonas } from "./list.js";

export type ReaderPersonaRouteDeps = {
  getDataDir: () => string;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
};

let generateInFlight = false;

export function registerReaderPersonaRoutes(app: FastifyInstance, deps: ReaderPersonaRouteDeps) {
  app.get("/api/settings/reader-personas", async (req) => {
    const query = z
      .object({
        q: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50)
      })
      .parse((req as { query: unknown }).query);

    return listReaderPersonas(deps.getDataDir(), query);
  });

  app.post("/api/settings/reader-personas/generate", async (req, reply) => {
    const body = z
      .object({ count: z.number().int().min(1).max(50) })
      .parse((req as { body?: unknown }).body ?? {});

    const settings = await readFeatureSettings();
    const ready = assertReaderCommentsReady(settings);
    if ("error" in ready) return reply.code(400).send({ message: ready.error });

    if (generateInFlight) {
      return reply.code(409).send({ message: "生成进行中" });
    }

    generateInFlight = true;
    try {
      const { added } = await inviteNewReaders({
        dataDir: deps.getDataDir(),
        count: body.count,
        cfg: ready.cfg,
        createAiSdkModel: deps.createAiSdkModel
      });
      return { ok: true, added };
    } finally {
      generateInFlight = false;
    }
  });
}
