import { generateText } from "ai";
import type { ModelConfig } from "../featureSettings.js";
import { buildGradingPrompt } from "./promptGrade.js";
import { parseTrainingGradingJson } from "./parseGrading.js";
import type { TrainingGradingMode } from "./gradingModes.js";
import type { TrainingGradingResult, TrainingQuestion, TrainingTopicPublic } from "./types.js";

export async function gradeTrainingAttempt(deps: {
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
  cfg: ModelConfig;
  topic: TrainingTopicPublic;
  question: TrainingQuestion;
  userText: string;
  gradingMode: TrainingGradingMode;
}): Promise<TrainingGradingResult> {
  const { model, providerOptions } = deps.createAiSdkModel(deps.cfg);
  const prompt = buildGradingPrompt(deps.gradingMode, {
    topic: deps.topic,
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
