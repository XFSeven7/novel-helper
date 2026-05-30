import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCategory } from "./categories.js";
import { getScene } from "./scenes.js";
import type { TrainingCategoryPublic, TrainingScenePublic } from "./types.js";

/** 内置学法 Markdown，随应用版本发布；不写入 dataDir，避免用户数据目录残留旧文案。 */
const BUNDLED_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "teaching");

export async function readTeachingMarkdown(_dataDir: string, teachingFile: string): Promise<string> {
  const safe = path.basename(teachingFile);
  if (safe !== teachingFile) {
    throw new Error("Invalid teaching file");
  }
  return await fs.readFile(path.join(BUNDLED_DIR, safe), "utf8");
}

export async function getSceneWithTeaching(dataDir: string, id: string): Promise<TrainingScenePublic> {
  const scene = getScene(id);
  const contentMarkdown = await readTeachingMarkdown(dataDir, scene.teachingFile);
  return { ...scene, contentMarkdown };
}

export async function getCategoryWithTeaching(dataDir: string, id: string): Promise<TrainingCategoryPublic> {
  const category = getCategory(id);
  const contentMarkdown = await readTeachingMarkdown(dataDir, category.teachingFile);
  return { ...category, contentMarkdown };
}
