import {
  LAYOUT3_SPLIT_STORAGE_KEY,
  NAV_COLLAPSED_STORAGE_KEY,
  RIGHT_COLLAPSED_STORAGE_KEY,
  THEME_STORAGE_KEY
} from "../constants";
import { migrateLegacyTheme } from "../utils/themeStorage";
import type { UiPrefsBookSlice, UiPrefsFile, UiPrefsPatch } from "./types";

function ls(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string | null): T | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** useLocalStorageState 默认 JSON.stringify，旧值可能是带引号的 "\"default\"" */
function lsStoredString(key: string): string | null {
  const raw = ls(key);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
  } catch {
    // plain
  }
  return raw;
}

/** 扫描 localStorage，拼出一次性种子 patch（不含空字段） */
export function collectLocalStorageUiPrefsSeed(): UiPrefsPatch {
  const seed: UiPrefsPatch = {};

  const nav = ls(NAV_COLLAPSED_STORAGE_KEY);
  if (nav === "1" || nav === "0") seed.navCollapsed = nav === "1";

  const right = ls(RIGHT_COLLAPSED_STORAGE_KEY);
  if (right === "1" || right === "0") seed.rightCollapsed = right === "1";

  const splits = parseJson<{ navW?: number; guidanceW?: number; rightW?: number }>(ls(LAYOUT3_SPLIT_STORAGE_KEY));
  if (splits && typeof splits === "object") {
    seed.layout3Splits = {
      navW: typeof splits.navW === "number" ? splits.navW : 320,
      guidanceW: typeof splits.guidanceW === "number" ? splits.guidanceW : 400,
      rightW: typeof splits.rightW === "number" ? splits.rightW : 420
    };
  }

  const themeRaw = ls(THEME_STORAGE_KEY);
  if (themeRaw) seed.themeId = migrateLegacyTheme(themeRaw);

  const shelfTab = lsStoredString("novel-helper-shelf-tab");
  if (shelfTab === "books" || shelfTab === "planning") seed.shelfTab = shelfTab;

  const fontPx = Number(ls("novelHelper.mobileFontPx"));
  if (Number.isFinite(fontPx)) seed.mobileFontPx = fontPx;

  const phoneW = Number(ls("novelHelper.mobilePhoneW"));
  if (Number.isFinite(phoneW)) seed.mobilePhoneW = phoneW;

  const grading = ls("novel-helper.trainingGradingMode");
  if (grading === "infernal" || grading === "strict" || grading === "honest") {
    seed.trainingGradingMode = grading;
  }

  const treeW = Number(ls("training:treeNavWidth"));
  if (Number.isFinite(treeW)) seed.trainingTreeNavWidth = treeW;

  const learn = Number(ls("training:splitRatio:learn"));
  const practice = Number(ls("training:splitRatio:practice"));
  const copybook = Number(ls("training:splitRatio:copybook"));
  if (Number.isFinite(learn) || Number.isFinite(practice) || Number.isFinite(copybook)) {
    seed.trainingSplitRatio = {
      ...(Number.isFinite(learn) ? { learn } : {}),
      ...(Number.isFinite(practice) ? { practice } : {}),
      ...(Number.isFinite(copybook) ? { copybook } : {})
    };
  }

  const byBook: Record<string, UiPrefsBookSlice> = {};

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const wgSort = key.match(/^novel-helper-writing-guidance-sort-(.+)$/);
      if (wgSort) {
        const bookId = wgSort[1];
        const raw = ls(key);
        byBook[bookId] = {
          ...byBook[bookId],
          writingGuidance: {
            ...byBook[bookId]?.writingGuidance,
            sortDesc: raw === "desc"
          }
        };
        continue;
      }

      const wgNb = key.match(/^novel-helper-writing-guidance-active-notebook-(.+)$/);
      if (wgNb) {
        const bookId = wgNb[1];
        const raw = lsStoredString(key);
        if (raw) {
          byBook[bookId] = {
            ...byBook[bookId],
            writingGuidance: { ...byBook[bookId]?.writingGuidance, activeNotebookId: raw }
          };
        }
        continue;
      }

      const wgExp = key.match(/^novel-helper-writing-guidance-expanded-(.+)$/);
      if (wgExp) {
        const bookId = wgExp[1];
        const arr = parseJson<unknown>(ls(key));
        if (Array.isArray(arr)) {
          byBook[bookId] = {
            ...byBook[bookId],
            writingGuidance: {
              ...byBook[bookId]?.writingGuidance,
              expandedSessionIds: arr.filter((x): x is string => typeof x === "string")
            }
          };
        }
        continue;
      }

      const wgStar = key.match(/^novel-helper-writing-guidance-starred-only-(.+)$/);
      if (wgStar) {
        const bookId = wgStar[1];
        const raw = ls(key);
        byBook[bookId] = {
          ...byBook[bookId],
          writingGuidance: {
            ...byBook[bookId]?.writingGuidance,
            showStarredOnly: raw === "1"
          }
        };
        continue;
      }

      const notesSort = key.match(/^novel-helper-notes-sort-(.+)$/);
      if (notesSort) {
        const bookId = notesSort[1];
        const raw = ls(key);
        byBook[bookId] = {
          ...byBook[bookId],
          notes: { ...byBook[bookId]?.notes, sortDesc: raw === "desc" }
        };
        continue;
      }

      const notesCol = key.match(/^novel-helper-notes-collapsed-(.+)$/);
      if (notesCol) {
        const bookId = notesCol[1];
        const obj = parseJson<Record<string, boolean>>(ls(key));
        if (obj && typeof obj === "object") {
          byBook[bookId] = {
            ...byBook[bookId],
            notes: { ...byBook[bookId]?.notes, collapsed: obj }
          };
        }
        continue;
      }

      const notesNb = key.match(/^novel-helper-notes-active-notebook-(.+)$/);
      if (notesNb) {
        const bookId = notesNb[1];
        const raw = lsStoredString(key);
        if (raw) {
          byBook[bookId] = {
            ...byBook[bookId],
            notes: { ...byBook[bookId]?.notes, activeNotebookId: raw }
          };
        }
        continue;
      }

      const stageRatio = key.match(/^novel-helper-stage-split-ratio:(.+)$/);
      if (stageRatio) {
        const bookId = stageRatio[1];
        const n = Number(ls(key));
        if (Number.isFinite(n)) {
          byBook[bookId] = {
            ...byBook[bookId],
            outline: { ...byBook[bookId]?.outline, stageSplitRatio: n }
          };
        }
        continue;
      }

      const stageExp = key.match(/^novel-helper-stage-tree-expanded:(.+)$/);
      if (stageExp) {
        const bookId = stageExp[1];
        const arr = parseJson<unknown>(ls(key));
        if (Array.isArray(arr)) {
          byBook[bookId] = {
            ...byBook[bookId],
            outline: {
              ...byBook[bookId]?.outline,
              stageTreeExpandedIds: arr.filter((x): x is string => typeof x === "string")
            }
          };
        }
      }
    }
  } catch {
    // ignore
  }

  if (Object.keys(byBook).length) seed.byBook = byBook;
  return seed;
}

