import categoriesJson from "./categories.json";
import type { TrainingCategory } from "./types.js";

const categories = (categoriesJson as { categories: TrainingCategory[] }).categories;

export const COPYBOOK_CATEGORY_ID = "cat-copybook";

export function listCategories(): TrainingCategory[] {
  return [...categories].sort((a, b) => a.order - b.order);
}

export function listTechniqueCategories(): TrainingCategory[] {
  return listCategories().filter((c) => c.id !== COPYBOOK_CATEGORY_ID);
}

export function getCategory(id: string): TrainingCategory {
  const cat = categories.find((c) => c.id === id);
  if (!cat) throw new Error(`Unknown category: ${id}`);
  return cat;
}

export function isValidCategoryId(id: string): boolean {
  return categories.some((c) => c.id === id);
}
