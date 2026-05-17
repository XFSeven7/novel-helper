import { resolveDataDirWithSource } from "./appConfig.js";

export { repoRoot, appConfigPath } from "./appConfig.js";

export function resolveDataDir(explicit?: string) {
  return resolveDataDirWithSource(explicit).effectiveDataDir;
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
