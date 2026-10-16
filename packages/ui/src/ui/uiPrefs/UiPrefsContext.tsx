import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { getUiPrefs, patchUiPrefsApi } from "../api";
import { applyFontToDocument } from "../utils/fontStorage";
import { applyThemeToDocument, isThemeId, saveThemeId } from "../utils/themeStorage";
import {
  clearMigratedLocalStorageKeys,
  collectLocalStorageUiPrefsSeed,
  emptyUiPrefs
} from "./migrateFromLocalStorage";
import { isUiPrefsEmpty, mergeUiPrefs } from "./merge";
import type { UiPrefsBookSlice, UiPrefsFile, UiPrefsPatch } from "./types";

type UiPrefsContextValue = {
  prefs: UiPrefsFile;
  ready: boolean;
  patch: (p: UiPrefsPatch) => void;
};

const UiPrefsContext = createContext<UiPrefsContextValue | null>(null);

const DEBOUNCE_MS = 300;
export const EMPTY_STRING_ARR: string[] = [];
export const EMPTY_BOOL_RECORD: Record<string, boolean> = {};

function seedToPrefs(seed: UiPrefsPatch): UiPrefsFile {
  return mergeUiPrefs(emptyUiPrefs(), seed);
}

export function UiPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UiPrefsFile>(() => {
    const seed = collectLocalStorageUiPrefsSeed();
    const merged = seedToPrefs(seed);
    return isUiPrefsEmpty(merged) ? emptyUiPrefs() : merged;
  });
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<UiPrefsFile>(emptyUiPrefs());
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(async () => {
    const body = pendingRef.current;
    pendingRef.current = emptyUiPrefs();
    const { version: _v, ...rest } = body;
    if (Object.keys(rest).length === 0) return;
    try {
      const saved = await patchUiPrefsApi(rest);
      setPrefs(saved);
      if (saved.themeId && isThemeId(saved.themeId)) {
        saveThemeId(saved.themeId);
        applyThemeToDocument(saved.themeId);
      }
      if (saved.fontId) applyFontToDocument(saved.fontId);
    } catch {
      // 保留乐观本地态
    }
  }, []);

  const patch = useCallback(
    (p: UiPrefsPatch) => {
      setPrefs((prev) => mergeUiPrefs(prev, p));
      pendingRef.current = mergeUiPrefs(pendingRef.current, p);

      if (p.themeId && isThemeId(p.themeId)) {
        saveThemeId(p.themeId);
        applyThemeToDocument(p.themeId);
      }
      if (p.fontId) applyFontToDocument(p.fontId);

      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, DEBOUNCE_MS);
    },
    [flush]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const server = await getUiPrefs();
        if (cancelled) return;
        if (isUiPrefsEmpty(server)) {
          const seed = collectLocalStorageUiPrefsSeed();
          const seeded = seedToPrefs(seed);
          if (!isUiPrefsEmpty(seeded)) {
            const saved = await patchUiPrefsApi(seed);
            if (cancelled) return;
            setPrefs(saved);
            clearMigratedLocalStorageKeys();
            if (saved.themeId && isThemeId(saved.themeId)) {
              saveThemeId(saved.themeId);
              applyThemeToDocument(saved.themeId);
            }
            if (saved.fontId) applyFontToDocument(saved.fontId);
          } else {
            setPrefs(server);
          }
        } else {
          setPrefs(server);
          if (server.themeId && isThemeId(server.themeId)) {
            saveThemeId(server.themeId);
            applyThemeToDocument(server.themeId);
          }
          if (server.fontId) applyFontToDocument(server.fontId);
        }
      } catch {
        // 保持乐观本地种子
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const value = useMemo(() => ({ prefs, ready, patch }), [prefs, ready, patch]);

  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
}

export function useUiPrefs() {
  const ctx = useContext(UiPrefsContext);
  if (!ctx) throw new Error("useUiPrefs must be used within UiPrefsProvider");
  return ctx;
}

function applyUpdater<T>(updater: SetStateAction<T>, prev: T): T {
  return typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
}

/** 顶层标量 / 对象偏好 */
export function useUiPrefField<K extends keyof UiPrefsFile>(
  key: K,
  defaultValue: NonNullable<UiPrefsFile[K]>
): [NonNullable<UiPrefsFile[K]>, Dispatch<SetStateAction<NonNullable<UiPrefsFile[K]>>>] {
  const { prefs, patch } = useUiPrefs();
  const value = (prefs[key] ?? defaultValue) as NonNullable<UiPrefsFile[K]>;
  const setValue = useCallback(
    (updater: SetStateAction<NonNullable<UiPrefsFile[K]>>) => {
      const prev = (prefs[key] ?? defaultValue) as NonNullable<UiPrefsFile[K]>;
      const next = applyUpdater(updater, prev);
      patch({ [key]: next } as UiPrefsPatch);
    },
    [key, defaultValue, patch, prefs]
  );
  return [value, setValue];
}

type BookSliceKey = keyof UiPrefsBookSlice;

export function useBookUiPrefField<T>(
  bookId: string,
  slice: BookSliceKey,
  field: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const { prefs, patch } = useUiPrefs();
  const sliceObj = prefs.byBook?.[bookId]?.[slice] as Record<string, unknown> | undefined;
  const current = (sliceObj?.[field] as T | undefined) ?? undefined;
  const value = (current !== undefined ? current : defaultValue) as T;

  const setValue = useCallback(
    (updater: SetStateAction<T>) => {
      const sliceNow = prefs.byBook?.[bookId]?.[slice] as Record<string, unknown> | undefined;
      const prev = (sliceNow?.[field] as T | undefined) ?? defaultValue;
      const next = applyUpdater(updater, prev);
      patch({
        byBook: {
          [bookId]: {
            [slice]: {
              [field]: next
            }
          }
        }
      } as UiPrefsPatch);
    },
    [bookId, slice, field, defaultValue, patch, prefs]
  );

  return [value, setValue];
}
