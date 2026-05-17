import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PickDirectoryResult = { cancelled: true } | { cancelled: false; path: string };

async function pickDirectoryMac(prompt: string): Promise<PickDirectoryResult> {
  const escaped = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `POSIX path of (choose folder with prompt "${escaped}")`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 600_000 });
    const picked = stdout.trim();
    if (!picked) return { cancelled: true };
    return { cancelled: false, path: picked };
  } catch (e: any) {
    if (e?.code === 1 || /User canceled/i.test(String(e?.stderr || e?.message || ""))) {
      return { cancelled: true };
    }
    throw e;
  }
}

async function pickDirectoryWindows(prompt: string): Promise<PickDirectoryResult> {
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dlg = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dlg.Description = '${prompt.replace(/'/g, "''")}'`,
    "if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath }"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { timeout: 600_000 }
    );
    const picked = stdout.trim();
    if (!picked) return { cancelled: true };
    return { cancelled: false, path: picked };
  } catch (e: any) {
    if (/canceled|cancelled/i.test(String(e?.stderr || e?.message || ""))) return { cancelled: true };
    throw e;
  }
}

async function pickDirectoryLinux(prompt: string): Promise<PickDirectoryResult> {
  const tryZenity = async (): Promise<PickDirectoryResult> => {
    const { stdout } = await execFileAsync(
      "zenity",
      ["--file-selection", "--directory", "--title", prompt],
      { timeout: 600_000 }
    );
    const picked = stdout.trim();
    if (!picked) return { cancelled: true };
    return { cancelled: false, path: picked };
  };
  const tryKdialog = async (): Promise<PickDirectoryResult> => {
    const { stdout } = await execFileAsync(
      "kdialog",
      ["--getexistingdirectory", ".", "--title", prompt],
      { timeout: 600_000 }
    );
    const picked = stdout.trim();
    if (!picked) return { cancelled: true };
    return { cancelled: false, path: picked };
  };

  try {
    return await tryZenity();
  } catch (e: any) {
    if (e?.code === 1) return { cancelled: true as const };
    try {
      return await tryKdialog();
    } catch (e2: any) {
      if (e2?.code === 1) return { cancelled: true as const };
      throw new Error("未找到 zenity 或 kdialog，无法打开文件夹选择对话框。请手动输入路径。");
    }
  }
}

export async function pickDataDirectory(
  prompt = "选择写作数据保存目录"
): Promise<PickDirectoryResult> {
  const platform = process.platform;
  if (platform === "darwin") return pickDirectoryMac(prompt);
  if (platform === "win32") return pickDirectoryWindows(prompt);
  if (platform === "linux") return pickDirectoryLinux(prompt);
  throw new Error(`当前系统 (${platform}) 暂不支持图形化选文件夹，请手动输入路径。`);
}
