import { execFile, spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function normalizeTargetPath(targetPath: string) {
  return targetPath.trim().replace(/[\r\n\u0000]+/g, "");
}

function windowsPowerShellExe() {
  const root = process.env.SystemRoot || "C:\\Windows";
  return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function escapePowerShellSingleQuoted(s: string) {
  return s.replace(/'/g, "''");
}

function launchDetached(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function openWindowsFolder(resolved: string): Promise<void> {
  const winPath = path.win32.normalize(resolved);
  const psPath = escapePowerShellSingleQuoted(winPath);
  const errors: string[] = [];

  try {
    await launchDetached(windowsPowerShellExe(), [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Invoke-Item -LiteralPath '${psPath}'`
    ]);
    return;
  } catch (e: any) {
    errors.push(e?.message || String(e));
  }

  try {
    const comSpec = process.env.ComSpec || "cmd.exe";
    await launchDetached(comSpec, ["/d", "/c", "start", "", "explorer.exe", winPath]);
    return;
  } catch (e: any) {
    errors.push(e?.message || String(e));
  }

  try {
    await launchDetached("explorer.exe", [winPath]);
    return;
  } catch (e: any) {
    errors.push(e?.message || String(e));
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

  const platform = process.platform;
  if (platform === "darwin") {
    await execFileAsync("open", [resolved]);
    return;
  }
  if (platform === "win32") {
    await openWindowsFolder(resolved);
    return;
  }
  if (platform === "linux") {
    await execFileAsync("xdg-open", [resolved]);
    return;
  }
  throw new Error(`当前系统 (${platform}) 暂不支持在文件管理器中打开文件夹。`);
}
