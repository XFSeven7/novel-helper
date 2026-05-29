import { z } from "zod";
import type { TrainingGradingResult } from "./types.js";

const gradingSchema = z.object({
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

export function parseTrainingGradingJson(raw: string): TrainingGradingResult {
  const jsonText = extractJsonObject(raw);
  return gradingSchema.parse(JSON.parse(jsonText));
}
