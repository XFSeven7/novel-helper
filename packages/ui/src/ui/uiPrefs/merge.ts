import type { UiPrefsBookSlice, UiPrefsFile, UiPrefsPatch } from "./types";

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

/** 客户端乐观合并（与服务端 mergeUiPrefs 语义对齐，不做 clamp） */
export function mergeUiPrefs(base: UiPrefsFile, patch: UiPrefsPatch): UiPrefsFile {
  const merged: UiPrefsFile = { ...base, ...patch, version: 1 };

  if (patch.layout3Splits) {
    // ponytail: 不填默认宽度，避免 pending PATCH 把未改字段盖成默认值
    merged.layout3Splits = { ...(base.layout3Splits ?? {}), ...patch.layout3Splits } as UiPrefsFile["layout3Splits"];
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

  return merged;
}
