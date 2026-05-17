import fs from "node:fs/promises";
import path from "node:path";
import { listNovels } from "./fsStore.js";

export async function assertDirEmpty(dir: string) {
  const entries = await fs.readdir(dir);
  if (entries.length > 0) {
    throw new Error("迁移目标须为空文件夹，请重新选择。");
  }
}

export async function copyDataDirContents(source: string, target: string) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const ent of entries) {
    const from = path.join(source, ent.name);
    const to = path.join(target, ent.name);
    await fs.cp(from, to, { recursive: true, force: true });
  }
}

export async function verifyMigratedData(source: string, target: string) {
  const [srcBooks, tgtBooks] = await Promise.all([listNovels(source), listNovels(target)]);
  if (srcBooks.length !== tgtBooks.length) {
    throw new Error(`迁移校验失败：书籍数量不一致（源 ${srcBooks.length}，目标 ${tgtBooks.length}）。`);
  }
  const srcSettings = path.join(source, "_settings", "model-configs.json");
  try {
    await fs.access(srcSettings);
    const tgtSettings = path.join(target, "_settings", "model-configs.json");
    await fs.access(tgtSettings);
  } catch {
    // 源无模型配置则跳过
  }
}

export async function cleanupDirBestEffort(dir: string) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export async function deleteDataDirTree(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}
