import { THEME_PRESETS, THEME_STORAGE_KEY, type ThemeId } from "../constants";

const THEME_IDS: ThemeId[] = THEME_PRESETS.map((p) => p.id);

export function isThemeId(v: string): v is ThemeId {
  return (THEME_IDS as string[]).includes(v);
}

export function migrateLegacyTheme(raw: string | null): ThemeId {
  if (raw && isThemeId(raw)) return raw;
  if (raw === "light") return "paper";
  if (raw === "dark" || raw === "default" || raw === "midnight") return "midnight";
  if (raw === "forest" || raw === "loam") return "forest";
  if (raw === "ocean") return "ocean";
  if (raw === "sunset") return "sunset";
  if (raw === "charcoal") return "charcoal";
  if (raw === "paper") return "paper";
  if (raw === "sepia" || raw === "clay" || raw === "village") return "sepia";
  if (raw === "meadow") return "meadow";
  if (raw === "system" || !raw) return "midnight";
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
