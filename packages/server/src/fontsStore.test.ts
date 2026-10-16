import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDataDir, initDataDir, setDataDir } from "./dataDirContext.js";
import {
  deleteCustomFont,
  listCustomFonts,
  MAX_FONT_BYTES,
  resolveFontFilePath,
  saveUploadedFont
} from "./fontsStore.js";
import { patchUiPrefs, readUiPrefs } from "./uiPrefs.js";

let tmp = "";
let prev = "";

beforeEach(async () => {
  prev = getDataDir();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nh-fonts-"));
  await fs.mkdir(path.join(tmp, "_settings"), { recursive: true });
  initDataDir(tmp);
});

afterEach(async () => {
  setDataDir(prev);
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("fontsStore", () => {
  it("uploads ttf and lists it", async () => {
    const buf = Buffer.from("not-a-real-font-but-ok-for-store");
    const entry = await saveUploadedFont({
      originalName: "MyFont.ttf",
      mime: "font/ttf",
      buf
    });
    expect(entry.displayName).toBe("MyFont");
    expect(entry.originalName).toBe("MyFont.ttf");
    const list = await listCustomFonts();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(entry.id);
    const resolved = await resolveFontFilePath(entry.id);
    expect(resolved?.absPath).toContain(entry.relativePath);
  });

  it("rejects unsupported extension", async () => {
    await expect(
      saveUploadedFont({ originalName: "x.exe", mime: "application/octet-stream", buf: Buffer.from("x") })
    ).rejects.toThrow(/不支持/);
  });

  it("rejects oversize", async () => {
    const buf = Buffer.alloc(MAX_FONT_BYTES + 1);
    await expect(
      saveUploadedFont({ originalName: "big.woff2", mime: "font/woff2", buf })
    ).rejects.toThrow(/过大|8MB|上限/);
  });

  it("delete removes file and resets fontId when selected", async () => {
    const entry = await saveUploadedFont({
      originalName: "A.otf",
      mime: "font/otf",
      buf: Buffer.from("abc")
    });
    await patchUiPrefs({ fontId: `custom:${entry.id}` });
    await deleteCustomFont(entry.id);
    expect(await listCustomFonts()).toHaveLength(0);
    const prefs = await readUiPrefs();
    expect(prefs.fontId).toBe("system");
  });
});
