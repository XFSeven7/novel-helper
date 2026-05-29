import { z } from "zod";
import type { GeneratedQuestionDraft } from "./promptGenerate.js";

const schema = z.object({
  questions: z.array(
    z.object({
      title: z.string().min(1),
      prompt: z.string().min(1),
      minChars: z.number().int().positive().optional(),
      maxChars: z.number().int().positive().optional(),
      snippet: z
        .object({
          title: z.string(),
          body: z.string()
        })
        .optional()
    })
  )
});

function extractJsonObject(raw: string): string {
  const t = String(raw || "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]!.trim() : t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("出题结果中未找到 JSON");
  return body.slice(start, end + 1);
}

export function parseGenerateQuestionsJson(raw: string): GeneratedQuestionDraft[] {
  const parsed = schema.parse(JSON.parse(extractJsonObject(raw)));
  return parsed.questions.map((q) => ({
    title: q.title,
    prompt: q.prompt,
    minChars: q.minChars ?? 80,
    maxChars: q.maxChars ?? 500,
    snippet: q.snippet
  }));
}
