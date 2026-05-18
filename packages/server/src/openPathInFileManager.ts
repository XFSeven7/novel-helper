import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const LOG = "[novel-helper:open-data-dir]";

function log(...args: unknown[]) {
  console.log(LOG, ...args);
}

function logError(...args: unknown[]) {
  console.error(LOG, ...args);
}

export type OpenPathResult = {
  ok: true;
  platform: NodeJS.Platform;
  wsl: boolean;
  resolved: string;
  winPath?: string;
  method: string;
};

export function normalizeTargetPath(targetPath: string) {
  return targetPath.trim().replace(/[\r\n\u0000]+/g, "");
}

export function isWslEnvironment() {
  if (process.platform !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    return /microsoft/i.test(fs.readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

export function toWindowsPath(p: string): string {
  const trimmed = normalizeTargetPath(p);
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return path.win32.normalize(trimmed);
  const abs = path.resolve(trimmed);
  const m = abs.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m) return path.win32.normalize(`${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}`);
  return path.win32.normalize(trimmed);
}

function windowsCmdExe(): string {
  if (process.platform === "win32") {
    return process.env.ComSpec || path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  }
  const wslCmd = "/mnt/c/Windows/System32/cmd.exe";
  if (fs.existsSync(wslCmd)) return wslCmd;
  return "cmd.exe";
}

function isBenignExplorerExit(e: unknown) {
  const msg = String((e as any)?.message || e);
  return /exit code|command failed|explorer/i.test(msg);
}

/**
 * 与用户在 CMD 中执行 `explorer "E:\path"` 等价：cmd /c explorer <path>
 */
async function openWindowsFolderViaCmdExplorer(winPath: string): Promise<void> {
  const cmd = windowsCmdExe();
  const args = ["/d", "/c", "explorer", winPath];
  log("cmd /c explorer", { cmd, args });
  try {
    await execFileAsync(cmd, args, { windowsHide: false });
    log("cmd /c explorer finished (exit 0)");
  } catch (e) {
    if (isBenignExplorerExit(e)) {
      log("cmd /c explorer benign exit (treated as ok)", e);
      return;
    }
    throw e;
  }
}

async function openWindowsFolder(winPath: string): Promise<string> {
  await openWindowsFolderViaCmdExplorer(winPath);
  return "cmd-explorer";
}

export async function openPathInFileManager(targetPath: string): Promise<OpenPathResult> {
  const normalized = normalizeTargetPath(targetPath);
  const resolved = path.resolve(normalized);
  const wsl = isWslEnvironment();

  log("begin", {
    platform: process.platform,
    wsl,
    cwd: process.cwd(),
    input: targetPath,
    normalized,
    resolved
  });

  try {
    const st = await fsp.stat(resolved);
    if (!st.isDirectory()) throw new Error("路径不是文件夹。");
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new Error("文件夹不存在。");
    throw e;
  }

  if (process.platform === "darwin") {
    await execFileAsync("open", [resolved]);
    return { ok: true, platform: process.platform, wsl, resolved, method: "open" };
  }

  if (process.platform === "win32" || wsl) {
    const winPath = toWindowsPath(resolved);
    log("windows branch", { winPath });
    const method = await openWindowsFolder(winPath);
    return { ok: true, platform: process.platform, wsl, resolved, winPath, method };
  }

  if (process.platform === "linux") {
    await execFileAsync("xdg-open", [resolved]);
    return { ok: true, platform: process.platform, wsl, resolved, method: "xdg-open" };
  }

  throw new Error(`当前系统 (${process.platform}) 暂不支持在文件管理器中打开文件夹。`);
}
