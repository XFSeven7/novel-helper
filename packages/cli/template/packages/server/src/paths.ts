import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveDataDir(explicit?: string) {
  const base = explicit?.trim() || process.env.NOVEL_HELPER_DATA_DIR?.trim() || "";
  if (base) return path.resolve(base);
  // 默认写到项目根目录的 book/
  const here = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(here, "..", "..", "..", "..");
  return path.resolve(projectRoot, "book");
}

export function safeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