/** 迁移成功后清掉旧 key；主题 FOUC 缓存保留 */
export function clearMigratedLocalStorageKeys() {
  const fixed = [
    NAV_COLLAPSED_STORAGE_KEY,
    RIGHT_COLLAPSED_STORAGE_KEY,
    LAYOUT3_SPLIT_STORAGE_KEY,
    "novel-helper-shelf-tab",
    "novelHelper.mobileFontPx",
    "novelHelper.mobilePhoneW",
    "novel-helper.trainingGradingMode",
    "training:treeNavWidth",
    "training:splitRatio:learn",
    "training:splitRatio:practice",
    "training:splitRatio:copybook"
  ];
  for (const k of fixed) {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }

  const prefixes = [
    "novel-helper-writing-guidance-sort-",
    "novel-helper-writing-guidance-active-notebook-",
    "novel-helper-writing-guidance-expanded-",
    "novel-helper-writing-guidance-starred-only-",
    "novel-helper-notes-sort-",
    "novel-helper-notes-collapsed-",
    "novel-helper-notes-active-notebook-",
    "novel-helper-stage-split-ratio:",
    "novel-helper-stage-tree-expanded:"
  ];
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (prefixes.some((p) => key.startsWith(p))) toRemove.push(key);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

export function emptyUiPrefs(): UiPrefsFile {
  return { version: 1 };
}
