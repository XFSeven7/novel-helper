import { isValidCategoryId } from "./categories.js";
import { isLegacyCategoryId } from "./legacy.js";
import { isValidSceneId } from "./scenes.js";
import { getCategoryWithTeaching, getSceneWithTeaching } from "./teaching.js";
import type { TrainingTopicPublic } from "./types.js";

export function isValidTopicId(id: string): boolean {
  return isValidSceneId(id) || isValidCategoryId(id);
}

export async function getTopicWithTeaching(dataDir: string, id: string): Promise<TrainingTopicPublic> {
  if (isLegacyCategoryId(id)) return getCategoryWithTeaching(dataDir, id);
  return getSceneWithTeaching(dataDir, id);
}

export function topicTitle(topic: TrainingTopicPublic): string {
  return topic.title;
}

export function topicRubricHints(topic: TrainingTopicPublic): string[] {
  return topic.rubricHints;
}
