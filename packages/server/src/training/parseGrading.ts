import { z } from "zod";
import type { TrainingGradingResult, TrainingExecutionDetail } from "./types.js";

const coerceCount = z.union([z.number(), z.string()]).transform((v) => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
});

const infernalSchema = z.object({
  attitudeDiagnosis: z.string().min(1),
  sanityDamage: coerceCount.pipe(z.number().int().min(0).max(100)),
  soulCrushingMockery: z.string().min(1),
  executionDetails: z
    .array(
      z.object({
        crimeScene: z.string(),
        roast: z.string().min(1)
      })
    )
    .min(1),
  overallScore: z.number().int().min(0).max(100),
  purgatoryPenalty: z.string().min(1)
});

const pathologySchema = z.object({
  vitalSigns: z
    .object({
      editorNauseaLevel: z.number().int().min(1).max(10),
      toxicWordCount: coerceCount
    })
    .optional(),
  auditReports: z
    .object({
      causalAnchorStatus: z.string().min(1),
      characterFingerprint: z.string().min(1)
    })
    .optional(),
  microscopicDismemberment: z
    .object({
      targetSentence: z.string(),
      pathologyAnalysis: z.string().min(1),
      surgicalAmputation: z.string().min(1)
    })
    .optional(),
  overallScore: z.number().int().min(0).max(100),
  respecGuide: z.string().min(1).optional()
});

const devilSchema = z.object({
  diagnosticThinking: z.string().optional(),
  dimensionScores: z
    .object({
      adherence: z.number().int().min(0).max(100),
      prose: z.number().int().min(0).max(100),
      technique: z.number().int().min(0).max(100)
    })
    .optional(),
  overallScore: z.number().int().min(0).max(100),
  fatalFlaws: z
    .array(
      z.object({
        quote: z.string(),
        critique: z.string()
      })
    )
    .optional(),
  strengths: z.array(z.string()).optional(),
  improvements: z.array(z.string()).optional(),
  exampleRewrite: z.string().optional(),
  rewriteAnalysis: z.string().optional(),
  nextStep: z.string().optional()
});

const legacySchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  strengths: z.array(z.string()).min(1),
  improvements: z.array(z.string()).min(1),
  exampleRewrite: z.string(),
  nextStep: z.string()
});

function extractJsonObject(raw: string): string {
  const t = String(raw || "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]!.trim() : t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("评改结果中未找到 JSON");
  return body.slice(start, end + 1);
}

function normalizeExecutionDetails(details: TrainingExecutionDetail[]): TrainingExecutionDetail[] {
  const cleaned = details
    .map((d) => ({
      crimeScene: String(d.crimeScene || "").trim(),
      roast: String(d.roast || "").trim()
    }))
    .filter((d) => d.roast.length > 0);
  if (cleaned.length) return cleaned;
  return [{ crimeScene: "（全文）", roast: "无可救药，连一句值得单独开骂的罪证都挑不出来。" }];
}

function fromPathology(p: z.infer<typeof pathologySchema>): TrainingGradingResult {
  const micro = p.microscopicDismemberment;
  const audit = p.auditReports;
  const details: TrainingExecutionDetail[] = micro
    ? [
        {
          crimeScene: micro.targetSentence?.trim() || "（全文）",
          roast: micro.pathologyAnalysis
        }
      ]
    : [{ crimeScene: "（全文）", roast: "旧版病理报告，细节缺失。" }];
  if (micro?.surgicalAmputation?.trim()) {
    details.push({
      crimeScene: micro.targetSentence?.trim() || "（改写对照）",
      roast: micro.surgicalAmputation
    });
  }
  const nausea = p.vitalSigns?.editorNauseaLevel ?? Math.min(10, Math.max(1, Math.round((100 - p.overallScore) / 10)));
  return {
    attitudeDiagnosis:
      audit?.causalAnchorStatus?.trim() ||
      "态度未明，按认真但菜处理。",
    sanityDamage: Math.min(100, Math.max(0, nausea * 10)),
    soulCrushingMockery:
      micro?.pathologyAnalysis?.trim() ||
      audit?.characterFingerprint?.trim() ||
      "文字工业废气，不配浪费判官口水。",
    executionDetails: normalizeExecutionDetails(details),
    overallScore: p.overallScore,
    purgatoryPenalty: p.respecGuide?.trim() || "推倒重写，先删光形容词再练。"
  };
}

function fromDevilEditor(d: z.infer<typeof devilSchema>): TrainingGradingResult {
  const flaws = d.fatalFlaws ?? [];
  const details: TrainingExecutionDetail[] =
    flaws.length > 0
      ? flaws.map((f) => ({
          crimeScene: f.quote?.trim() || "（未摘录）",
          roast: f.critique
        }))
      : (d.improvements ?? []).map((critique) => ({ crimeScene: "（全文）", roast: critique }));
  return {
    attitudeDiagnosis: d.diagnosticThinking?.trim() || "认真但菜，只是菜得惊人。",
    sanityDamage: Math.min(100, Math.max(0, 100 - d.overallScore)),
    soulCrushingMockery:
      d.improvements?.join("；")?.trim() ||
      flaws[0]?.critique ||
      "平庸到让判官想提前下班。",
    executionDetails: normalizeExecutionDetails(details),
    overallScore: d.overallScore,
    purgatoryPenalty:
      d.nextStep?.trim() ||
      d.rewriteAnalysis?.trim() ||
      d.exampleRewrite?.trim() ||
      "手抄原题三遍，不许复制粘贴。"
  };
}

function fromLegacy(legacy: z.infer<typeof legacySchema>): TrainingGradingResult {
  return fromDevilEditor({
    overallScore: legacy.overallScore,
    strengths: legacy.strengths,
    improvements: legacy.improvements,
    fatalFlaws: legacy.improvements.map((critique) => ({ quote: "", critique })),
    exampleRewrite: legacy.exampleRewrite,
    nextStep: legacy.nextStep
  });
}

export function parseTrainingGradingJson(raw: string): TrainingGradingResult {
  const jsonText = extractJsonObject(raw);
  const parsed: unknown = JSON.parse(jsonText);

  const infernal = infernalSchema.safeParse(parsed);
  if (infernal.success) {
    return {
      ...infernal.data,
      executionDetails: normalizeExecutionDetails(infernal.data.executionDetails)
    };
  }

  const pathology = pathologySchema.safeParse(parsed);
  if (
    pathology.success &&
    (pathology.data.vitalSigns ||
      pathology.data.auditReports ||
      pathology.data.microscopicDismemberment ||
      pathology.data.respecGuide)
  ) {
    return fromPathology(pathology.data);
  }

  const devil = devilSchema.safeParse(parsed);
  if (devil.success) {
    return fromDevilEditor(devil.data);
  }

  const legacy = legacySchema.safeParse(parsed);
  if (legacy.success) {
    return fromLegacy(legacy.data);
  }

  throw infernal.error;
}
