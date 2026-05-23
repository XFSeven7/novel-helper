import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NovelMeta } from "./fsStore.js";
import { isBookId, RESERVED_DATA_TOP_DIRS } from "./bookIds.js";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 将旧 slug 目录迁移为 bookId 目录（幂等）。
 * - 已有 meta.bookId 且目录名一致：跳过
 * - 目录名已是 UUID 但 meta 无 bookId：补写 meta.bookId
 * - 否则：生成 UUID，rename 目录，写 meta.bookId，原目录名写入 meta.slug
 */
export async function migrateBookIds(dataDir: string): Promise<{ migrated: number; skipped: number }> {
  let migrated = 0;
  let skipped = 0;

  await fs.mkdir(dataDir, { recursive: true });
  const entries = await fs.readdir(dataDir, { withFileTypes: true });

  for (const ent of entries) {
    if (!ent.isDirectory() || RESERVED_DATA_TOP_DIRS.has(ent.name)) {
      skipped++;
      continue;
    }

    const dirName = ent.name;
    const metaPath = path.join(dataDir, dirName, "meta.json");
    if (!(await exists(metaPath))) {
      skipped++;
      continue;
    }

    let raw: string;
    try {
      raw = await fs.readFile(metaPath, "utf8");
    } catch {
      skipped++;
      continue;
    }

    let parsed: NovelMeta;
    try {
      parsed = JSON.parse(raw) as NovelMeta;
    } catch {
      skipped++;
      continue;
    }

    const existingId = typeof parsed.bookId === "string" ? parsed.bookId.trim() : "";

    if (existingId && isBookId(existingId)) {
      if (dirName === existingId) {
        skipped++;
        continue;
      }
      const targetDir = path.join(dataDir, existingId);
      if (await exists(targetDir)) {
        console.warn(`[migrateBookIds] 目标目录已存在，跳过: ${dirName} -> ${existingId}`);
        skipped++;
        continue;
      }
      await fs.rename(path.join(dataDir, dirName), targetDir);
      migrated++;
      continue;
    }

    if (isBookId(dirName)) {
      const next: NovelMeta = {
        ...parsed,
        bookId: dirName,
        slug: parsed.slug?.trim() || undefined
      };
      await fs.writeFile(path.join(dataDir, dirName, "meta.json"), JSON.stringify(next, null, 2), "utf8");
      migrated++;
      continue;
    }

    const bookId = crypto.randomUUID();
    const targetDir = path.join(dataDir, bookId);
    if (await exists(targetDir)) {
      console.warn(`[migrateBookIds] 冲突，跳过: ${dirName}`);
      skipped++;
      continue;
    }

    await fs.rename(path.join(dataDir, dirName), targetDir);

    const next: NovelMeta = {
      ...parsed,
      bookId,
      slug: parsed.slug?.trim() || dirName
    };
    await fs.writeFile(path.join(targetDir, "meta.json"), JSON.stringify(next, null, 2), "utf8");
    migrated++;
  }

  if (migrated > 0) {
    console.log(`[migrateBookIds] 已处理 ${migrated} 本书（含重命名/补 bookId）`);
  }

  return { migrated, skipped };
}
