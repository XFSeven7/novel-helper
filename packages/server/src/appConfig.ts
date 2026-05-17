import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type DataDirSource = "env" | "file" | "default";

export type AppSettingsResponse = {
  effectiveDataDir: string;
  source: DataDirSource;
  fileDataDir: string | null;
  envLocked: boolean;
};

export function repoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..");
}

export function appConfigPath() {
  return path.join(repoRoot(), ".novel-helper", "config.json");
}

type AppConfigFile = { dataDir?: string };

export async function readAppConfigFile(): Promise<AppConfigFile> {
  try {
    const raw = await fsp.readFile(appConfigPath(), "utf8");
    return JSON.parse(raw) as AppConfigFile;
  } catch {
    return {};
  }
}

export async function writeAppConfigFile(dataDir: string) {
  const p = appConfigPath();
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, JSON.stringify({ dataDir }, null, 2), "utf8");
}

function readFileDataDir(): string | null {
  try {
    const raw = fs.readFileSync(appConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as AppConfigFile;
    if (typeof parsed.dataDir === "string" && parsed.dataDir.trim()) {
      return path.resolve(parsed.dataDir.trim());
    }
  } catch {
    // ignore
  }
  return null;
}

export function resolveDataDirWithSource(explicit?: string): AppSettingsResponse {
  const defaultDir = path.resolve(repoRoot(), "book");
  const envRaw = explicit?.trim() || process.env.NOVEL_HELPER_DATA_DIR?.trim() || "";
  if (envRaw) {
    return {
      effectiveDataDir: path.resolve(envRaw),
      source: "env",
      fileDataDir: null,
      envLocked: true
    };
  }
  const fileDataDir = readFileDataDir();
  if (fileDataDir) {
    return { effectiveDataDir: fileDataDir, source: "file", fileDataDir, envLocked: false };
  }
  return { effectiveDataDir: defaultDir, source: "default", fileDataDir: null, envLocked: false };
}

export async function validateAndNormalizeDataDir(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("路径不能为空。");
  const resolved = path.resolve(trimmed);
  try {
    await fsp.mkdir(resolved, { recursive: true });
    await fsp.access(resolved, fs.constants.W_OK);
  } catch {
    throw new Error("无法创建或写入该目录，请检查路径与权限。");
  }
  return resolved;
}
