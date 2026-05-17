import { execFile } from "node:child_process";
import path from "node:path";
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

function windowsPowerShellExe() {
  const root = process.env.SystemRoot || "C:\\Windows";
  return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

async function runWindowsPickerScript(script: string): Promise<string> {
  const exe = windowsPowerShellExe();
  const { stdout } = await execFileAsync(
    exe,
    ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
    { timeout: 600_000, windowsHide: true }
  );
  return stdout.trim();
}

/** 临时置顶父窗体，避免文件夹对话框被浏览器/IDE 挡在后面 */
const WINDOWS_OWNER_FORM_PS = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NhWin32 {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
function New-ForegroundOwnerForm {
  $f = New-Object System.Windows.Forms.Form
  $f.TopMost = $true
  $f.ShowInTaskbar = $false
  $f.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $f.Size = New-Object System.Drawing.Size(1, 1)
  $f.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
  $f.Opacity = 0.01
  [void]$f.Show()
  [void]$f.Activate()
  [void]$f.BringToFront()
  [void][NhWin32]::SetForegroundWindow($f.Handle)
  return $f
}
`.trim();

async function pickDirectoryWindowsWinForms(prompt: string): Promise<PickDirectoryResult> {
  const desc = prompt.replace(/'/g, "''");
  const script = [
    WINDOWS_OWNER_FORM_PS,
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "$owner = New-ForegroundOwnerForm",
    "$dlg = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dlg.Description = '${desc}'`,
    "$dlg.ShowNewFolderButton = $true",
    "if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::Out.WriteLine($dlg.SelectedPath)",
    "}",
    "$owner.Dispose()"
  ].join("; ");
  const picked = await runWindowsPickerScript(script);
  if (!picked) return { cancelled: true };
  return { cancelled: false, path: picked };
}

/** Shell.Application COM：在部分环境（含从 Node 子进程启动）比 WinForms 更可靠 */
async function pickDirectoryWindowsShell(prompt: string): Promise<PickDirectoryResult> {
  const desc = prompt.replace(/'/g, "''");
  const script = [
    WINDOWS_OWNER_FORM_PS,
    "$owner = New-ForegroundOwnerForm",
    "$shell = New-Object -ComObject Shell.Application",
    `$folder = $shell.BrowseForFolder([int]$owner.Handle, '${desc}', 0x40, $env:USERPROFILE)`,
    "if ($null -ne $folder) {",
    "  $p = $folder.Self.Path",
    "  if ($p) { [Console]::Out.WriteLine($p) }",
    "}",
    "$owner.Dispose()"
  ].join("; ");
  const picked = await runWindowsPickerScript(script);
  if (!picked) return { cancelled: true };
  return { cancelled: false, path: picked };
}

async function pickDirectoryWindows(prompt: string): Promise<PickDirectoryResult> {
  const errors: string[] = [];
  try {
    return await pickDirectoryWindowsWinForms(prompt);
  } catch (e: any) {
    const msg = String(e?.stderr || e?.message || e);
    if (/canceled|cancelled|0x800704c7/i.test(msg)) return { cancelled: true };
    errors.push(msg);
  }
  try {
    return await pickDirectoryWindowsShell(prompt);
  } catch (e: any) {
    const msg = String(e?.stderr || e?.message || e);
    if (/canceled|cancelled|0x800704c7/i.test(msg)) return { cancelled: true };
    errors.push(msg);
  }
  throw new Error(
    `无法打开文件夹选择对话框。请手动输入路径。${errors.length ? ` (${errors[errors.length - 1]})` : ""}`
  );
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
