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
  const cmd = windowsCmdExe();
  const args = ["/d", "/c", "start", "", winPath];
  log("try cmd-start", { cmd, args });
  await execFileAsync(cmd, args, { windowsHide: true });
  log("cmd-start finished (no throw)");
}

async function openViaPowerShell(winPath: string): Promise<void> {
  const psPath = escapePowerShellSingleQuoted(winPath);
  const exe = windowsPowerShellExe();
  const args = [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Invoke-Item -LiteralPath '${psPath}'`
  ];
  log("try powershell Invoke-Item", { exe, winPath, psPath });
  await execFileAsync(exe, args, { windowsHide: true, timeout: 30_000 });
  log("powershell finished (no throw)");
}

async function openViaExplorerExe(winPath: string): Promise<void> {
  log("try explorer.exe", { winPath });
  try {
    await execFileAsync("explorer.exe", [winPath], { windowsHide: true });
    log("explorer.exe finished (no throw)");
  } catch (e) {
    if (isBenignWindowsOpenError(e)) {
      log("explorer.exe benign error (treated as ok)", e);
      return;
    }
    throw e;
  }
}

async function openWindowsFolder(winPath: string): Promise<void> {
  const methods: Array<{ name: string; fn: (p: string) => Promise<void> }> = [
    { name: "cmd-start", fn: openViaCmdStart },
    { name: "powershell", fn: openViaPowerShell },
    { name: "explorer.exe", fn: openViaExplorerExe }
  ];
  const errors: string[] = [];
  for (const { name, fn } of methods) {
    try {
      await fn(winPath);
      log("SUCCESS via", name, { winPath });
      return;
    } catch (e: any) {
      const msg = e?.message || String(e);
      errors.push(`${name}: ${msg}`);
      logError("FAILED", name, { message: msg, code: e?.code, stderr: e?.stderr });
    }
  }
  throw new Error(
    `无法在文件管理器中打开文件夹。${errors.length ? ` ${errors[errors.length - 1]}` : ""}`
  );
}

export async function openPathInFileManager(targetPath: string): Promise<void> {
  const normalized = normalizeTargetPath(targetPath);
  const resolved = path.resolve(normalized);
  const wsl = isWslEnvironment();

  log("begin", {
    platform: process.platform,
    wsl,
    cwd: process.cwd(),
    input: targetPath,
    normalized,
    resolved,
    getDataDirHint: process.env.NOVEL_HELPER_DATA_DIR || "(env not set)"
  });

  try {
    const st = await fsp.stat(resolved);
    log("stat ok", { isDirectory: st.isDirectory(), mode: st.mode });
    if (!st.isDirectory()) throw new Error("路径不是文件夹。");
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      logError("stat ENOENT", resolved);
      throw new Error("文件夹不存在。");
    }
    logError("stat error", e);
    throw e;
  }

  if (process.platform === "darwin") {
    log("darwin open", resolved);
    await execFileAsync("open", [resolved]);
    log("SUCCESS darwin open");
    return;
  }

  if (process.platform === "win32" || wsl) {
    const winPath = toWindowsPath(resolved);
    log("windows branch", { winPath, from: resolved });
    await openWindowsFolder(winPath);
    return;
  }

  if (process.platform === "linux") {
    log("linux xdg-open", resolved);
    await execFileAsync("xdg-open", [resolved]);
    log("SUCCESS xdg-open");
    return;
  }

  throw new Error(`当前系统 (${process.platform}) 暂不支持在文件管理器中打开文件夹。`);
}
