import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDataDir, initDataDir, setDataDir } from "./dataDirContext.js";
import {
  isUiPrefsEmpty,
  mergeUiPrefs,
  patchUiPrefs,
  readUiPrefs,
  type UiPrefsFile
} from "./uiPrefs.js";

let tmp = "";
let prevDataDir = "";

beforeEach(async () => {
  prevDataDir = getDataDir();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nh-ui-prefs-"));
  await fs.mkdir(path.join(tmp, "_settings"), { recursive: true });
  initDataDir(tmp);
});

afterEach(async () => {
  setDataDir(prevDataDir);
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("uiPrefs", () => {
  it("read missing file returns empty versioned prefs", async () => {
    const prefs = await readUiPrefs();
    expect(prefs).toEqual({ version: 1 });
    expect(isUiPrefsEmpty(prefs)).toBe(true);
  });

  it("merges byBook and layout3Splits without clobbering siblings", () => {
    const base: UiPrefsFile = {
      version: 1,
      navCollapsed: true,
      layout3Splits: { navW: 300, guidanceW: 400, rightW: 420 },
      byBook: {
        b1: {
          notes: { sortDesc: true },
          writingGuidance: { sortDesc: false, showStarredOnly: true }
        }
      }
    };
    const next = mergeUiPrefs(base, {
      layout3Splits: { navW: 500 } as any,
      byBook: {
        b1: {
          writingGuidance: { activeNotebookId: "nb1" }
        }
      }
    });
    expect(next.navCollapsed).toBe(true);
    expect(next.layout3Splits?.navW).toBe(500);
    expect(next.layout3Splits?.guidanceW).toBe(400);
    expect(next.byBook?.b1.notes?.sortDesc).toBe(true);
    expect(next.byBook?.b1.writingGuidance?.sortDesc).toBe(false);
    expect(next.byBook?.b1.writingGuidance?.showStarredOnly).toBe(true);
    expect(next.byBook?.b1.writingGuidance?.activeNotebookId).toBe("nb1");
  });

  it("clamps layout navW into 240–560", () => {
    const next = mergeUiPrefs({ version: 1 }, {
      layout3Splits: { navW: 10, guidanceW: 400, rightW: 420 }
    });
    expect(next.layout3Splits?.navW).toBe(240);
  });

  it("patchUiPrefs persists to disk", async () => {
    await patchUiPrefs({ chapterSortDesc: true, themeId: "forest" });
    const again = await readUiPrefs();
    expect(again.chapterSortDesc).toBe(true);
    expect(again.themeId).toBe("forest");
    expect(isUiPrefsEmpty(again)).toBe(false);
  });
});
