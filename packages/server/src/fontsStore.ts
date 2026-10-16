import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "./dataDirContext.js";
import { patchUiPrefs, readUiPrefs } from "./uiPrefs.js";

export type CustomFontEntry = {
  id: string;
  displayName: string;
  originalName: string;
  mime: string;
  relativePath: string;
  uploadedAt: string;
};

export type FontPreset = { id: string; displayName: string };

export const FONT_PRESETS: FontPreset[] = [
  { id: "system", displayName: "系统默认" },
  { id: "sans", displayName: "无衬线" },
  { id: "serif", displayName: "衬线" },
  { id: "song", displayName: "宋体风格" },
  { id: "kai", displayName: "楷体风格" }
];

export const MAX_FONT_BYTES = 8 * 1024 * 1024;

const ALLOWED_EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);

function fontsDir() {
  return path.join(getDataDir(), "_settings", "fonts");
}

function manifestPath() {
  return path.join(getDataDir(), "_settings", "fonts.json");
}

async function readManifest(): Promise<CustomFontEntry[]> {
  try {
    const raw = JSON.parse(await fs.readFile(manifestPath(), "utf8"));
    return Array.isArray(raw) ? (raw as CustomFontEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeManifest(list: CustomFontEntry[]) {
  await fs.mkdir(path.dirname(manifestPath()), { recursive: true });
  await fs.writeFile(manifestPath(), JSON.stringify(list, null, 2), "utf8");
}

function extOf(name: string) {
  return path.extname(name || "").toLowerCase();
}

export async function listCustomFonts(): Promise<CustomFontEntry[]> {
  return await readManifest();
}

export async function saveUploadedFont(input: {
  originalName: string;
  mime: string;
  buf: Buffer;
}): Promise<CustomFontEntry> {
  const ext = extOf(input.originalName);
  if (!ALLOWED_EXT.has(ext)) throw new Error("不支持的字体格式（仅 ttf/otf/woff/woff2）");
  if (input.buf.length > MAX_FONT_BYTES) throw new Error("字体文件过大（上限 8MB）");
  const id = crypto.randomUUID().replace(/-/g, "");
  const relativePath = `${id}${ext}`;
  const displayName = path.basename(input.originalName, ext) || id;
  await fs.mkdir(fontsDir(), { recursive: true });
  await fs.writeFile(path.join(fontsDir(), relativePath), input.buf);
  const entry: CustomFontEntry = {
    id,
    displayName,
    originalName: input.originalName,
    mime: input.mime || "application/octet-stream",
    relativePath,
    uploadedAt: new Date().toISOString()
  };
  const list = await readManifest();
  list.push(entry);
  await writeManifest(list);
  return entry;
}

export async function resolveFontFilePath(
  id: string
): Promise<{ absPath: string; entry: CustomFontEntry } | null> {
  const list = await readManifest();
  const entry = list.find((e) => e.id === id);
  if (!entry) return null;
  const absPath = path.join(fontsDir(), entry.relativePath);
  try {
    await fs.access(absPath);
  } catch {
    return null;
  }
  return { absPath, entry };
}

export async function deleteCustomFont(id: string): Promise<{ deleted: boolean }> {
  const list = await readManifest();
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return { deleted: false };
  const [entry] = list.splice(idx, 1);
  await writeManifest(list);
  try {
    await fs.unlink(path.join(fontsDir(), entry.relativePath));
  } catch {
    // ignore missing file
  }
  const prefs = await readUiPrefs();
  if (prefs.fontId === `custom:${id}`) {
    await patchUiPrefs({ fontId: "system" });
  }
  return { deleted: true };
}
