import { THEME_STORAGE_KEY, type ThemeId } from "../constants";

const THEME_IDS: ThemeId[] = ["midnight", "forest", "ocean", "paper"];

export function isThemeId(v: string): v is ThemeId {
  return (THEME_IDS as string[]).includes(v);
}

function resolveSystemToPreset(): ThemeId {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "paper" : "midnight";
  } catch {
    return "midnight";
  }
}

export function migrateLegacyTheme(raw: string | null): ThemeId {
  if (raw && isThemeId(raw)) return raw;
  if (raw === "light") return "paper";
  if (raw === "dark" || raw === "default" || raw === "midnight") return "midnight";
  if (raw === "forest" || raw === "loam") return "forest";
  if (raw === "ocean" || raw === "sunset") return "ocean";
  if (raw === "paper" || raw === "sepia" || raw === "village" || raw === "meadow" || raw === "clay")
    return "paper";
  if (raw === "system" || !raw) return resolveSystemToPreset();
  return "midnight";
}

export function loadThemeId(): ThemeId {
  try {
    return migrateLegacyTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "midnight";
  }
}

export function saveThemeId(id: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function applyThemeToDocument(id: ThemeId) {
  document.documentElement.dataset.theme = id;
}
