import { generateText } from "ai";
import type { ModelConfig } from "../featureSettings.js";
import { isLegacyCategoryId } from "./legacy.js";
import { buildCategoryGenerateQuestionsPrompt, buildGenerateQuestionsPrompt } from "./promptGenerate.js";
import { getTopicWithTeaching } from "./topics.js";
import type { TrainingCategoryPublic, TrainingScenePublic } from "./types.js";
import { parseGenerateQuestionsJson } from "./parseGenerate.js";
import { listQuestionsByScene, saveQuestion } from "./store.js";
import type { TrainingQuestion } from "./types.js";

export async function generateTrainingQuestions(
  deps: {
    getDataDir: () => string;
    createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
    cfg: ModelConfig;
  },
  input: { sceneId: string; count: 1 | 3 | 5 }
): Promise<TrainingQuestion[]> {
  const dataDir = deps.getDataDir();
  const topic = await getTopicWithTeaching(dataDir, input.sceneId);
  const existing = await listQuestionsByScene(dataDir, input.sceneId);
  const existingTitles = existing.map((q) => q.title);

  const { model, providerOptions } = deps.createAiSdkModel(deps.cfg);
  const prompt = isLegacyCategoryId(input.sceneId)
    ? buildCategoryGenerateQuestionsPrompt({
        category: topic as TrainingCategoryPublic,
        count: input.count,
        existingTitles
      })
    : buildGenerateQuestionsPrompt({
        scene: topic as TrainingScenePublic,
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
      sceneId: input.sceneId,
      title: d.title.trim(),
      prompt: d.prompt.trim(),
      minChars: d.minChars ?? topic.exerciseDefaults.minChars,
      maxChars: d.maxChars ?? topic.exerciseDefaults.maxChars,
      snippet: d.snippet,
      source: "ai"
    });
    saved.push(q);
  }
  return saved;
}
