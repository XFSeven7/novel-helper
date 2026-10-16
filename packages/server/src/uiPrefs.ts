import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "./dataDirContext.js";

export type UiPrefsLayout3Splits = {
  navW: number;
  guidanceW: number;
  rightW: number;
};

export type UiPrefsBookSlice = {
  writingGuidance?: {
    sortDesc?: boolean;
    activeNotebookId?: string;
    expandedSessionIds?: string[];
    showStarredOnly?: boolean;
  };
  notes?: {
    sortDesc?: boolean;
    collapsed?: Record<string, boolean>;
    activeNotebookId?: string;
  };
  outline?: {
    stageSplitRatio?: number;
    stageTreeExpandedIds?: string[];
  };
};

export type UiPrefsFile = {
  version: 1;
  navCollapsed?: boolean;
  rightCollapsed?: boolean;
  layout3Splits?: UiPrefsLayout3Splits;
  bookShelfSortDesc?: boolean;
  chapterSortDesc?: boolean;
  themeId?: string;
  shelfTab?: string;
  mobileFontPx?: number;
  mobilePhoneW?: number;
  trainingGradingMode?: string;
  trainingTreeNavWidth?: number;
  trainingSplitRatio?: {
    learn?: number;
    practice?: number;
    copybook?: number;
  };
  byBook?: Record<string, UiPrefsBookSlice>;
};

const GUIDANCE_W_MIN = 280;
const GUIDANCE_W_MAX = 560;
const RIGHT_W_MIN = 320;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function settingsDir() {
  return path.join(getDataDir(), "_settings");
}

function prefsPath() {
  return path.join(settingsDir(), "ui-prefs.json");
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function asString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  // 兼容旧 localStorage JSON.stringify 残留的 "\"default\""
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try {
      const inner = JSON.parse(v);
      if (typeof inner === "string") return inner;
    } catch {
      // keep raw
    }
  }
  return v;
}

function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

function normalizeSplits(raw: unknown): UiPrefsLayout3Splits | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const navW = asFiniteNumber(o.navW);
  const guidanceW = asFiniteNumber(o.guidanceW);
  const rightW = asFiniteNumber(o.rightW);
  if (navW === undefined && guidanceW === undefined && rightW === undefined) return undefined;
  return {
    navW: clamp(navW ?? 320, 240, 560),
    guidanceW: clamp(guidanceW ?? 400, GUIDANCE_W_MIN, GUIDANCE_W_MAX),
    rightW: clamp(rightW ?? 420, RIGHT_W_MIN, 720)
  };
}

function normalizeBookSlice(raw: unknown): UiPrefsBookSlice | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: UiPrefsBookSlice = {};

  if (o.writingGuidance && typeof o.writingGuidance === "object") {
    const g = o.writingGuidance as Record<string, unknown>;
    out.writingGuidance = {
      sortDesc: asBool(g.sortDesc),
      activeNotebookId: asString(g.activeNotebookId),
      expandedSessionIds: asStringArray(g.expandedSessionIds),
      showStarredOnly: asBool(g.showStarredOnly)
    };
  }
  if (o.notes && typeof o.notes === "object") {
    const n = o.notes as Record<string, unknown>;
    let collapsed: Record<string, boolean> | undefined;
    if (n.collapsed && typeof n.collapsed === "object" && !Array.isArray(n.collapsed)) {
      collapsed = {};
      for (const [k, v] of Object.entries(n.collapsed as Record<string, unknown>)) {
        if (typeof v === "boolean") collapsed[k] = v;
      }
    }
    out.notes = {
      sortDesc: asBool(n.sortDesc),
      collapsed,
      activeNotebookId: asString(n.activeNotebookId)
    };
  }
  if (o.outline && typeof o.outline === "object") {
    const ol = o.outline as Record<string, unknown>;
    const ratio = asFiniteNumber(ol.stageSplitRatio);
    out.outline = {
      stageSplitRatio: ratio === undefined ? undefined : clamp(ratio, 0.32, 0.68),
      stageTreeExpandedIds: asStringArray(ol.stageTreeExpandedIds)
    };
  }

  if (!out.writingGuidance && !out.notes && !out.outline) return undefined;
  return out;
}

