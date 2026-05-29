import { generateText } from "ai";
import type { ModelConfig } from "../featureSettings.js";
import { getCategoryWithTeaching } from "./teaching.js";
import { buildGenerateQuestionsPrompt } from "./promptGenerate.js";
import { parseGenerateQuestionsJson } from "./parseGenerate.js";
import { listQuestionsByCategory, saveQuestion } from "./store.js";
import type { TrainingQuestion } from "./types.js";

export async function generateTrainingQuestions(
  deps: {
    getDataDir: () => string;
    createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
    cfg: ModelConfig;
  },
  input: { categoryId: string; count: 1 | 3 | 5 }
): Promise<TrainingQuestion[]> {
  const dataDir = deps.getDataDir();
  const category = await getCategoryWithTeaching(dataDir, input.categoryId);
  const existing = await listQuestionsByCategory(dataDir, input.categoryId);
  const existingTitles = existing.map((q) => q.title);

  const { model, providerOptions } = deps.createAiSdkModel(deps.cfg);
  const prompt = buildGenerateQuestionsPrompt({
    category,
    count: input.count,
    existingTitles
  });

  const { text } = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
    messages: [{ role: "user", content: prompt }]
  });

  const drafts = parseGenerateQuestionsJson(String(text || ""));
  const saved: TrainingQuestion[] = [];
  for (const d of drafts.slice(0, input.count)) {
    const q = await saveQuestion(dataDir, {
      categoryId: input.categoryId,
      title: d.title.trim(),
      prompt: d.prompt.trim(),
      minChars: d.minChars ?? category.exerciseDefaults.minChars,
      maxChars: d.maxChars ?? category.exerciseDefaults.maxChars,
      snippet: d.snippet,
      source: "ai"
    });
    saved.push(q);
  }
  return saved;
}
