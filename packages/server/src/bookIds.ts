import path from "node:path";

/** UUID v4（小写，带连字符） */
const BOOK_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBookId(value: string): boolean {
  return BOOK_ID_RE.test(value.trim());
}

export function novelDir(dataDir: string, bookId: string): string {
  return path.join(dataDir, bookId);
}

/** 迁移时跳过的数据目录顶层文件夹 */
export const RESERVED_DATA_TOP_DIRS = new Set([
  "_sessions",
  "node_modules",
  ".git",
  ".cursor"
]);
