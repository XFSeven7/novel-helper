import fs from "node:fs/promises";
import path from "node:path";
import type { CustomPersonasFile, ReaderPersona } from "./types.js";
import { getBuiltinPersonas } from "./builtin.js";

/** 全库共享的扩展读者（所有书共用） */
function globalCustomPath(dataDir: string) {
  return path.join(dataDir, "_settings", "reader-personas", "custom.json");
}

function legacyCustomPath(dataDir: string, bookId: string) {
  return path.join(dataDir, bookId, "meta", "reader-personas", "custom.json");
}

async function migrateLegacyCustomPersonasIfNeeded(dataDir: string): Promise<void> {
  try {
    await fs.access(globalCustomPath(dataDir));
    return;
  } catch {
    /* 全局文件不存在，尝试合并各书旧数据 */
  }

  const byId = new Map<string, ReaderPersona>();
  let lastInviteAt: string | undefined;

  let entries: { name: string; isDirectory: () => boolean }[] = [];
  try {
    entries = await fs.readdir(dataDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith("_")) continue;
    try {
      const raw = JSON.parse(
        await fs.readFile(legacyCustomPath(dataDir, ent.name), "utf8")
      ) as CustomPersonasFile;
      for (const p of raw.personas ?? []) {
        if (p?.id) byId.set(p.id, p);
      }
      if (raw.lastInviteAt && (!lastInviteAt || raw.lastInviteAt > lastInviteAt)) {
        lastInviteAt = raw.lastInviteAt;
      }
    } catch {
      /* 该书无旧读者文件 */
    }
  }

  if (!byId.size) return;

  await writeCustomPersonas(dataDir, {
    version: 1,
    lastInviteAt,
    personas: [...byId.values()]
  });
  console.log("[reader-personas] 已从各书目录迁移扩展读者到全局池", { count: byId.size });
}

export async function readCustomPersonas(dataDir: string): Promise<CustomPersonasFile> {
  await migrateLegacyCustomPersonasIfNeeded(dataDir);
  try {
    const raw = JSON.parse(await fs.readFile(globalCustomPath(dataDir), "utf8")) as CustomPersonasFile;
    return {
      ...raw,
      version: 1,
      personas: Array.isArray(raw.personas) ? raw.personas : []
    };
  } catch {
    return { version: 1, personas: [] };
  }
}

export async function writeCustomPersonas(dataDir: string, file: CustomPersonasFile): Promise<void> {
  const dir = path.dirname(globalCustomPath(dataDir));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(globalCustomPath(dataDir), JSON.stringify(file, null, 2), "utf8");
}

/** 内置 100 + 全库共享扩展读者 */
export async function loadEffectivePersonas(dataDir: string): Promise<ReaderPersona[]> {
  const custom = await readCustomPersonas(dataDir);
  const byId = new Map<string, ReaderPersona>();
  for (const p of getBuiltinPersonas()) byId.set(p.id, p);
  for (const p of custom.personas) byId.set(p.id, p);
  return [...byId.values()];
}

export function personaById(pool: ReaderPersona[], id: string): ReaderPersona | undefined {
  return pool.find((p) => p.id === id);
}
