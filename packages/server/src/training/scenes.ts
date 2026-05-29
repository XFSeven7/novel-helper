import scenesJson from "./scenes.json";
import type { TrainingScene } from "./types.js";

const scenes = (scenesJson as { scenes: TrainingScene[] }).scenes;

export function listScenes(): TrainingScene[] {
  return [...scenes].sort((a, b) => a.order - b.order);
}

export function getScene(id: string): TrainingScene {
  const scene = scenes.find((s) => s.id === id);
  if (!scene) throw new Error(`Unknown scene: ${id}`);
  return scene;
}

export function isValidSceneId(id: string): boolean {
  return scenes.some((s) => s.id === id);
}
