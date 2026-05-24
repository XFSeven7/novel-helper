import fs from "node:fs/promises";
import path from "node:path";

export type AuditFileWrite = {
  relativePath: string;
  content: string;
};

function auditRoot(dataDir: string, bookId: string) {
  return path.join(dataDir, bookId, "meta", "audit");
}

/** 原子提交：先备份将被覆盖的文件，写入 .tmp 后 rename；失败则尽力恢复备份 */
export async function commitAuditFiles(
  dataDir: string,
  bookId: string,
  writes: AuditFileWrite[]
): Promise<void> {
  const root = auditRoot(dataDir, bookId);
  const backups: Array<{ absPath: string; content: string | null }> = [];

  for (const w of writes) {
    const absPath = path.join(root, w.relativePath);
    try {
      backups.push({ absPath, content: await fs.readFile(absPath, "utf8") });
    } catch {
      backups.push({ absPath, content: null });
    }
  }

  const tmpPaths: string[] = [];
  try {
    for (const w of writes) {
      const absPath = path.join(root, w.relativePath);
      const tmpPath = `${absPath}.tmp-${Date.now()}`;
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(tmpPath, w.content, "utf8");
      tmpPaths.push(tmpPath);
      await fs.rename(tmpPath, absPath);
    }
  } catch (e) {
    for (const b of backups) {
      try {
        if (b.content === null) await fs.rm(b.absPath, { force: true });
        else await fs.writeFile(b.absPath, b.content, "utf8");
      } catch {
        // best effort
      }
    }
    for (const t of tmpPaths) {
      try {
        await fs.rm(t, { force: true });
      } catch {
        // ignore
      }
    }
    throw e;
  }
}

export async function rollbackAuditStaging(stagingRoot: string): Promise<void> {
  await fs.rm(stagingRoot, { recursive: true, force: true });
}
