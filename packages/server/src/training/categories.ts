import categoriesJson from "./categories.json";
import type { TrainingCategory } from "./types.js";

const categories = (categoriesJson as { categories: TrainingCategory[] }).categories;

export function listCategories(): TrainingCategory[] {
  return [...categories].sort((a, b) => a.order - b.order);
}

export function getCategory(id: string): TrainingCategory {
  const cat = categories.find((c) => c.id === id);
  if (!cat) throw new Error(`Unknown category: ${id}`);
  return cat;
}

export function isValidCategoryId(id: string): boolean {
  return categories.some((c) => c.id === id);
}
