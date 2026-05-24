import { z } from "zod";

const hookOpSchema = z.object({
  hookId: z.string().trim().optional(),
  title: z.string().trim().optional(),
  action: z.enum(["plant", "advance", "mention", "resolve"]),
  progress: z.string().trim().optional()
});

export const chapterExtractSchema = z.object({
  chapter: z
    .object({
      filename: z.string().optional(),
      id: z.string().optional(),
      title: z.string().optional(),
      wordCount: z.number().optional(),
      auditedAt: z.string().optional()
    })
    .default({}),
  gistL1: z.string().max(400).default(""),
  humanAuditReport: z.string().default(""),
  scores: z.record(z.string(), z.unknown()).optional(),
  entities: z
    .object({
      characters: z.array(z.record(z.string(), z.unknown())).max(30).default([]),
      events: z.array(z.record(z.string(), z.unknown())).max(15).default([])
    })
    .default({ characters: [], events: [] }),
  hookOps: z.array(hookOpSchema).max(20).default([]),
  consistencyChecks: z.array(z.record(z.string(), z.unknown())).max(12).default([]),
  causalAnchors: z
    .object({
      setups: z.array(z.unknown()).default([]),
      payoffs: z.array(z.unknown()).default([])
    })
    .optional(),
  impactAnalysis: z.array(z.record(z.string(), z.unknown())).max(12).default([]),
  compression: z.unknown().optional(),
  ledgerUpdates: z
    .object({
      openLoops: z.array(z.unknown()).default([]),
      closedLoops: z.array(z.unknown()).default([])
    })
    .optional(),
  uiInjection: z
    .object({
      spotlightCharacters: z.array(z.string()).default([]),
      spotlightTags: z.array(z.string()).default([])
    })
    .optional()
});

export type ChapterExtract = z.infer<typeof chapterExtractSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

export function parseChapterExtract(jsonText: string): ChapterExtract {
  const raw = JSON.parse(jsonText);
  const parsed = chapterExtractSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`ChapterExtract 校验失败: ${formatZodError(parsed.error)}`);
  }
  return parsed.data;
}