export function normalizeUiPrefs(raw: unknown): UiPrefsFile {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const trainingSplit =
    o.trainingSplitRatio && typeof o.trainingSplitRatio === "object"
      ? (o.trainingSplitRatio as Record<string, unknown>)
      : null;

  let byBook: Record<string, UiPrefsBookSlice> | undefined;
  if (o.byBook && typeof o.byBook === "object" && !Array.isArray(o.byBook)) {
    byBook = {};
    for (const [bookId, slice] of Object.entries(o.byBook as Record<string, unknown>)) {
      const id = String(bookId || "").trim();
      if (!id) continue;
      const norm = normalizeBookSlice(slice);
      if (norm) byBook[id] = norm;
    }
    if (Object.keys(byBook).length === 0) byBook = undefined;
  }

  const treeW = asFiniteNumber(o.trainingTreeNavWidth);
  const fontPx = asFiniteNumber(o.mobileFontPx);
  const phoneW = asFiniteNumber(o.mobilePhoneW);

  return {
    version: 1,
    navCollapsed: asBool(o.navCollapsed),
    rightCollapsed: asBool(o.rightCollapsed),
    layout3Splits: normalizeSplits(o.layout3Splits),
    bookShelfSortDesc: asBool(o.bookShelfSortDesc),
    chapterSortDesc: asBool(o.chapterSortDesc),
    themeId: asString(o.themeId),
    shelfTab: asString(o.shelfTab),
    mobileFontPx: fontPx === undefined ? undefined : clamp(fontPx, 14, 28),
    mobilePhoneW: phoneW === undefined ? undefined : clamp(phoneW, 280, 720),
    trainingGradingMode: asString(o.trainingGradingMode),
    trainingTreeNavWidth: treeW === undefined ? undefined : clamp(treeW, 140, 420),
    trainingSplitRatio: trainingSplit
      ? {
          learn:
            asFiniteNumber(trainingSplit.learn) === undefined
              ? undefined
              : clamp(asFiniteNumber(trainingSplit.learn)!, 0.25, 0.75),
          practice:
            asFiniteNumber(trainingSplit.practice) === undefined
              ? undefined
              : clamp(asFiniteNumber(trainingSplit.practice)!, 0.25, 0.75),
          copybook:
            asFiniteNumber(trainingSplit.copybook) === undefined
              ? undefined
              : clamp(asFiniteNumber(trainingSplit.copybook)!, 0.25, 0.75)
        }
      : undefined,
    byBook
  };
}

/** 除 version 外没有任何已知偏好 */
export function isUiPrefsEmpty(prefs: UiPrefsFile): boolean {
  const keys = Object.keys(prefs).filter((k) => k !== "version");
  for (const k of keys) {
    const v = (prefs as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    return false;
  }
  return true;
}

export function mergeUiPrefs(base: UiPrefsFile, patch: Partial<UiPrefsFile>): UiPrefsFile {
  const merged: Record<string, unknown> = { ...base, ...patch, version: 1 };

  if (patch.layout3Splits) {
    merged.layout3Splits = { ...(base.layout3Splits ?? {}), ...patch.layout3Splits };
  }
  if (patch.trainingSplitRatio) {
    merged.trainingSplitRatio = { ...(base.trainingSplitRatio ?? {}), ...patch.trainingSplitRatio };
  }
  if (patch.byBook) {
    const nextByBook: Record<string, UiPrefsBookSlice> = { ...(base.byBook ?? {}) };
    for (const [bookId, bookPatch] of Object.entries(patch.byBook)) {
      if (!bookPatch) continue;
      const prev = nextByBook[bookId] ?? {};
      nextByBook[bookId] = {
        ...prev,
        ...bookPatch,
        writingGuidance: bookPatch.writingGuidance
          ? { ...(prev.writingGuidance ?? {}), ...bookPatch.writingGuidance }
          : prev.writingGuidance,
        notes: bookPatch.notes ? { ...(prev.notes ?? {}), ...bookPatch.notes } : prev.notes,
        outline: bookPatch.outline ? { ...(prev.outline ?? {}), ...bookPatch.outline } : prev.outline
      };
    }
    merged.byBook = nextByBook;
  }

  return normalizeUiPrefs(merged);
}

export async function readUiPrefs(): Promise<UiPrefsFile> {
  try {
    const raw = JSON.parse(await fs.readFile(prefsPath(), "utf8"));
    return normalizeUiPrefs(raw);
  } catch {
    return { version: 1 };
  }
}

export async function patchUiPrefs(patch: Partial<UiPrefsFile>): Promise<UiPrefsFile> {
  const current = await readUiPrefs();
  const next = mergeUiPrefs(current, patch);
  await fs.mkdir(settingsDir(), { recursive: true });
  await fs.writeFile(prefsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
