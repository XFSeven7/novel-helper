import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveDataDir(explicit?: string) {
  // 默认写到仓库根目录下，方便你直接看到生成的文件；也可以用 env 覆盖
  const base = explicit?.trim() || process.env.NOVEL_HELPER_DATA_DIR?.trim() || "";
  if (base) return path.resolve(base);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..", "..", "..");
  // 你要求的结构：book/<bookSlug>/chapters + story/*
  return path.resolve(repoRoot, "book");
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

