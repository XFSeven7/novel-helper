import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

/** 将 /mnt/e/foo 或已有的 E:\foo 转为 Windows 路径 */
export function toWindowsPath(p: string): string {
  const trimmed = normalizeTargetPath(p);
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return path.win32.normalize(trimmed);
  const abs = path.resolve(trimmed);
  const m = abs.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m) return path.win32.normalize(`${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}`);
  return path.win32.normalize(trimmed);
}

function windowsPowerShellExe() {
  const root = process.env.SystemRoot || "C:\\Windows";
  return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function escapePowerShellSingleQuoted(s: string) {
  return s.replace(/'/g, "''");
}

function isBenignWindowsOpenError(e: unknown) {
  const msg = String((e as any)?.message || e);
  return /exit code|command failed|explorer/i.test(msg);
}

function windowsCmdExe(): string {
  if (process.platform === "win32") {
    return process.env.ComSpec || path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  }
  const wslCmd = "/mnt/c/Windows/System32/cmd.exe";
  if (fs.existsSync(wslCmd)) return wslCmd;
  return "cmd.exe";
}

/** 用 Windows「开始」关联打开文件夹（不要用 start explorer.exe，否则可能只启动空窗口） */
async function openViaCmdStart(winPath: string): Promise<void> {
  await execFileAsync(windowsCmdExe(), ["/d", "/c", "start", "", winPath], { windowsHide: true });
}

async function openViaPowerShell(winPath: string): Promise<void> {
  const psPath = escapePowerShellSingleQuoted(winPath);
  await execFileAsync(
    windowsPowerShellExe(),
    [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Invoke-Item -LiteralPath '${psPath}'`
    ],
    { windowsHide: true, timeout: 30_000 }
  );
}

async function openViaExplorerExe(winPath: string): Promise<void> {
  try {
    await execFileAsync("explorer.exe", [winPath], { windowsHide: true });
  } catch (e) {
    if (isBenignWindowsOpenError(e)) return;
    throw e;
  }
}

async function openWindowsFolder(winPath: string): Promise<void> {
  const errors: string[] = [];
  for (const fn of [openViaCmdStart, openViaPowerShell, openViaExplorerExe]) {
    try {
      await fn(winPath);
      return;
    } catch (e: any) {
      errors.push(e?.message || String(e));
    }
  }
  throw new Error(
    `无法在文件管理器中打开文件夹。${errors.length ? ` ${errors[errors.length - 1]}` : ""}`
  );
}

export async function openPathInFileManager(targetPath: string): Promise<void> {
  const resolved = path.resolve(normalizeTargetPath(targetPath));
  try {
    const st = await fsp.stat(resolved);
    if (!st.isDirectory()) throw new Error("路径不是文件夹。");
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new Error("文件夹不存在。");
    throw e;
  }

  if (process.platform === "darwin") {
    await execFileAsync("open", [resolved]);
    return;
  }

  if (process.platform === "win32" || isWslEnvironment()) {
    await openWindowsFolder(toWindowsPath(resolved));
    return;
  }

  if (process.platform === "linux") {
    await execFileAsync("xdg-open", [resolved]);
    return;
  }

  throw new Error(`当前系统 (${process.platform}) 暂不支持在文件管理器中打开文件夹。`);
}
