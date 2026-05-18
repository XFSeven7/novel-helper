import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function openPathInFileManager(targetPath: string): Promise<void> {
  const resolved = path.resolve(targetPath);
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
    await execFileAsync("explorer", [resolved], { windowsHide: true });
    return;
  }
  if (platform === "linux") {
    await execFileAsync("xdg-open", [resolved]);
    return;
  }
  throw new Error(`当前系统 (${platform}) 暂不支持在文件管理器中打开文件夹。`);
}
