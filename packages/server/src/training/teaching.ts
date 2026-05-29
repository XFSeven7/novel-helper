import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCategory } from "./categories.js";
import { getScene } from "./scenes.js";
import type { TrainingCategoryPublic, TrainingScenePublic } from "./types.js";

const BUNDLED_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "teaching");

export function trainingTeachingDir(dataDir: string) {
  return path.join(dataDir, "_settings", "training", "teaching");
}

export async function ensureTeachingSeeded(dataDir: string): Promise<void> {
  const dest = trainingTeachingDir(dataDir);
  await fs.mkdir(dest, { recursive: true });
  let names: string[];
  try {
    names = await fs.readdir(BUNDLED_DIR);
  } catch {
    return;
  }
  for (const name of names.filter((n) => n.endsWith(".md"))) {
    const target = path.join(dest, name);
    try {
      await fs.access(target);
    } catch {
      await fs.copyFile(path.join(BUNDLED_DIR, name), target);
    }
  }
}

export async function readTeachingMarkdown(dataDir: string, teachingFile: string): Promise<string> {
  await ensureTeachingSeeded(dataDir);
  const safe = path.basename(teachingFile);
  const p = path.join(trainingTeachingDir(dataDir), safe);
  return await fs.readFile(p, "utf8");
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
