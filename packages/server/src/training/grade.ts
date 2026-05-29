import { generateText } from "ai";
import type { ModelConfig } from "../featureSettings.js";
import { buildStrictTeacherGradingPrompt } from "./promptGrade.js";
import { parseTrainingGradingJson } from "./parseGrading.js";
import type { TrainingCategory, TrainingGradingResult, TrainingQuestion } from "./types.js";

export async function gradeTrainingAttempt(deps: {
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
  cfg: ModelConfig;
  category: TrainingCategory;
  question: TrainingQuestion;
  userText: string;
}): Promise<TrainingGradingResult> {
  const { model, providerOptions } = deps.createAiSdkModel(deps.cfg);
  const prompt = buildStrictTeacherGradingPrompt({
    category: deps.category,
    question: deps.question,
    userText: deps.userText
  });
  const { text } = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
    messages: [{ role: "user", content: prompt }]
  });
  return parseTrainingGradingJson(String(text || ""));
}
